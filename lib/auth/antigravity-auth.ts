/**
 * Antigravity Authentication Module
 *
 * Manages OAuth token storage, refresh, and authentication for Antigravity's
 * free AI models (Gemini 3 Pro, Claude Sonnet 4.5, etc.).
 *
 * Antigravity uses Google OAuth for authentication and provides access to
 * premium AI models for authenticated users.
 *
 * Based on opencode-google-antigravity-auth plugin implementation.
 */

import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";
import { ANTIGRAVITY_MODEL_IDS, type AntigravityModelId } from "@/lib/auth/antigravity-models";

// Antigravity OAuth token structure
export interface AntigravityOAuthToken {
  type: "oauth";
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in milliseconds
  token_type?: string;
  scope?: string;
  project_id?: string; // Antigravity project ID
}

// Auth state stored in settings
export interface AntigravityAuthState {
  isAuthenticated: boolean;
  email?: string;
  expiresAt?: number;
  lastRefresh?: number;
  projectId?: string;
}

// Google OAuth configuration for Antigravity
// These are the official Antigravity OAuth credentials from opencode-google-antigravity-auth
export const ANTIGRAVITY_OAUTH = {
  CLIENT_ID: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  CLIENT_SECRET: "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",
  AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  USERINFO_URL: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
  SCOPES: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
  ],
} as const;

// Antigravity API configuration
export const ANTIGRAVITY_CONFIG = {
  // API endpoints in fallback order (daily → autopush → prod)
  // Daily sandbox is primary - it works, prod gives 500 errors
  API_ENDPOINTS: [
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://autopush-cloudcode-pa.sandbox.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
  ] as const,
  // Primary API endpoint (daily sandbox - tested and works)
  API_BASE_URL: "https://daily-cloudcode-pa.sandbox.googleapis.com",
  // API version
  API_VERSION: "v1internal",
  // OAuth callback port for desktop apps (matches opencode plugin)
  OAUTH_CALLBACK_PORT: 36742,
  // Token refresh threshold (refresh 5 minutes before expiry)
  REFRESH_THRESHOLD_MS: 5 * 60 * 1000,
  // Request headers for Antigravity API (matching opencode-antigravity-auth plugin)
  HEADERS: {
    "User-Agent": "antigravity/1.11.5 windows/amd64",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
  } as const,
  // Available models through Antigravity (verified working 2026-01-05)
  AVAILABLE_MODELS: ANTIGRAVITY_MODEL_IDS,
} as const;

export type AntigravityModel = AntigravityModelId;

// Cache for current auth state
let cachedAuthState: AntigravityAuthState | null = null;
let cachedToken: AntigravityOAuthToken | null = null;

/**
 * Get the current Antigravity authentication state from settings
 */
export function getAntigravityAuthState(): AntigravityAuthState {
  if (cachedAuthState) {
    return cachedAuthState;
  }

  const settings = loadSettings();
  const state: AntigravityAuthState = {
    isAuthenticated: !!settings.antigravityAuth?.isAuthenticated,
    email: settings.antigravityAuth?.email,
    expiresAt: settings.antigravityAuth?.expiresAt,
    lastRefresh: settings.antigravityAuth?.lastRefresh,
  };

  cachedAuthState = state;
  return state;
}

/**
 * Get the stored OAuth token for Antigravity
 */
export function getAntigravityToken(): AntigravityOAuthToken | null {
  if (cachedToken) {
    return cachedToken;
  }

  const settings = loadSettings();
  if (!settings.antigravityToken) {
    return null;
  }

  cachedToken = settings.antigravityToken;
  return cachedToken;
}

/**
 * Check if the current token is valid and not expired
 */
export function isAntigravityTokenValid(): boolean {
  const token = getAntigravityToken();
  if (!token) {
    return false;
  }

  const now = Date.now();
  const expiresAt = token.expires_at;
  
  // Token is valid if it expires more than the threshold from now
  return expiresAt > (now + ANTIGRAVITY_CONFIG.REFRESH_THRESHOLD_MS);
}

/**
 * Check if the token needs refresh (approaching expiry)
 */
export function needsTokenRefresh(): boolean {
  const token = getAntigravityToken();
  if (!token) {
    return false;
  }

  const now = Date.now();
  const expiresAt = token.expires_at;
  
  // Needs refresh if within threshold but not yet expired
  return expiresAt <= (now + ANTIGRAVITY_CONFIG.REFRESH_THRESHOLD_MS) && expiresAt > now;
}

/**
 * Save Antigravity OAuth token and update auth state
 */
export function saveAntigravityToken(
  token: AntigravityOAuthToken,
  email?: string
): void {
  const settings = loadSettings();
  
  // Update token
  settings.antigravityToken = token;
  
  // Update auth state
  settings.antigravityAuth = {
    isAuthenticated: true,
    email: email || settings.antigravityAuth?.email,
    expiresAt: token.expires_at,
    lastRefresh: Date.now(),
  };

  saveSettings(settings);

  // Invalidate cache
  cachedToken = token;
  cachedAuthState = settings.antigravityAuth;

  console.log("[AntigravityAuth] Token saved, expires at:", new Date(token.expires_at).toISOString());
}

/**
 * Clear Antigravity authentication (logout)
 */
export function clearAntigravityAuth(): void {
  const settings = loadSettings();

  delete settings.antigravityToken;
  settings.antigravityAuth = {
    isAuthenticated: false,
  };

  saveSettings(settings);

  // Clear cache
  cachedToken = null;
  cachedAuthState = { isAuthenticated: false };

  console.log("[AntigravityAuth] Authentication cleared");
}

/**
 * Get the access token for API requests.
 * Returns null if not authenticated or token expired.
 */
export function getAntigravityAccessToken(): string | null {
  const token = getAntigravityToken();
  if (!token) {
    return null;
  }

  // Check if token is expired
  if (token.expires_at <= Date.now()) {
    console.warn("[AntigravityAuth] Token has expired");
    return null;
  }

  return token.access_token;
}

/**
 * Invalidate the cached auth state (call when settings change externally)
 */
export function invalidateAntigravityAuthCache(): void {
  cachedToken = null;
  cachedAuthState = null;
}

/**
 * Check if Antigravity is configured and authenticated
 */
export function isAntigravityAuthenticated(): boolean {
  const state = getAntigravityAuthState();
  if (!state.isAuthenticated) {
    return false;
  }

  return isAntigravityTokenValid();
}

/**
 * Get authorization header for Antigravity API requests
 */
export function getAntigravityAuthHeader(): string | null {
  const accessToken = getAntigravityAccessToken();
  if (!accessToken) {
    return null;
  }

  return `Bearer ${accessToken}`;
}

/**
 * Parse OAuth token from callback response
 */
export function parseOAuthCallbackToken(responseData: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  project_id?: string;
}): AntigravityOAuthToken {
  const expiresIn = responseData.expires_in || 3600; // Default 1 hour

  return {
    type: "oauth",
    access_token: responseData.access_token,
    refresh_token: responseData.refresh_token || "",
    expires_at: Date.now() + (expiresIn * 1000),
    token_type: responseData.token_type || "Bearer",
    scope: responseData.scope,
    project_id: responseData.project_id,
  };
}

/**
 * Refresh the Antigravity OAuth token using Google's OAuth refresh endpoint.
 * Returns true if refresh was successful, false otherwise.
 */
export async function refreshAntigravityToken(): Promise<boolean> {
  const token = getAntigravityToken();
  if (!token || !token.refresh_token) {
    console.warn("[AntigravityAuth] No refresh token available");
    return false;
  }

  try {
    console.log("[AntigravityAuth] Attempting token refresh...");

    // Parse the refresh token - it may contain project ID appended
    let refreshToken = token.refresh_token;
    let projectId = token.project_id || "";

    // Handle format: "refreshToken|projectId"
    if (refreshToken.includes("|")) {
      const parts = refreshToken.split("|");
      refreshToken = parts[0] || refreshToken;
      projectId = parts[1] || projectId;
    }

    // Use Google's OAuth token refresh endpoint
    const response = await fetch(ANTIGRAVITY_OAUTH.TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_OAUTH.CLIENT_ID,
        client_secret: ANTIGRAVITY_OAUTH.CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AntigravityAuth] Token refresh failed:", response.status, errorText);
      return false;
    }

    const data = await response.json();

    if (data.access_token) {
      const newToken: AntigravityOAuthToken = {
        type: "oauth",
        access_token: data.access_token,
        // Google doesn't always return a new refresh token, keep the old one
        refresh_token: data.refresh_token || token.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        token_type: data.token_type || "Bearer",
        scope: data.scope,
        project_id: projectId,
      };

      const authState = getAntigravityAuthState();
      saveAntigravityToken(newToken, authState.email);

      console.log("[AntigravityAuth] Token refreshed successfully");
      return true;
    }

    return false;
  } catch (error) {
    console.error("[AntigravityAuth] Token refresh error:", error);
    return false;
  }
}

/**
 * Ensure the token is valid, refreshing if necessary.
 * Returns true if token is valid (or was successfully refreshed), false otherwise.
 */
export async function ensureValidToken(): Promise<boolean> {
  if (isAntigravityTokenValid()) {
    return true;
  }

  if (needsTokenRefresh()) {
    return await refreshAntigravityToken();
  }

  // Token is expired and can't be refreshed
  return false;
}

/**
 * Fetch the Antigravity project ID via loadCodeAssist API
 * This is required for making API requests
 */
export async function fetchAntigravityProjectId(): Promise<string | null> {
  const token = getAntigravityToken();
  if (!token) {
    console.error("[AntigravityAuth] No token available to fetch project ID");
    return null;
  }

  // Already have project_id
  if (token.project_id) {
    return token.project_id;
  }

  const loadCodeAssistUrl = `${ANTIGRAVITY_CONFIG.API_BASE_URL}/${ANTIGRAVITY_CONFIG.API_VERSION}:loadCodeAssist`;
  const PROJECT_ID_FETCH_TIMEOUT_MS = 30 * 1000;

  try {
    console.log("[AntigravityAuth] Fetching project ID via loadCodeAssist...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROJECT_ID_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(loadCodeAssistUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_CONFIG.HEADERS,
        },
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        console.error("[AntigravityAuth] loadCodeAssist timed out");
      } else {
        throw error;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      const data = await response.json();
      const projectId = data.cloudaicompanionProject || data.id;

      if (projectId) {
        console.log("[AntigravityAuth] Fetched project ID:", projectId);

        // Save updated token with project_id
        const updatedToken: AntigravityOAuthToken = {
          ...token,
          project_id: projectId,
        };
        const authState = getAntigravityAuthState();
        saveAntigravityToken(updatedToken, authState.email);

        return projectId;
      }
    } else {
      const text = await response.text();
      console.error("[AntigravityAuth] loadCodeAssist failed:", response.status, text.substring(0, 200));
    }
  } catch (error) {
    console.error("[AntigravityAuth] loadCodeAssist error:", error);
  }

  return null;
}

/**
 * Get model display name for UI
 */
export { getAntigravityModelDisplayName, getAntigravityModels } from "@/lib/auth/antigravity-models";
