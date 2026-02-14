"use client";

import { FC } from "react";
import { CommandOutput } from "@/components/ui/command-output";
import type { ExecuteCommandToolResult } from "@/lib/command-execution/types";

// Type definition matching the structure used in other components
type ToolCallContentPartComponent = FC<{
    toolName: string;
    argsText?: string;
    args: { command?: string; args?: string[]; cwd?: string; timeout?: number; processId?: string; background?: boolean };
    result?: ExecuteCommandToolResult;
}>;

/**
 * Derive a human-readable command label from args, handling background
 * process management calls where `command` may be absent.
 */
function getCommandLabel(args: { command?: string; args?: string[]; processId?: string }): string {
    if (args.command && args.command !== "status") return args.command;
    if (args.processId) {
        if (args.command === "kill") return `kill process ${args.processId}`;
        return `check process ${args.processId}`;
    }
    if (args.command === "list") return "list background processes";
    return "(unknown command)";
}

export const ExecuteCommandToolUI: ToolCallContentPartComponent = ({
    args,
    result,
}) => {
    // Guard against missing or incomplete args (can happen when streaming
    // is interrupted and argsText was malformed/truncated JSON)
    if (!args || !args.command) {
        const fallbackCommand = args ? getCommandLabel(args) : "(unknown command)";
        const isNonErrorStatus = result?.status === "success" || result?.status === "background_started" || result?.status === "running";

        if (result) {
            // We have a result but no valid command - show result with descriptive label
            return (
                <CommandOutput
                    command={fallbackCommand}
                    stdout={result.stdout}
                    stderr={result.stderr}
                    exitCode={result.exitCode}
                    executionTime={result.executionTime}
                    success={isNonErrorStatus}
                    error={result.status === "error" || result.status === "blocked" || result.status === "no_folders" ? result.error || result.message : undefined}
                    logId={result.logId}
                    isTruncated={result.isTruncated}
                    defaultCollapsed={false}
                />
            );
        }
        // No result and no valid command - don't render anything unless we have a processId
        if (!args?.processId && !args?.command) return null;
        return (
            <CommandOutput
                command={fallbackCommand}
                success={false}
                defaultCollapsed={false}
            />
        );
    }

    // If no result yet, show running state
    if (!result) {
        return (
            <CommandOutput
                command={args.command}
                args={args.args}
                cwd={args.cwd}
                success={false}
                defaultCollapsed={false}
            />
        );
    }

    return (
        <CommandOutput
            command={args.command}
            args={args.args}
            cwd={args.cwd}
            stdout={result.stdout}
            stderr={result.stderr}
            exitCode={result.exitCode}
            executionTime={result.executionTime}
            success={result.status === "success"}
            error={result.status === "error" || result.status === "blocked" || result.status === "no_folders" ? result.error || result.message : undefined}
            logId={result.logId}
            isTruncated={result.isTruncated}
            // Auto-collapse if successful and not too much output
            defaultCollapsed={result.status === "success" && (!result.stderr) && (result.stdout?.length || 0) < 500}
        />
    );
};
