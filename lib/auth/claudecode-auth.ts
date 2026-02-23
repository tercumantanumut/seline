import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";
import {
  attemptClaudeAgentSdkLogout,
  readClaudeAgentSdkAuthStatus,
  type ClaudeAgentSdkAuthStatus,
} from "@/lib/auth/claude-agent-sdk-auth";

const AUTH_STATUS_TIMEOUT_MS = 20_000;

export interface ClaudeCodeAuthState {
  isAuthenticated: boolean;
  email?: string;
  expiresAt?: number;
  lastRefresh?: number;
  tokenSource?: string;
  apiKeySource?: string;
  authUrl?: string;
  output?: string[];
  error?: string;
}

let cachedAuthState: ClaudeCodeAuthState | null = null;

function buildAuthStateFromSdkStatus(status: ClaudeAgentSdkAuthStatus): ClaudeCodeAuthState {
  return {
    isAuthenticated: status.authenticated,
    email: status.email,
    // SDK auth can use CLI/session credentials, so there is no reliable expiresAt value.
    expiresAt: undefined,
    lastRefresh: Date.now(),
    tokenSource: status.tokenSource,
    apiKeySource: status.apiKeySource,
    authUrl: status.authUrl,
    output: status.output,
    error: status.error,
  };
}

function persistAuthState(status: ClaudeAgentSdkAuthStatus): ClaudeCodeAuthState {
  const settings = loadSettings();
  const authState = buildAuthStateFromSdkStatus(status);
  settings.claudecodeAuth = authState;

  // Clean up legacy app-managed OAuth fields from old versions.
  delete settings.claudecodeToken;
  delete settings.pendingClaudeCodeOAuth;

  saveSettings(settings);
  cachedAuthState = authState;
  return authState;
}

export function getClaudeCodeAuthState(): ClaudeCodeAuthState {
  if (cachedAuthState) {
    return cachedAuthState;
  }

  const settings = loadSettings();
  const state: ClaudeCodeAuthState = {
    isAuthenticated: !!settings.claudecodeAuth?.isAuthenticated,
    email: settings.claudecodeAuth?.email,
    expiresAt: settings.claudecodeAuth?.expiresAt,
    lastRefresh: settings.claudecodeAuth?.lastRefresh,
    tokenSource: settings.claudecodeAuth?.tokenSource,
    apiKeySource: settings.claudecodeAuth?.apiKeySource,
    authUrl: settings.claudecodeAuth?.authUrl,
    output: settings.claudecodeAuth?.output,
    error: settings.claudecodeAuth?.error,
  };

  cachedAuthState = state;
  return state;
}

export function invalidateClaudeCodeAuthCache(): void {
  cachedAuthState = null;
}

export async function getClaudeCodeAuthStatus(
  timeoutMs = AUTH_STATUS_TIMEOUT_MS,
): Promise<ClaudeAgentSdkAuthStatus> {
  const status = await readClaudeAgentSdkAuthStatus({ timeoutMs });
  persistAuthState(status);
  return status;
}

export async function isClaudeCodeAuthenticated(): Promise<boolean> {
  const status = await getClaudeCodeAuthStatus();
  return status.authenticated;
}

export function clearClaudeCodeAuth(): void {
  const settings = loadSettings();
  settings.claudecodeAuth = {
    isAuthenticated: false,
    lastRefresh: Date.now(),
  };

  delete settings.claudecodeToken;
  delete settings.pendingClaudeCodeOAuth;

  saveSettings(settings);
  cachedAuthState = settings.claudecodeAuth;

  // Best effort: request logout through the Agent SDK, but don't block local cleanup.
  void attemptClaudeAgentSdkLogout().catch(() => undefined);
}
