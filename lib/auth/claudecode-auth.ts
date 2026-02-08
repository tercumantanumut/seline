import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";

export interface ClaudeCodeOAuthToken {
  type: "oauth";
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface ClaudeCodeAuthState {
  isAuthenticated: boolean;
  email?: string;
  expiresAt?: number;
  lastRefresh?: number;
}

export const CLAUDECODE_OAUTH = {
  CLIENT_ID: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  AUTH_URL: "https://claude.ai/oauth/authorize",
  TOKEN_URL: "https://console.anthropic.com/v1/oauth/token",
  REDIRECT_URI: "https://console.anthropic.com/oauth/code/callback",
  SCOPES: "org:create_api_key user:profile user:inference",
} as const;

export const CLAUDECODE_CONFIG = {
  API_BASE_URL: "https://api.anthropic.com",
  ANTHROPIC_VERSION: "2023-06-01",
  REFRESH_THRESHOLD_MS: 15 * 60 * 1000,
  BETA_HEADERS: [
    "claude-code-20250219",
    "oauth-2025-04-20",
    "interleaved-thinking-2025-05-14",
    "fine-grained-tool-streaming-2025-05-14",
  ],
  REQUIRED_SYSTEM_PREFIX: "You are Claude Code, Anthropic's official CLI for Claude.",
} as const;

let cachedAuthState: ClaudeCodeAuthState | null = null;
let cachedToken: ClaudeCodeOAuthToken | null = null;

export function getClaudeCodeAuthState(): ClaudeCodeAuthState {
  if (cachedAuthState) return cachedAuthState;

  const settings = loadSettings();
  const state: ClaudeCodeAuthState = {
    isAuthenticated: !!settings.claudecodeAuth?.isAuthenticated,
    email: settings.claudecodeAuth?.email,
    expiresAt: settings.claudecodeAuth?.expiresAt,
    lastRefresh: settings.claudecodeAuth?.lastRefresh,
  };

  cachedAuthState = state;
  return state;
}

export function getClaudeCodeToken(): ClaudeCodeOAuthToken | null {
  if (cachedToken) return cachedToken;

  const settings = loadSettings();
  if (!settings.claudecodeToken) return null;

  cachedToken = settings.claudecodeToken;
  return cachedToken;
}

export function isClaudeCodeTokenValid(): boolean {
  const token = getClaudeCodeToken();
  if (!token) return false;

  const now = Date.now();
  return token.expires_at > (now + CLAUDECODE_CONFIG.REFRESH_THRESHOLD_MS);
}

export function needsClaudeCodeTokenRefresh(): boolean {
  const token = getClaudeCodeToken();
  if (!token) return false;

  const now = Date.now();
  const expiresAt = token.expires_at;
  return expiresAt <= (now + CLAUDECODE_CONFIG.REFRESH_THRESHOLD_MS) && expiresAt > now;
}

export function saveClaudeCodeToken(
  token: ClaudeCodeOAuthToken,
  email?: string,
  setAsActiveProvider = false
): void {
  const settings = loadSettings();

  settings.claudecodeToken = token;

  settings.claudecodeAuth = {
    isAuthenticated: true,
    email: email || settings.claudecodeAuth?.email,
    expiresAt: token.expires_at,
    lastRefresh: Date.now(),
  };

  if (setAsActiveProvider) {
    settings.llmProvider = "claudecode";
  }

  saveSettings(settings);

  cachedToken = token;
  cachedAuthState = settings.claudecodeAuth;
}

export function clearClaudeCodeAuth(): void {
  const settings = loadSettings();
  delete settings.claudecodeToken;
  settings.claudecodeAuth = { isAuthenticated: false };
  saveSettings(settings);

  cachedToken = null;
  cachedAuthState = { isAuthenticated: false };
}

export function invalidateClaudeCodeAuthCache(): void {
  cachedToken = null;
  cachedAuthState = null;
}

export function getClaudeCodeAccessToken(): string | null {
  const token = getClaudeCodeToken();
  if (!token) return null;

  if (token.expires_at <= Date.now()) {
    return null;
  }

  return token.access_token;
}

export function isClaudeCodeAuthenticated(): boolean {
  const state = getClaudeCodeAuthState();
  if (!state.isAuthenticated) return false;
  return isClaudeCodeTokenValid();
}

export async function refreshClaudeCodeToken(): Promise<boolean> {
  const token = getClaudeCodeToken();
  if (!token?.refresh_token) {
    return false;
  }

  try {
    const response = await fetch(CLAUDECODE_OAUTH.TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        client_id: CLAUDECODE_OAUTH.CLIENT_ID,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ClaudeCodeAuth] Token refresh failed:", response.status, errorText);
      return false;
    }

    const data = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!data.access_token || typeof data.expires_in !== "number") {
      console.error("[ClaudeCodeAuth] Token refresh response missing fields:", data);
      return false;
    }

    const newToken: ClaudeCodeOAuthToken = {
      type: "oauth",
      access_token: data.access_token,
      refresh_token: data.refresh_token || token.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };

    saveClaudeCodeToken(newToken);
    return true;
  } catch (error) {
    console.error("[ClaudeCodeAuth] Token refresh error:", error);
    return false;
  }
}

export async function ensureValidClaudeCodeToken(): Promise<boolean> {
  if (isClaudeCodeTokenValid()) return true;
  if (needsClaudeCodeTokenRefresh()) {
    return refreshClaudeCodeToken();
  }
  return false;
}

export async function exchangeClaudeCodeAuthorizationCode(
  code: string,
  verifier: string,
  redirectUri: string = CLAUDECODE_OAUTH.REDIRECT_URI,
  state?: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  const payload: Record<string, string | undefined> = {
    grant_type: "authorization_code",
    client_id: CLAUDECODE_OAUTH.CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    state,
  };

  // Remove undefined values
  const cleanPayload = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined)
  );

  const response = await fetch(CLAUDECODE_OAUTH.TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cleanPayload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[ClaudeCodeAuth] Code exchange failed:", response.status, text);
    return null;
  }

  const data = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token || typeof data.expires_in !== "number") {
    console.error("[ClaudeCodeAuth] Code exchange response missing fields:", data);
    return null;
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || "",
    expires_in: data.expires_in,
  };
}
