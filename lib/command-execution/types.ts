/**
 * Command Execution Types
 * 
 * TypeScript interfaces for the command execution module.
 */

/**
 * Options for executing a command
 */
export interface ExecuteOptions {
  /** Command to execute (e.g., 'npm', 'git', 'ls') */
  command: string;
  /** Command arguments (e.g., ['run', 'build']) */
  args: string[];
  /** Working directory - must be within synced folders */
  cwd: string;
  /** Character/agent ID for folder validation */
  characterId: string;
  /** Maximum execution time in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum output buffer size in bytes (default: 1048576 = 1MB) */
  maxOutputSize?: number;
  /** Explicit confirmation required for removal commands (rm/rmdir/del/...) */
  confirmRemoval?: boolean;
}

/**
 * Result of command execution
 */
export interface ExecuteResult {
  /** Whether the command executed successfully (exit code 0) */
  success: boolean;
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code (null if process was killed) */
  exitCode: number | null;
  /** Signal that killed the process (if any) */
  signal: string | null;
  /** Error message if execution failed */
  error?: string;
  /** Execution time in milliseconds */
  executionTime?: number;
  /** Log ID for persistent storage */
  logId?: string;
  /** Whether the output was truncated in context */
  isTruncated?: boolean;
}

/**
 * Validation result for paths and commands
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Resolved/normalized path (if valid) */
  resolvedPath?: string;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * Options for the AI tool wrapper
 */
export interface ExecuteCommandToolOptions {
  /** Session ID for context */
  sessionId: string;
  /** Character/agent ID for folder access */
  characterId?: string | null;
}

/**
 * Input schema for the executeCommand AI tool
 */
export interface ExecuteCommandInput {
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory (must be within synced folders) */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Run in background and return processId immediately */
  background?: boolean;
  /** Process ID to check status of a background process (instead of executing a new command) */
  processId?: string;
  /** Explicit confirmation required for removal commands (rm/rmdir/del/...) */
  confirmRemoval?: boolean;
}

/**
 * Result type for the executeCommand AI tool
 */
export interface ExecuteCommandToolResult {
  /** Execution status */
  status: "success" | "error" | "no_folders" | "blocked" | "running" | "background_started";
  /** Standard output */
  stdout?: string;
  /** Standard error */
  stderr?: string;
  /** Exit code */
  exitCode?: number | null;
  /** Execution time in milliseconds */
  executionTime?: number;
  /** User-friendly message */
  message?: string;
  /** Error details */
  error?: string;
  /** Process ID for background processes */
  processId?: string;
  /** Log ID for persistent storage */
  logId?: string;
  /** Whether the output was truncated in context */
  isTruncated?: boolean;
}

/**
 * Info about a background process being tracked
 */
export interface BackgroundProcessInfo {
  /** Unique process identifier */
  id: string;
  /** The command that was executed */
  command: string;
  /** Command arguments */
  args: string[];
  /** Working directory */
  cwd: string;
  /** When the process started */
  startedAt: number;
  /** Whether the process is still running */
  running: boolean;
  /** Accumulated stdout */
  stdout: string;
  /** Accumulated stderr */
  stderr: string;
  /** Exit code (null if still running) */
  exitCode: number | null;
  /** Signal that killed the process */
  signal: string | null;
  /** The child process reference */
  process: import("child_process").ChildProcess;
  /** Timeout timer reference */
  timeoutId: NodeJS.Timeout | null;
  /** Log ID for persistent storage */
  logId?: string;
}

/**
 * Log entry for command execution
 */
export interface CommandLogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error" | "security";
  category: "command_execution";
  event: string;
  data: Record<string, unknown>;
  userId?: string;
  characterId?: string;
  sessionId?: string;
}
