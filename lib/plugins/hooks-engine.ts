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

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { spawnWithFileCapture } from "@/lib/spawn-utils";
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

let cachedWindowsBashPath: string | null | undefined;

function getWindowsBashPath(): string | null {
  if (process.platform !== "win32") return null;
  if (cachedWindowsBashPath !== undefined) return cachedWindowsBashPath;

  const envPath = process.env.GIT_BASH_PATH || process.env.BASH_PATH;
  const candidates = [
    envPath,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedWindowsBashPath = candidate;
      return candidate;
    }
  }

  // Derive common Git Bash locations from git.exe installation path.
  const gitLookup = spawnSync("where", ["git"], {
    encoding: "utf-8",
    windowsHide: true,
  });

  if (gitLookup.status === 0) {
    const gitPath = gitLookup.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /git\.exe$/i.test(line));

    if (gitPath) {
      const gitBinDir = gitPath.replace(/git\.exe$/i, "");
      const gitRoot = join(gitBinDir, "..");
      const derivedCandidates = [
        join(gitRoot, "bin", "bash.exe"),
        join(gitRoot, "usr", "bin", "bash.exe"),
      ];

      for (const candidate of derivedCandidates) {
        if (existsSync(candidate)) {
          cachedWindowsBashPath = candidate;
          return cachedWindowsBashPath;
        }
      }
    }
  }

  // Last resort: accept bash.exe from PATH when it's not the WSL bridge.
  const bashLookup = spawnSync("where", ["bash"], {
    encoding: "utf-8",
    windowsHide: true,
  });

  if (bashLookup.status === 0) {
    const bashPath = bashLookup.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) => line.length > 0
          && !/\\Windows\\(System32|SysWOW64)\\bash\.exe$/i.test(line)
          && !/\\WindowsApps\\bash\.exe$/i.test(line)
      );

    if (bashPath && existsSync(bashPath)) {
      cachedWindowsBashPath = bashPath;
      return cachedWindowsBashPath;
    }
  }

  cachedWindowsBashPath = null;
  return cachedWindowsBashPath;
}

function prefersPosixShell(command: string): boolean {
  return command.includes("'")
    || command.includes(";")
    || command.includes(">&2")
    || command.includes("$(")
    || /\b(exit|set -e|if|then|fi)\b/.test(command);
}

function normalizePosixCommandForCmd(command: string): string {
  return command
    .replace(/'([^']*)'/g, "$1")
    .replace(/\s*&>\s*2/g, " 1>&2")
    .replace(/\s*>\s*&2/g, " 1>&2")
    .replace(/\s*;\s*/g, " & ");
}

function resolveHookShell(command: string): { shellCommand: string; shellArgs: string[] } {
  if (process.platform !== "win32") {
    return { shellCommand: "/bin/sh", shellArgs: ["-c", command] };
  }

  const needsPosixShell = prefersPosixShell(command);
  const bashPath = getWindowsBashPath();
  if (bashPath && needsPosixShell) {
    return { shellCommand: bashPath, shellArgs: ["-lc", command] };
  }

  const cmdCommand = needsPosixShell ? normalizePosixCommandForCmd(command) : command;
  return {
    shellCommand: process.env.ComSpec || "cmd.exe",
    shellArgs: ["/d", "/s", "/c", cmdCommand],
  };
}

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
  // Escape spaces in the path (e.g. macOS "Application Support") so /bin/sh -c doesn't break.
  const escapedRoot = pluginRoot ? pluginRoot.replace(/ /g, "\\ ") : "";
  const resolvedCommand = pluginRoot
    ? command
        .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, escapedRoot)
        .replace(/\$CLAUDE_PLUGIN_ROOT/g, escapedRoot)
    : command;

  const timeoutMs = (handler.timeout || 600) * 1000;
  const startTime = Date.now();
  const inputJson = JSON.stringify(input);

  const hookEnv = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
  };

  const { shellCommand, shellArgs } = resolveHookShell(resolvedCommand);

  try {
    const fb = await spawnWithFileCapture(
      shellCommand,
      shellArgs,
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
  } catch (err) {
    return {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: `Hook execution error: ${err instanceof Error ? err.message : "Unknown error"}`,
      durationMs: Date.now() - startTime,
    };
  }
}
