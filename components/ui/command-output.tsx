"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, Terminal, Check, X, Clock } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { TerminalBlock, TerminalPrompt, TerminalOutput } from "./terminal-prompt";

interface CommandOutputProps {
    /** The command that was executed */
    command: string;
    /** Command arguments */
    args?: string[];
    /** Working directory */
    cwd?: string;
    /** Standard output from the command */
    stdout?: string;
    /** Standard error from the command */
    stderr?: string;
    /** Exit code (null if process was killed) */
    exitCode?: number | null;
    /** Execution time in milliseconds */
    executionTime?: number;
    /** Whether the command was successful */
    success?: boolean;
    /** Error message if execution failed */
    error?: string;
    /** Log ID for persistent storage */
    logId?: string;
    /** Whether the output was truncated in context */
    isTruncated?: boolean;
    /** Whether the output should start collapsed */
    defaultCollapsed?: boolean;
    /** CSS class for the container */
    className?: string;
}

/**
 * Status indicator component
 */
function StatusIndicator({ success, error }: { success?: boolean; error?: string }) {
    const t = useTranslations("assistantUi.commandOutput");

    if (error) {
        return (
            <span className="flex items-center gap-1 text-red-400">
                <X className="h-3.5 w-3.5" />
                <span className="text-xs">{t("error")}</span>
            </span>
        );
    }

    if (success) {
        return (
            <span className="flex items-center gap-1 text-terminal-green">
                <Check className="h-3.5 w-3.5" />
                <span className="text-xs">{t("success")}</span>
            </span>
        );
    }

    return (
        <span className="flex items-center gap-1 text-terminal-amber">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs">{t("running")}</span>
        </span>
    );
}

/**
 * CommandOutput component
 *
 * Displays command execution results in a terminal-styled block.
 * Features:
 * - Collapsible output (auto-collapse successful commands)
 * - Status indicators (success/error/running)
 * - Execution time display
 * - Stdout/stderr separation with proper styling
 */
export function CommandOutput({
    command,
    args = [],
    cwd,
    stdout,
    stderr,
    exitCode,
    executionTime,
    success,
    error,
    logId,
    isTruncated,
    defaultCollapsed,
    className,
}: CommandOutputProps) {
    // Auto-collapse successful commands with no stderr
    const t = useTranslations("assistantUi.commandOutput");
    const shouldAutoCollapse = defaultCollapsed ?? (success && !stderr && (stdout?.length ?? 0) > 500);
    const [isCollapsed, setIsCollapsed] = useState(shouldAutoCollapse);

    const fullCommand = [command, ...args].join(" ");
    const hasOutput = stdout || stderr || error;

    return (
        <TerminalBlock className={cn("space-y-2", className)}>
            {/* Header with command and status */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <TerminalPrompt
                        symbol="$"
                        prefix={cwd ? cwd.split(/[/\\]/).pop() : undefined}
                        animate={false}
                    >
                        <span className="break-all">{fullCommand}</span>
                    </TerminalPrompt>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {/* Execution time */}
                    {executionTime !== undefined && (
                        <span className="text-xs text-terminal-text/60">
                            {executionTime < 1000
                                ? `${executionTime}ms`
                                : `${(executionTime / 1000).toFixed(1)}s`}
                        </span>
                    )}

                    {/* Status indicator */}
                    <StatusIndicator success={success} error={error} />

                    {/* Collapse toggle */}
                    {hasOutput && (
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="text-terminal-text/60 hover:text-terminal-text transition-colors p-1 -m-1"
                            aria-label={isCollapsed ? t("expandOutput") : t("collapseOutput")}
                        >
                            {isCollapsed ? (
                                <ChevronRight className="h-4 w-4" />
                            ) : (
                                <ChevronDown className="h-4 w-4" />
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Exit code if not 0 or null */}
            {exitCode !== null && exitCode !== undefined && exitCode !== 0 && (
                <div className="text-xs text-terminal-amber pl-6">
                    {t("exitCode")} {exitCode}
                </div>
            )}

            {/* Output section */}
            {hasOutput && !isCollapsed && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-2 pt-2 border-t border-terminal-border/30"
                >
                    {/* Error message */}
                    {error && (
                        <TerminalOutput type="error" className="whitespace-pre-wrap">
                            {error}
                        </TerminalOutput>
                    )}

                    {/* Stdout */}
                    {stdout && stdout.trim() && (
                        <div className="space-y-1">
                            <div className="text-xs text-terminal-text/40 uppercase tracking-wide pl-6">
                                {t("output")}
                            </div>
                            <TerminalOutput className="whitespace-pre-wrap font-mono text-xs max-h-96 overflow-auto">
                                {stdout}
                            </TerminalOutput>
                        </div>
                    )}

                    {/* Stderr (only show if there's actual content) */}
                    {stderr && stderr.trim() && (
                        <div className="space-y-1">
                            <div className={cn(
                                "text-xs uppercase tracking-wide pl-6",
                                success ? "text-terminal-text/40" : "text-red-400/60"
                            )}>
                                {t("standardError")}{success ? t("stdErrWarning") : ""}
                            </div>
                            <TerminalOutput
                                type={success ? "default" : "error"}
                                className="whitespace-pre-wrap font-mono text-xs max-h-48 overflow-auto"
                            >
                                {stderr}
                            </TerminalOutput>
                        </div>
                    )}

                    {/* Truncation warning banner */}
                    {isTruncated && logId && (
                        <div className="mx-6 my-2 p-3 rounded-md bg-terminal-amber/10 border border-terminal-amber/30 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 text-terminal-amber">
                                <Clock className="h-4 w-4 shrink-0" />
                                <span className="text-xs font-medium">
                                    {t("truncated", { logId })}
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`executeCommand({ command: "readLog", logId: "${logId}" })`);
                                }}
                                className="text-[10px] uppercase tracking-wider bg-terminal-amber/20 hover:bg-terminal-amber/30 text-terminal-amber px-2 py-1 rounded transition-colors border border-terminal-amber/20 shrink-0"
                            >
                                {t("copyRetrieval")}
                            </button>
                        </div>
                    )}
                </motion.div>
            )}

            {/* Collapsed indicator */}
            {hasOutput && isCollapsed && (
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="text-xs text-terminal-text/40 hover:text-terminal-text/60 transition-colors pl-6"
                >
                    {t("clickToExpand")}
                </button>
            )}
        </TerminalBlock>
    );
}

/**
 * Inline command status for use in chat messages
 */
export function CommandStatus({
    command,
    success,
    executionTime,
    error,
}: Pick<CommandOutputProps, "command" | "success" | "executionTime" | "error">) {
    return (
        <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-terminal-bg/50 border border-terminal-border text-sm font-mono">
            <Terminal className="h-3.5 w-3.5 text-terminal-green" />
            <span className="text-terminal-text/80 truncate max-w-[200px]">{command}</span>
            <StatusIndicator success={success} error={error} />
            {executionTime !== undefined && (
                <span className="text-terminal-text/40 text-xs">
                    {executionTime < 1000 ? `${executionTime}ms` : `${(executionTime / 1000).toFixed(1)}s`}
                </span>
            )}
        </div>
    );
}
