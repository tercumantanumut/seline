/**
 * Command Execution Module
 * 
 * Sandboxed command execution for Seline.
 * Allows AI tools to run shell commands safely within synced directories.
 */

// Export types
export type {
    ExecuteOptions,
    ExecuteResult,
    ValidationResult,
    ExecuteCommandToolOptions,
    ExecuteCommandInput,
    ExecuteCommandToolResult,
    CommandLogEntry,
    BackgroundProcessInfo,
} from "./types";

// Export validator functions
export {
    validateCommand,
    validateExecutionDirectory,
    isCommandBlocked,
    getBlockedCommands,
} from "./validator";

// Export executor functions
export {
    executeCommand,
    executeCommandWithValidation,
    startBackgroundProcess,
    getBackgroundProcess,
    killBackgroundProcess,
    listBackgroundProcesses,
    cleanupBackgroundProcesses,
} from "./executor";

// Export log manager
export {
    saveTerminalLog,
    readTerminalLog,
    truncateOutput,
} from "./log-manager";

// Export logger
export { commandLogger } from "./logger";
