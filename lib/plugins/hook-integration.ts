/**
 * Plugin Hook Integration
 *
 * Bridges the plugin hooks engine into the tool execution pipeline.
 * Call `runPreToolUseHooks` before executing a tool and
 * `runPostToolUseHooks` / `runPostToolUseFailureHooks` after.
 *
 * Hooks are non-blocking by default (PostToolUse, PostToolUseFailure).
 * PreToolUse hooks can block tool execution by returning exit code 2.
 */

import {
  dispatchHook,
  getRegisteredHooks,
} from "./hooks-engine";
import type {
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
  StopHookInput,
} from "./types";

/**
 * Run PreToolUse hooks before a tool call.
 * Returns { blocked, blockReason } if a hook blocks the tool.
 */
export async function runPreToolUseHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId?: string,
  allowedPluginNames?: Set<string>,
  pluginRoots?: Map<string, string>
): Promise<{ blocked: boolean; blockReason?: string; durationMs: number }> {
  const sources = getRegisteredHooks("PreToolUse");
  if (sources.length === 0) {
    return { blocked: false, durationMs: 0 };
  }

  const input: PreToolUseHookInput = {
    hook_type: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    session_id: sessionId,
  };

  try {
    const result = await dispatchHook("PreToolUse", input, {
      toolName,
      allowedPluginNames,
      pluginRoots,
    });
    return {
      blocked: result.blocked,
      blockReason: result.blockReason,
      durationMs: result.totalDurationMs,
    };
  } catch (error) {
    console.error("[Hooks] PreToolUse dispatch error:", error);
    // Don't block on hook errors — fail open
    return { blocked: false, durationMs: 0 };
  }
}

/**
 * Run PostToolUse hooks after a successful tool call.
 * Fire-and-forget — does not block the response.
 */
export function runPostToolUseHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolOutput: unknown,
  sessionId?: string,
  allowedPluginNames?: Set<string>,
  pluginRoots?: Map<string, string>
): void {
  const sources = getRegisteredHooks("PostToolUse");
  if (sources.length === 0) return;

  const input: PostToolUseHookInput = {
    hook_type: "PostToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_output: toolOutput,
    session_id: sessionId,
  };

  // Fire-and-forget
  dispatchHook("PostToolUse", input, { toolName, allowedPluginNames, pluginRoots }).catch((error) => {
    console.error("[Hooks] PostToolUse dispatch error:", error);
  });
}

/**
 * Run PostToolUseFailure hooks after a failed tool call.
 * Fire-and-forget — does not block the response.
 */
export function runPostToolUseFailureHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  error: string,
  sessionId?: string,
  allowedPluginNames?: Set<string>,
  pluginRoots?: Map<string, string>
): void {
  const sources = getRegisteredHooks("PostToolUseFailure");
  if (sources.length === 0) return;

  const input: PostToolUseFailureHookInput = {
    hook_type: "PostToolUseFailure",
    tool_name: toolName,
    tool_input: toolInput,
    error,
    session_id: sessionId,
  };

  // Fire-and-forget
  dispatchHook("PostToolUseFailure", input, {
    toolName,
    allowedPluginNames,
    pluginRoots,
  }).catch((err) => {
    console.error("[Hooks] PostToolUseFailure dispatch error:", err);
  });
}

/**
 * Run Stop hooks when the model finishes/aborts/fails a response.
 * Fire-and-forget — does not block the response pipeline.
 */
export function runStopHooks(
  sessionId?: string,
  stopReason?: string,
  allowedPluginNames?: Set<string>,
  pluginRoots?: Map<string, string>
): void {
  const sources = getRegisteredHooks("Stop");
  if (sources.length === 0) return;

  const input: StopHookInput = {
    hook_type: "Stop",
    session_id: sessionId,
    stop_reason: stopReason,
  };

  dispatchHook("Stop", input, { allowedPluginNames, pluginRoots }).catch((error) => {
    console.error("[Hooks] Stop dispatch error:", error);
  });
}
