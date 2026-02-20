import {
  CLAUDECODE_OAUTH,
  exchangeClaudeCodeAuthorizationCode,
  saveClaudeCodeToken,
  type ClaudeCodeOAuthToken,
} from "@/lib/auth/claudecode-auth";
import { loadSettings, saveSettings, invalidateSettingsCache } from "@/lib/settings/settings-manager";
import { invalidateProviderCacheFor } from "@/lib/ai/providers";

/**
 * Register a pending OAuth state + PKCE verifier for later code exchange.
 * Persisted to disk so it survives Next.js dev recompilation / module reloads.
 */
export function registerClaudeCodeOAuthState(state: string, verifier: string, origin: string): void {
  const settings = loadSettings();
  settings.pendingClaudeCodeOAuth = {
    state,
    verifier,
    origin,
    createdAt: Date.now(),
  };
  saveSettings(settings);
}

/**
 * Exchange an authorization code (from the console callback page) for tokens.
 * The user pastes a value in the format "code" or "code#state".
 * Returns true on success.
 */
export async function exchangeClaudeCodeManualCode(
  rawInput: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = rawInput.trim();

  let code: string;
  let state: string | undefined;

  // The console callback page may return "code#state" or just "code"
  if (trimmed.includes("#")) {
    const parts = trimmed.split("#");
    code = parts[0];
    state = parts[1];
  } else {
    code = trimmed;
  }

  if (!code) {
    return { success: false, error: "No authorization code provided" };
  }

  // Load the pending state from disk (survives module reloads)
  invalidateSettingsCache();
  const settings = loadSettings();
  const pending = settings.pendingClaudeCodeOAuth;

  if (!pending) {
    return { success: false, error: "No pending authorization found. Please restart the sign-in flow." };
  }

  // If a state was provided in the pasted code, verify it matches
  if (state && state !== pending.state) {
    console.warn("[ClaudeCodeOAuth] State mismatch: expected", pending.state, "got", state);
    // Still try — the user may have pasted only the code portion
  }

  // Check if the pending state is too old (10 minutes)
  const MAX_AGE_MS = 10 * 60 * 1000;
  if (Date.now() - pending.createdAt > MAX_AGE_MS) {
    // Clean up expired state
    delete settings.pendingClaudeCodeOAuth;
    saveSettings(settings);
    return { success: false, error: "Authorization expired. Please restart the sign-in flow." };
  }

  // Use the state from the pending auth for the exchange
  const exchangeState = state || pending.state;

  try {
    const tokenResponse = await exchangeClaudeCodeAuthorizationCode(
      code,
      pending.verifier,
      CLAUDECODE_OAUTH.REDIRECT_URI,
      exchangeState,
    );

    // Clean up the pending state regardless of outcome
    delete settings.pendingClaudeCodeOAuth;
    saveSettings(settings);

    if (!tokenResponse) {
      return { success: false, error: "Token exchange failed. The code may have expired." };
    }

    const token: ClaudeCodeOAuthToken = {
      type: "oauth",
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: Date.now() + tokenResponse.expires_in * 1000,
    };

    saveClaudeCodeToken(token, undefined, true);
    invalidateProviderCacheFor("claudecode");

    return { success: true };
  } catch (error) {
    // Clean up on error too
    try {
      const s = loadSettings();
      delete s.pendingClaudeCodeOAuth;
      saveSettings(s);
    } catch { /* ignore cleanup errors */ }

    console.error("[ClaudeCodeOAuth] Manual code exchange error:", error);
    return { success: false, error: "Failed to exchange authorization code" };
  }
}
