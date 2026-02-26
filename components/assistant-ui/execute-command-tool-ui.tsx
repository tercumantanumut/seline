"use client";

import { FC } from "react";
import { CommandOutput } from "@/components/ui/command-output";
import type { ExecuteCommandToolResult } from "@/lib/command-execution/types";

// Type definition matching the structure used in other components
type ToolCallContentPartComponent = FC<{
    toolName: string;
    argsText?: string;
    args?: { command?: string; args?: string[]; cwd?: string; timeout?: number; processId?: string; background?: boolean };
    result?: ExecuteCommandToolResult;
    state?: "input-streaming" | "input-available" | "output-available" | "output-error" | "output-denied";
    output?: ExecuteCommandToolResult;
    errorText?: string;
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
    output,
    state,
    errorText,
}) => {
    const resolvedResult = result ?? output;
    const fallbackCommand = args ? getCommandLabel(args) : "(unknown command)";

    const isFailureState =
        state === "output-error" ||
        resolvedResult?.status === "error" ||
        resolvedResult?.status === "blocked" ||
        resolvedResult?.status === "no_folders";

    const resolvedError =
        errorText ||
        (isFailureState
            ? (resolvedResult?.error || resolvedResult?.message || "Command execution failed")
            : undefined);

    const isNonErrorStatus =
        resolvedResult?.status === "success" ||
        resolvedResult?.status === "background_started" ||
        resolvedResult?.status === "running";

    // If args are malformed/missing but we have a persisted output/error, still render final state.
    if (!args || !args.command) {
        if (resolvedResult || resolvedError) {
            return (
                <CommandOutput
                    command={fallbackCommand}
                    stdout={resolvedResult?.stdout}
                    stderr={resolvedResult?.stderr}
                    exitCode={resolvedResult?.exitCode}
                    executionTime={resolvedResult?.executionTime}
                    success={isNonErrorStatus}
                    error={resolvedError}
                    logId={resolvedResult?.logId}
                    isTruncated={resolvedResult?.isTruncated}
                    defaultCollapsed={false}
                />
            );
        }

        // No args and no output/error means this is genuinely pending.
        if (!args?.processId && !args?.command) return null;
        return (
            <CommandOutput
                command={fallbackCommand}
                success={false}
                defaultCollapsed={false}
            />
        );
    }

    // Render running only when there is truly no final output and no explicit output state.
    if (!resolvedResult && !resolvedError && !state?.startsWith("output")) {
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
            stdout={resolvedResult?.stdout}
            stderr={resolvedResult?.stderr}
            exitCode={resolvedResult?.exitCode}
            executionTime={resolvedResult?.executionTime}
            success={isNonErrorStatus}
            error={resolvedError}
            logId={resolvedResult?.logId}
            isTruncated={resolvedResult?.isTruncated}
            // Auto-collapse only for successful completed foreground commands.
            defaultCollapsed={resolvedResult?.status === "success" && (!resolvedResult?.stderr) && (resolvedResult?.stdout?.length || 0) < 500}
        />
    );
};
