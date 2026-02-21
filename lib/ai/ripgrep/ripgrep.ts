/**
 * ripgrep Wrapper
 * 
 * Core wrapper around vscode-ripgrep for fast pattern searching.
 * ripgrep is a line-oriented search tool that recursively searches directories
 * for regex/text patterns. It respects .gitignore and skips binary files by default.
 */

import { spawn } from "child_process";
import { rgPath } from "@vscode/ripgrep";
import { isEBADFError, spawnWithFileCapture } from "@/lib/spawn-utils";

export interface RipgrepMatch {
    file: string;
    line: number;
    column: number;
    text: string;
    beforeContext?: string[];
    afterContext?: string[];
}

export interface RipgrepSearchResult {
    /** The matched results (limited to maxResults) */
    matches: RipgrepMatch[];
    /** Total number of matches found before limiting */
    totalMatches: number;
    /** Whether results were truncated due to maxResults limit */
    wasTruncated: boolean;
}

export interface RipgrepOptions {
    /** Pattern to search for */
    pattern: string;
    /** Paths to search (any valid file/folder paths) */
    paths: string[];
    /** Treat pattern as regex (default: false = literal search) */
    regex?: boolean;
    /** Case-insensitive search (default: true) */
    caseInsensitive?: boolean;
    /** Maximum number of results (default: 20) */
    maxResults?: number;
    /** File extensions to include, e.g., ["ts", "js", "py"] */
    fileTypes?: string[];
    /** Glob patterns to include/exclude, e.g., ["*.config.*", "!node_modules"] */
    globs?: string[];
    /** Number of context lines before/after match (default: 2) */
    contextLines?: number;
    /** Respect .gitignore files (default: true) */
    respectGitignore?: boolean;
    /** Include hidden files/directories (default: false) */
    includeHidden?: boolean;
}

interface RipgrepJsonMatch {
    type: "match";
    data: {
        path: { text: string };
        lines: { text: string };
        line_number: number;
        absolute_offset: number;
        submatches: Array<{
            match: { text: string };
            start: number;
            end: number;
        }>;
    };
}

interface RipgrepJsonContext {
    type: "context";
    data: {
        path: { text: string };
        lines: { text: string };
        line_number: number;
    };
}

interface RipgrepJsonBegin {
    type: "begin";
    data: { path: { text: string } };
}

interface RipgrepJsonEnd {
    type: "end";
    data: { path: { text: string }; stats?: unknown };
}

interface RipgrepJsonSummary {
    type: "summary";
    data: { elapsed_total: { secs: number; nanos: number }; stats: unknown };
}

type RipgrepJsonLine = RipgrepJsonMatch | RipgrepJsonContext | RipgrepJsonBegin | RipgrepJsonEnd | RipgrepJsonSummary;

/**
 * Search for patterns using ripgrep
 */
export async function searchWithRipgrep(options: RipgrepOptions): Promise<RipgrepSearchResult> {
    const {
        pattern,
        paths,
        regex = false,
        caseInsensitive = true,
        maxResults = 20,
        fileTypes,
        globs,
        contextLines = 2,
        respectGitignore = true,
        includeHidden = false,
    } = options;

    if (!pattern || pattern.trim() === "") {
        return { matches: [], totalMatches: 0, wasTruncated: false };
    }

    if (!paths || paths.length === 0) {
        return { matches: [], totalMatches: 0, wasTruncated: false };
    }

    // Build ripgrep arguments
    const args: string[] = [
        "--json",           // JSON output for parsing
        "--line-number",    // Include line numbers
        "--column",         // Include column numbers
    ];

    // Add context lines
    if (contextLines > 0) {
        args.push(`--context=${contextLines}`);
    }

    // Case sensitivity
    if (caseInsensitive) {
        args.push("--ignore-case");
    }

    // Max results (ripgrep uses --max-count per file, we'll filter after)
    // Use a higher limit and slice results later for better control
    args.push(`--max-count=${maxResults * 2}`);

    // Regex or literal
    if (!regex) {
        args.push("--fixed-strings");
    }

    // File type filters
    if (fileTypes && fileTypes.length > 0) {
        for (const ext of fileTypes) {
            args.push("--glob", `*.${ext}`);
        }
    }

    // Glob patterns
    if (globs && globs.length > 0) {
        for (const glob of globs) {
            args.push("--glob", glob);
        }
    }

    // Gitignore handling
    if (!respectGitignore) {
        args.push("--no-ignore");
    }

    // Hidden files
    if (includeHidden) {
        args.push("--hidden");
    }

    // Add pattern and paths
    args.push("--", pattern, ...paths);

    console.log(`[ripgrep] Searching with: rg ${args.join(" ")}`);

    // Parse ripgrep JSON output into matches
    const parseRgOutput = (stdout: string, stderr: string, exitCode: number | null): RipgrepSearchResult => {
        if (exitCode === 2) {
            throw new Error(`ripgrep error: ${stderr}`);
        }

        const results: RipgrepMatch[] = [];
        const contextBuffer: Map<string, { before: string[]; after: string[] }> = new Map();
        let currentFile = "";
        const lines = stdout.split("\n").filter((line) => line.trim());

        for (const line of lines) {
            try {
                const json = JSON.parse(line) as RipgrepJsonLine;

                if (json.type === "begin") {
                    currentFile = json.data.path.text;
                    contextBuffer.set(currentFile, { before: [], after: [] });
                } else if (json.type === "context") {
                    const ctx = contextBuffer.get(currentFile);
                    if (ctx) {
                        ctx.before.push(json.data.lines.text.trimEnd());
                        if (ctx.before.length > contextLines) {
                            ctx.before.shift();
                        }
                    }
                } else if (json.type === "match") {
                    const ctx = contextBuffer.get(currentFile);
                    const match: RipgrepMatch = {
                        file: json.data.path.text,
                        line: json.data.line_number,
                        column: json.data.submatches[0]?.start ?? 0,
                        text: json.data.lines.text.trimEnd(),
                        beforeContext: ctx?.before.slice() || [],
                        afterContext: [],
                    };
                    results.push(match);
                    if (ctx) { ctx.before = []; }
                }
            } catch {
                // Skip invalid JSON lines
            }
        }

        const limitedResults = results.slice(0, maxResults);
        const wasTruncated = results.length > maxResults;

        console.log(`[ripgrep] Found ${results.length} matches, returning ${limitedResults.length}`);
        return { matches: limitedResults, totalMatches: results.length, wasTruncated };
    };

    // Try normal spawn; fall back to file-capture on EBADF (macOS Electron utilityProcess)
    return new Promise((resolve, reject) => {
        let rg: ReturnType<typeof spawn>;
        try {
            rg = spawn(rgPath, args);
        } catch (spawnErr) {
            if (isEBADFError(spawnErr) && process.platform === "darwin") {
                console.warn("[ripgrep] spawn() threw EBADF – retrying with file-capture fallback");
                spawnWithFileCapture(rgPath, args, paths[0] || process.cwd(), process.env as NodeJS.ProcessEnv, 30_000, 10 * 1024 * 1024)
                    .then((fb) => resolve(parseRgOutput(fb.stdout, fb.stderr, fb.exitCode)))
                    .catch(reject);
                return;
            }
            reject(spawnErr);
            return;
        }

        let stdout = "";
        let stderr = "";

        rg.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
        rg.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

        rg.on("close", (code) => {
            try {
                resolve(parseRgOutput(stdout, stderr, code));
            } catch (err) {
                reject(err);
            }
        });

        rg.on("error", (err) => {
            if (isEBADFError(err) && process.platform === "darwin") {
                console.warn("[ripgrep] spawn EBADF on error event – retrying with file-capture fallback");
                spawnWithFileCapture(rgPath, args, paths[0] || process.cwd(), process.env as NodeJS.ProcessEnv, 30_000, 10 * 1024 * 1024)
                    .then((fb) => resolve(parseRgOutput(fb.stdout, fb.stderr, fb.exitCode)))
                    .catch(reject);
                return;
            }
            console.error("[ripgrep] Spawn error:", err);
            reject(err);
        });
    });
}

/**
 * Check if ripgrep is available
 */
export function isRipgrepAvailable(): boolean {
    try {
        // rgPath is the path to the ripgrep binary bundled with vscode-ripgrep
        return typeof rgPath === "string" && rgPath.length > 0;
    } catch {
        return false;
    }
}

/**
 * Get the path to the ripgrep binary
 */
export function getRipgrepPath(): string {
    return rgPath;
}
