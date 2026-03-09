"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CommandOutput } from "@/components/ui/command-output";
import { useToolExpansion } from "../tool-expansion-context";
import { parseTextResult } from "./parse-text-result";

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: {
    command?: string;
    description?: string;
    timeout?: number;
    run_in_background?: boolean;
  };
  result?: unknown;
}>;

function isErrorResult(result: unknown): boolean {
  if (!result) return false;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (r.isError === true) return true;
  }
  const text = parseTextResult(result);
  // Check for common shell error patterns at start of output
  if (text && /^(error|command not found|bash:|zsh:)/im.test(text.slice(0, 200))) return true;
  return false;
}

/**
 * Custom UI for Claude Code's `Bash` tool.
 * Renders using the shared CommandOutput terminal component.
 */
export const ClaudeBashToolUI: ToolCallContentPartComponent = ({ args, result }) => {
  const command = args?.command || "(unknown command)";
  const outputText = parseTextResult(result);
  const hasError = isErrorResult(result);
  const isRunning = result === undefined;

  // Parse stdout/stderr from the text output.
  // Claude Code returns plain text — no structured stdout/stderr separation.
  const stdout = !hasError ? outputText : undefined;
  const errorMsg = hasError ? outputText : undefined;

  // React to global expand/collapse
  const expansionCtx = useToolExpansion();
  const lastSignalRef = useRef(0);
  const [forceCollapse, setForceCollapse] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!expansionCtx || expansionCtx.signal.counter === 0) return;
    if (expansionCtx.signal.counter === lastSignalRef.current) return;
    lastSignalRef.current = expansionCtx.signal.counter;
    setForceCollapse(expansionCtx.signal.mode !== "expand");
  }, [expansionCtx?.signal]);

  const autoCollapse = !hasError && !isRunning && !!stdout && stdout.length < 500;

  return (
    <CommandOutput
      command={command}
      stdout={stdout}
      error={errorMsg}
      success={!hasError && !isRunning}
      defaultCollapsed={forceCollapse ?? autoCollapse}
    />
  );
};
