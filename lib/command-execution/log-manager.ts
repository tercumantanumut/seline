/**
 * Terminal Log Manager
 * 
 * Handles persistent storage of command execution outputs in the Electron userData directory.
 * Implements smart truncation (middle-truncation) for LLM context management.
 */

import * as fs from "fs";
import * as path from "path";
import { nanoid } from "nanoid";

/**
 * Configuration for log management
 */
const MAX_CONTEXT_LINES = 1000; // Max lines to keep in context (head + tail)
const HEAD_LINES = 500;        // Lines to keep from the beginning
const TAIL_LINES = 500;        // Lines to keep from the end

/**
 * Get the path to the terminal logs directory
 * Uses LOCAL_DATA_PATH (userData/data) which is set in electron/main.ts
 */
function getLogsDir(): string {
    const baseDir = process.env.LOCAL_DATA_PATH || path.join(process.cwd(), ".local-data", "data");
    const logsDir = path.join(baseDir, "logs", "terminal");
    
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    
    return logsDir;
}

/**
 * Save full output to a persistent log file
 * @param stdout - Full standard output
 * @param stderr - Full standard error
 * @returns Unique log ID
 */
export function saveTerminalLog(stdout: string, stderr: string): string {
    const logId = nanoid();
    const logsDir = getLogsDir();
    const logPath = path.join(logsDir, `${logId}.log`);
    
    const content = `=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}`;
    
    try {
        fs.writeFileSync(logPath, content, "utf8");
        return logId;
    } catch (error) {
        console.error(`[TerminalLogManager] Failed to save log ${logId}:`, error);
        return "";
    }
}

/**
 * Read a full log file by ID
 * @param logId - The log ID to retrieve
 * @returns Full log content or null if not found
 */
export function readTerminalLog(logId: string): string | null {
    if (!logId) return null;
    
    const logPath = path.join(getLogsDir(), `${logId}.log`);
    
    try {
        if (fs.existsSync(logPath)) {
            return fs.readFileSync(logPath, "utf8");
        }
    } catch (error) {
        console.error(`[TerminalLogManager] Failed to read log ${logId}:`, error);
    }
    
    return null;
}

/**
 * Smart middle-truncation for terminal output
 * Keeps the head and tail of the output to preserve context and exit status.
 */
export function truncateOutput(text: string, maxLines = MAX_CONTEXT_LINES): { 
    content: string; 
    isTruncated: boolean;
    originalLineCount: number;
} {
    if (!text) return { content: "", isTruncated: false, originalLineCount: 0 };
    
    const lines = text.split("\n");
    const originalLineCount = lines.length;
    
    if (originalLineCount <= maxLines) {
        return { content: text, isTruncated: false, originalLineCount };
    }
    
    const head = lines.slice(0, HEAD_LINES);
    const tail = lines.slice(-TAIL_LINES);
    
    const truncatedContent = [
        ...head,
        `\n... [TRUNCATED ${originalLineCount - maxLines} LINES] ...\n`,
        ...tail
    ].join("\n");
    
    return { 
        content: truncatedContent, 
        isTruncated: true, 
        originalLineCount 
    };
}
