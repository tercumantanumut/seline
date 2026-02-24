import path from "path";
import { query as claudeAgentQuery } from "@anthropic-ai/claude-agent-sdk";
import { isElectronProduction } from "@/lib/utils/environment";
import { getNodeBinary } from "@/lib/auth/claude-login-process";

const DEFAULT_CLAUDE_AGENT_MODEL = "claude-sonnet-4-5-20250929";

/**
 * Returns env overrides for the Agent SDK subprocess.
 * In Electron production builds, process.execPath is the Electron binary,
 * so ELECTRON_RUN_AS_NODE=1 makes the SDK's child process run as plain Node.js.
 */
function getSdkEnv(): Record<string, string | undefined> {
  // Always strip CLAUDECODE to prevent "cannot be launched inside another
  // Claude Code session" errors when the server inherits the env from a
  // Claude Code terminal session or similar wrapper.
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CLAUDECODE;
  // The settings manager may inject ANTHROPIC_API_KEY into process.env (e.g.
  // a stale placeholder like "123"). The SDK must use its own OAuth flow, so
  // strip any app-level API key to prevent it from overriding OAuth auth.
  delete env.ANTHROPIC_API_KEY;

  if (isElectronProduction()) {
    env.ELECTRON_RUN_AS_NODE = "1";

    // Ensure the resolved node binary's directory is in PATH so the SDK
    // can find "node" even when the user has no system-wide Node install.
    // DMG apps launched from Finder get a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin)
    // that excludes homebrew, nvm, volta, etc.
    const nodeBin = getNodeBinary();
    const nodeDir = path.dirname(nodeBin);
    if (!env.PATH?.includes(nodeDir)) {
      env.PATH = `${nodeDir}${path.delimiter}${env.PATH || ""}`;
    }
    // Also update the current process PATH so the SDK's spawn() can resolve
    // "node" — spawn resolves executables using the parent's PATH, not the
    // child env's PATH.
    if (!process.env.PATH?.includes(nodeDir)) {
      process.env.PATH = `${nodeDir}${path.delimiter}${process.env.PATH || ""}`;
    }
  }

  return env;
}
const URL_PATTERN = /https?:\/\/[^\s"')]+/i;

export interface ClaudeAgentSdkAuthStatus {
  authenticated: boolean;
  isAuthenticating: boolean;
  output: string[];
  email?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
  authUrl?: string;
  error?: string;
}

interface ReadAuthStatusOptions {
  timeoutMs: number;
  model?: string;
}

function trimOutput(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-20);
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function extractAuthUrl(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(URL_PATTERN);
    if (match && match[0]) {
      return match[0];
    }
  }
  return undefined;
}

/**
 * Uses the official Claude Agent SDK as the single source of truth for auth status.
 *
 * This intentionally does not rely on app-managed OAuth token persistence, so the
 * app follows the SDK/CLI authentication state directly.
 */
export async function readClaudeAgentSdkAuthStatus(
  options: ReadAuthStatusOptions,
): Promise<ClaudeAgentSdkAuthStatus> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), options.timeoutMs);

  const output: string[] = [];
  let isAuthenticating = false;
  let authenticated = false;
  let errorMessage: string | undefined;
  let accountInfo: {
    email?: string;
    subscriptionType?: string;
    tokenSource?: string;
    apiKeySource?: string;
  } | null = null;

  const sdkQuery = claudeAgentQuery({
    prompt: "Reply with OK.",
    options: {
      abortController,
      cwd: process.cwd(),
      executable: "node",
      includePartialMessages: true,
      maxTurns: 1,
      model: options.model || DEFAULT_CLAUDE_AGENT_MODEL,
      permissionMode: "plan",
      env: getSdkEnv(),
    },
  });

  try {
    for await (const message of sdkQuery) {
      if (message.type === "auth_status") {
        isAuthenticating = Boolean((message as { isAuthenticating?: boolean }).isAuthenticating);
        const lines = (message as { output?: string[] }).output;
        if (Array.isArray(lines)) {
          output.push(...lines);
        }
        const authError = (message as { error?: string }).error;
        if (authError) {
          errorMessage = authError;
        }
      }

      if (message.type === "assistant") {
        const assistantError = (message as { error?: string }).error;
        if (assistantError === "authentication_failed") {
          errorMessage = "authentication_failed";
        }
      }

      if (message.type === "result") {
        const isError = Boolean((message as { is_error?: boolean }).is_error);
        authenticated = !isError;
        if (isError && !errorMessage) {
          const subtype = (message as { subtype?: string }).subtype;
          errorMessage = subtype || "error_during_execution";
        }
      }
    }

    accountInfo = await sdkQuery.accountInfo().catch(() => null);

    if (
      accountInfo?.email ||
      accountInfo?.subscriptionType ||
      accountInfo?.tokenSource ||
      accountInfo?.apiKeySource
    ) {
      authenticated = true;
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      errorMessage = resolveErrorMessage(error);
    }
  } finally {
    clearTimeout(timeout);
  }

  const trimmedOutput = trimOutput(output);

  return {
    authenticated,
    isAuthenticating,
    output: trimmedOutput,
    email: accountInfo?.email,
    subscriptionType: accountInfo?.subscriptionType,
    tokenSource: accountInfo?.tokenSource,
    apiKeySource: accountInfo?.apiKeySource,
    authUrl: extractAuthUrl(trimmedOutput),
    error: errorMessage,
  };
}

export async function attemptClaudeAgentSdkLogout(timeoutMs = 20_000): Promise<boolean> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  const sdkQuery = claudeAgentQuery({
    prompt: "/logout",
    options: {
      abortController,
      cwd: process.cwd(),
      executable: "node",
      includePartialMessages: false,
      maxTurns: 1,
      permissionMode: "plan",
      env: getSdkEnv(),
    },
  });

  try {
    for await (const _message of sdkQuery) {
      // Drain stream until result.
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
