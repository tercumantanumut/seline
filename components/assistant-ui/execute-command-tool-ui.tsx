"use client";

import { FC } from "react";
import { CommandOutput } from "@/components/ui/command-output";
import type { ExecuteCommandToolResult } from "@/lib/command-execution/types";

// Type definition matching the structure used in other components
type ToolCallContentPartComponent = FC<{
    toolName: string;
    argsText?: string;
    args: { command: string; args?: string[]; cwd?: string; timeout?: number };
    result?: ExecuteCommandToolResult;
}>;

export const ExecuteCommandToolUI: ToolCallContentPartComponent = ({
    args,
    result,
}) => {
    // If no result yet, show running state
    if (!result) {
        if (!args) return null;

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
            // Auto-collapse if successful and not too much output
            defaultCollapsed={result.status === "success" && (!result.stderr) && (result.stdout?.length || 0) < 500}
        />
    );
};
