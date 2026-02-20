/**
 * Plugin Hooks Engine
 *
 * Dispatches hook events to registered handlers (command, prompt, agent).
 * Implements the Anthropic Claude Code hook lifecycle:
 *
 * - PreToolUse:  Before tool execution. Exit code 2 = block the tool.
 * - PostToolUse: After tool succeeds. Informational only.
 * - PostToolUseFailure: After tool fails. Informational only.
 * - SessionStart/SessionEnd: Session lifecycle.
 * - Stop: Claude finishes responding.
 *
 * @see https://code.claude.com/docs/en/hooks
 */

import { exec } from "child_process";
import { isEBADFError, spawnWithFileCapture } from "@/lib/spawn-utils";
import type {
  HookEventType,
  HookEntry,
  HookHandler,
  HookInput,
  HookExecutionResult,
  PluginHooksConfig,
} from "./types";

// =============================================================================
// Hook Registry (in-memory, populated from installed plugins)
// =============================================================================

interface RegisteredHookSource {
  pluginName: string;
  entries: HookEntry[];
}

const hookRegistry = new Map<HookEventType, RegisteredHookSource[]>();

/**
 * Register hooks from a plugin's hooks config.
 */
export function registerPluginHooks(
  pluginName: string,
  config: PluginHooksConfig
): void {
  for (const [eventType, entries] of Object.entries(config.hooks)) {
    const event = eventType as HookEventType;
    const existing = hookRegistry.get(event) || [];
    const withoutPlugin = existing.filter((source) => source.pluginName !== pluginName);

    if (!entries || entries.length === 0) {
      if (withoutPlugin.length === 0) {
        hookRegistry.delete(event);
      } else {
        hookRegistry.set(event, withoutPlugin);
      }
      continue;
    }

    hookRegistry.set(event, [...withoutPlugin, { pluginName, entries }]);
  }
}

/**
 * Unregister all hooks from a plugin.
 */
export function unregisterPluginHooks(pluginName: string): void {
  for (const [event, sources] of Array.from(hookRegistry.entries())) {
    const filtered = sources.filter((s) => s.pluginName !== pluginName);
    if (filtered.length === 0) {
      hookRegistry.delete(event);
    } else {
      hookRegistry.set(event, filtered);
    }
  }
}

/**
 * Clear all registered hooks.
 */
export function clearAllHooks(): void {
  hookRegistry.clear();
}

/**
 * Get all registered hooks for an event type.
 */
export function getRegisteredHooks(event: HookEventType): RegisteredHookSource[] {
  return hookRegistry.get(event) || [];
}

// =============================================================================
// Hook Dispatch
// =============================================================================

export interface HookDispatchResult {
  /** Whether any hook blocked the action (PreToolUse only). */
  blocked: boolean;

  /** Block reason (from the blocking hook's stderr). */
  blockReason?: string;

  /** Results from all executed hooks. */
  results: Array<{
    pluginName: string;
    handler: HookHandler;
    result: HookExecutionResult;
  }>;

  /** Total execution time for all hooks. */
  totalDurationMs: number;
}

/**
 * Dispatch a hook event to all matching registered handlers.
 *
 * For PreToolUse: if any handler returns exit code 2, the tool is blocked.
 * For all other events: hooks are informational only.
 */
export async function dispatchHook(
  event: HookEventType,
  input: HookInput,
  options: {
    /** Tool name for matcher filtering (PreToolUse/PostToolUse). */
    toolName?: string;
    /** Plugin root path for ${CLAUDE_PLUGIN_ROOT} substitution. */
    pluginRoots?: Map<string, string>;
    /** Optional allow-list for plugin names (agent-scoped execution). */
    allowedPluginNames?: Set<string>;
  } = {}
): Promise<HookDispatchResult> {
  const startTime = Date.now();
  const sources = hookRegistry.get(event) || [];
  const results: HookDispatchResult["results"] = [];
  let blocked = false;
  let blockReason: string | undefined;

  for (const source of sources) {
    if (options.allowedPluginNames && !options.allowedPluginNames.has(source.pluginName)) {
      continue;
    }
    for (const entry of source.entries) {
      // Check matcher (regex against tool name)
      if (entry.matcher && options.toolName) {
        try {
          const regex = new RegExp(entry.matcher);
          if (!regex.test(options.toolName)) continue;
        } catch {
          // Invalid regex, skip this entry
          continue;
        }
      }

      // Execute each handler in the entry
      for (const handler of entry.hooks) {
        if (handler.type !== "command") {
          // Only command handlers are supported in Phase 1.
          // Prompt and agent handlers will be added in Phase 3.
          continue;
        }

        const pluginRoot = options.pluginRoots?.get(source.pluginName) || "";
        const result = await executeCommandHook(handler, input, pluginRoot);

        results.push({
          pluginName: source.pluginName,
          handler,
          result,
        });

        // PreToolUse: exit code 2 = block
        if (event === "PreToolUse" && result.exitCode === 2) {
          blocked = true;
          blockReason = result.stderr.trim() || "Blocked by hook";
          result.blocked = true;
          result.blockReason = blockReason;
        }

        // If blocked, stop processing further hooks
        if (blocked) break;
      }

      if (blocked) break;
    }

    if (blocked) break;
  }

  return {
    blocked,
    blockReason,
    results,
    totalDurationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Command Hook Execution
// =============================================================================

/**
 * Execute a command hook handler.
 *
 * The hook receives JSON input on stdin and returns results via:
 * - Exit code 0: success
 * - Exit code 1: error (non-blocking)
 * - Exit code 2: block (PreToolUse only)
 * - stdout: informational output
 * - stderr: error/block reason
 */
async function executeCommandHook(
  handler: HookHandler,
  input: HookInput,
  pluginRoot: string
): Promise<HookExecutionResult> {
  const command = handler.command;
  if (!command) {
    return {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: "No command specified in hook handler",
      durationMs: 0,
    };
  }

  // Substitute ${CLAUDE_PLUGIN_ROOT} only when we have a concrete root.
  // If root is unknown, keep the placeholder intact so shell/env expansion can still work.
  const resolvedCommand = pluginRoot
    ? command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot)
    : command;

  const timeoutMs = (handler.timeout || 600) * 1000;
  const startTime = Date.now();
  const inputJson = JSON.stringify(input);

  const hookEnv = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
  };

  // EBADF fallback helper for hooks
  const runWithFileCapture = async (): Promise<HookExecutionResult> => {
    console.warn("[Hooks] exec() EBADF – retrying with file-capture fallback");
    try {
      // exec() uses a shell, so pass the whole command as a single shell arg.
      // stdinData provides the JSON input that would normally go to stdin.
      const fb = await spawnWithFileCapture(
        "/bin/sh", ["-c", resolvedCommand],
        pluginRoot || process.cwd(),
        hookEnv as NodeJS.ProcessEnv,
        timeoutMs,
        1024 * 1024,
        inputJson,
      );
      const exitCode = fb.exitCode ?? 1;
      const durationMs = Date.now() - startTime;
      return {
        success: exitCode === 0,
        exitCode,
        stdout: fb.stdout.slice(0, 10000),
        stderr: fb.stderr.slice(0, 10000),
        durationMs,
        blocked: exitCode === 2,
        blockReason: exitCode === 2 ? fb.stderr.trim() : undefined,
      };
    } catch (fbErr) {
      return {
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: `Hook EBADF fallback failed: ${fbErr instanceof Error ? fbErr.message : fbErr}`,
        durationMs: Date.now() - startTime,
      };
    }
  };

  return new Promise<HookExecutionResult>((resolve) => {
    let child;
    try {
      child = exec(resolvedCommand, {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB
        env: hookEnv,
      });
    } catch (err) {
      if (isEBADFError(err) && process.platform === "darwin") {
        runWithFileCapture().then(resolve);
        return;
      }
      resolve({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: `Hook execution error: ${err instanceof Error ? err.message : "Unknown error"}`,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: string) => {
      stdout += data;
    });

    child.stderr?.on("data", (data: string) => {
      stderr += data;
    });

    // Write input JSON to stdin
    if (child.stdin) {
      child.stdin.write(inputJson);
      child.stdin.end();
    }

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      const durationMs = Date.now() - startTime;

      resolve({
        success: exitCode === 0,
        exitCode,
        stdout: stdout.slice(0, 10000), // Limit output size
        stderr: stderr.slice(0, 10000),
        durationMs,
        blocked: exitCode === 2,
        blockReason: exitCode === 2 ? stderr.trim() : undefined,
      });
    });

    child.on("error", (err) => {
      if (isEBADFError(err) && process.platform === "darwin") {
        runWithFileCapture().then(resolve);
        return;
      }
      resolve({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: `Hook execution error: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });
  });
}
