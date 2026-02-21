/**
 * Local Grep Tool
 * 
 * AI tool for fast pattern searching using ripgrep.
 * Complements vector search with exact/regex pattern matching.
 */

import { tool, jsonSchema } from "ai";
import { searchWithRipgrep, isRipgrepAvailable, type RipgrepMatch, type RipgrepSearchResult } from "./ripgrep";
import { getSyncFolders } from "@/lib/vectordb/sync-service";
import { loadSettings } from "@/lib/settings/settings-manager";
import { logToolEvent } from "@/lib/ai/tool-registry";

export interface LocalGrepToolOptions {
    sessionId: string;
    characterId?: string | null;
}

/**
 * Input schema for the localGrep tool
 */
interface LocalGrepInput {
    pattern: string;
    paths?: string[];
    regex?: boolean;
    caseInsensitive?: boolean;
    maxResults?: number;
    fileTypes?: string[];
    contextLines?: number;
}

/**
 * Result type for the localGrep tool
 */
interface LocalGrepResult {
    status: "success" | "error" | "disabled" | "no_paths";
    matchCount?: number;
    /** Total matches found before limiting (may be higher than matchCount) */
    totalMatchCount?: number;
    /** Whether results were truncated due to maxResults limit */
    wasTruncated?: boolean;
    pattern?: string;
    regex?: boolean;
    searchedPaths?: string[];
    results?: string;
    matches?: Array<{ file: string; line: number; text: string }>;
    message?: string;
    error?: string;
}

function buildRegexErrorHint(pattern: string, errorMessage: string): string {
    const normalizedError = errorMessage.toLowerCase();
    const isRegexParseError =
        normalizedError.includes("regex parse") ||
        normalizedError.includes("error parsing regex") ||
        normalizedError.includes("unclosed group") ||
        normalizedError.includes("unclosed character class") ||
        normalizedError.includes("unmatched") ||
        normalizedError.includes("repetition");

    if (!isRegexParseError) {
        return errorMessage;
    }

    return `${errorMessage}\nHint: Your pattern was interpreted as regex and could not be parsed. ` +
        `If you intended a literal search, set regex: false. ` +
        `If you need regex mode, escape metacharacters (e.g., \"${pattern}\" -> \"${pattern.replace(/([()\[\]{}\\])/g, "\\$1")}\").`;
}

/**
 * Format ripgrep matches for AI consumption
 */
function formatResults(searchResult: RipgrepSearchResult, query: string): string {
    const { matches, totalMatches, wasTruncated } = searchResult;

    if (matches.length === 0) {
        return `No matches found for pattern: "${query}"`;
    }

    const groupedByFile = new Map<string, RipgrepMatch[]>();
    for (const match of matches) {
        const existing = groupedByFile.get(match.file) || [];
        existing.push(match);
        groupedByFile.set(match.file, existing);
    }

    // Show total vs displayed count when truncated
    let output: string;
    if (wasTruncated) {
        output = `Found ${totalMatches} total matches, showing ${matches.length} in ${groupedByFile.size} files for: "${query}"\n`;
        output += `⚠️ Results were truncated. Increase maxResults or refine your search pattern to see more.\n\n`;
    } else {
        output = `Found ${matches.length} matches in ${groupedByFile.size} files for: "${query}"\n\n`;
    }

    for (const [file, fileMatches] of groupedByFile) {
        output += `📄 ${file}\n`;
        output += "─".repeat(Math.min(file.length + 3, 60)) + "\n";

        for (const match of fileMatches) {
            // Show context before
            if (match.beforeContext && match.beforeContext.length > 0) {
                for (const ctx of match.beforeContext) {
                    output += `   ${ctx}\n`;
                }
            }

            // Show match with line number
            output += `${match.line}│ ${match.text}\n`;

            // Show context after
            if (match.afterContext && match.afterContext.length > 0) {
                for (const ctx of match.afterContext) {
                    output += `   ${ctx}\n`;
                }
            }

            output += "\n";
        }
        output += "\n";
    }

    return output.trim();
}

/**
 * JSON Schema definition for the localGrep tool
 */
const localGrepSchema = jsonSchema<LocalGrepInput>({
    type: "object",
    properties: {
        pattern: {
            type: "string",
            description: "Search pattern (exact text or regex). Examples: 'getUserById', 'async.*await', 'TODO:'",
        },
        paths: {
            type: "array",
            items: { type: "string" },
            description: "Paths to search. If omitted, searches agent's synced folders. Can be files or directories.",
        },
        regex: {
            type: "boolean",
            default: false,
            description: "Treat pattern as regex (default: false = literal text search)",
        },
        caseInsensitive: {
            type: "boolean",
            default: true,
            description: "Ignore case (default: true)",
        },
        maxResults: {
            type: "number",
            default: 20,
            description: "Maximum results to return (default: 20)",
        },
        fileTypes: {
            type: "array",
            items: { type: "string" },
            description: "File extensions to include, e.g., ['ts', 'js', 'py']. Omit for all files.",
        },
        contextLines: {
            type: "number",
            default: 2,
            description: "Lines of context before/after each match (default: 2)",
        },
    },
    required: ["pattern"],
    additionalProperties: false,
});

/**
 * Create the localGrep AI tool
 */
export function createLocalGrepTool(options: LocalGrepToolOptions) {
    const { characterId } = options;

    return tool({
        description: `Search for exact text or regex patterns in files using ripgrep.
Use tight queries first to avoid noisy output: specific pattern, narrow paths/fileTypes,
and small maxResults/contextLines before expanding.

Unlike vectorSearch (semantic/conceptual), localGrep finds EXACT matches with line numbers.
If no paths specified, searches the agent's synced folders.
Respects .gitignore and skips binary files by default.`,

        inputSchema: localGrepSchema,

        execute: async (input): Promise<LocalGrepResult> => {
            // Handle common AI parameter mistakes:
            // - query → pattern (AI often uses "query" instead of "pattern")
            // - type → fileTypes (AI may pass single type instead of array)
            // - fileTypes as JSON string instead of array (e.g., "[\"ts\", \"tsx\"]")
            const rawInput = input as unknown as Record<string, unknown>;
            const pattern = input.pattern || (rawInput.query as string | undefined);

            // Parse fileTypes - ALWAYS validate type (AI might pass string instead of array)
            let fileTypes: string[] | undefined;
            const rawFileTypes = input.fileTypes ?? rawInput.fileTypes ?? rawInput.type;

            if (rawFileTypes) {
                if (Array.isArray(rawFileTypes)) {
                    // Already an array, ensure all elements are strings
                    fileTypes = rawFileTypes.map(String);
                } else if (typeof rawFileTypes === "string") {
                    // Try to parse as JSON array first (e.g., "[\"ts\", \"tsx\"]")
                    if (rawFileTypes.startsWith("[")) {
                        try {
                            const parsed = JSON.parse(rawFileTypes);
                            if (Array.isArray(parsed)) {
                                fileTypes = parsed.map(String);
                            }
                        } catch {
                            // Not valid JSON, treat as single type
                            fileTypes = [rawFileTypes];
                        }
                    } else {
                        // Single type string (e.g., "ts")
                        fileTypes = [rawFileTypes];
                    }
                }
            }

            // Parse paths - ALWAYS validate type (AI might pass string instead of array)
            let paths: string[] | undefined;
            const rawPaths = input.paths ?? (rawInput.paths as unknown);

            if (rawPaths) {
                if (Array.isArray(rawPaths)) {
                    paths = rawPaths.map(String);
                } else if (typeof rawPaths === "string") {
                    // Try to parse as JSON array first (e.g., "[\"path1\", \"path2\"]")
                    if (rawPaths.startsWith("[")) {
                        try {
                            const parsed = JSON.parse(rawPaths);
                            if (Array.isArray(parsed)) {
                                paths = parsed.map(String);
                            }
                        } catch {
                            // Not valid JSON, treat as single path
                            paths = [rawPaths];
                        }
                    } else {
                        // Single path string
                        paths = [rawPaths];
                    }
                }
            }

            const {
                regex = false,
                caseInsensitive = true,
                maxResults = 20,
                contextLines = 2,
            } = input;

            // Validate pattern is provided
            if (!pattern || typeof pattern !== "string" || pattern.trim() === "") {
                const errorMessage = "Missing or invalid pattern. Use: localGrep({ pattern: \"your-search-term\" })";
                logToolEvent({
                    level: "error",
                    toolName: "localGrep",
                    event: "error",
                    error: errorMessage,
                    metadata: { searchPath: "native_localgrep" },
                });

                return {
                    status: "error",
                    error: errorMessage,
                };
            }

            // Honor explicit/implicit literal default contract:
            // regex=true -> regex mode, otherwise literal mode.
            const isRegex = regex === true;

            // Check if ripgrep is available
            if (!isRipgrepAvailable()) {
                const errorMessage = "ripgrep is not available. The vscode-ripgrep package may not be installed correctly.";
                logToolEvent({
                    level: "error",
                    toolName: "localGrep",
                    event: "error",
                    error: errorMessage,
                    metadata: { searchPath: "native_localgrep" },
                });

                return {
                    status: "error",
                    error: errorMessage,
                };
            }

            // Load settings
            const settings = loadSettings();
            const enabled = settings.localGrepEnabled ?? true;
            if (!enabled) {
                logToolEvent({
                    level: "warn",
                    toolName: "localGrep",
                    event: "error",
                    error: "Local Grep is disabled in settings.",
                    metadata: { searchPath: "native_localgrep" },
                });

                return {
                    status: "disabled",
                    message: "Local Grep is disabled in settings.",
                };
            }

            // Determine search paths
            let searchPaths = paths || [];

            if (searchPaths.length === 0 && characterId) {
                // Default to synced folders for this agent
                try {
                    const folders = await getSyncFolders(characterId);
                    searchPaths = folders.map((f) => f.folderPath);

                    if (searchPaths.length === 0) {
                        const message =
                            "No paths specified and no synced folders found for this agent. Please specify paths to search or add synced folders in the agent settings.";
                        logToolEvent({
                            level: "warn",
                            toolName: "localGrep",
                            event: "error",
                            error: message,
                            metadata: { searchPath: "native_localgrep" },
                        });

                        return {
                            status: "no_paths",
                            message,
                        };
                    }
                } catch {
                    const errorMessage = "Failed to retrieve synced folders. Please specify paths to search explicitly.";
                    logToolEvent({
                        level: "error",
                        toolName: "localGrep",
                        event: "error",
                        error: errorMessage,
                        metadata: { searchPath: "native_localgrep" },
                    });

                    return {
                        status: "error",
                        error: errorMessage,
                    };
                }
            } else if (searchPaths.length === 0) {
                const message = "No paths specified. Please provide paths to search.";
                logToolEvent({
                    level: "warn",
                    toolName: "localGrep",
                    event: "error",
                    error: message,
                    metadata: { searchPath: "native_localgrep" },
                });

                return {
                    status: "no_paths",
                    message,
                };
            }

            try {
                const searchResult = await searchWithRipgrep({
                    pattern,
                    paths: searchPaths,
                    regex: isRegex,
                    caseInsensitive,
                    maxResults: maxResults ?? settings.localGrepMaxResults ?? 20,
                    fileTypes,
                    contextLines: contextLines ?? settings.localGrepContextLines ?? 2,
                    respectGitignore: settings.localGrepRespectGitignore ?? true,
                });

                const formattedOutput = formatResults(searchResult, pattern);

                logToolEvent({
                    level: "info",
                    toolName: "localGrep",
                    event: "success",
                    metadata: {
                        searchPath: "native_localgrep",
                        pattern,
                        regex: isRegex,
                        matchCount: searchResult.matches.length,
                    },
                });

                return {
                    status: "success",
                    matchCount: searchResult.matches.length,
                    totalMatchCount: searchResult.totalMatches,
                    wasTruncated: searchResult.wasTruncated,
                    pattern,
                    regex: isRegex,
                    searchedPaths: searchPaths,
                    results: formattedOutput,
                    // Also include structured data for potential further processing
                    matches: searchResult.matches.slice(0, 20).map((m: RipgrepMatch) => ({
                        file: m.file,
                        line: m.line,
                        text: m.text.slice(0, 200), // Truncate long lines
                    })),
                };
            } catch (error) {
                const rawError = error instanceof Error ? error.message : "Search failed";
                const enrichedError = isRegex ? buildRegexErrorHint(pattern, rawError) : rawError;

                logToolEvent({
                    level: "error",
                    toolName: "localGrep",
                    event: "error",
                    error: enrichedError,
                    metadata: {
                        searchPath: "native_localgrep",
                        pattern,
                        regex: isRegex,
                    },
                });

                return {
                    status: "error",
                    error: enrichedError,
                };
            }
        },
    });
}
