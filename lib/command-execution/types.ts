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
}

/**
 * Result type for the executeCommand AI tool
 */
export interface ExecuteCommandToolResult {
  /** Execution status */
  status: "success" | "error" | "no_folders" | "blocked";
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
