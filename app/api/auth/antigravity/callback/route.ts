/**
 * Antigravity OAuth Callback Route
 *
 * Receives the OAuth callback from Google after user authenticates.
 * This route is called by the browser after the OAuth flow completes.
 *
 * Uses Google OAuth token exchange with PKCE verification.
 */

import { NextResponse } from "next/server";
import {
  saveAntigravityToken,
  parseOAuthCallbackToken,
  ANTIGRAVITY_OAUTH,
  ANTIGRAVITY_CONFIG,
} from "@/lib/auth/antigravity-auth";
import { invalidateProviderCache } from "@/lib/ai/providers";

const OAUTH_FETCH_TIMEOUT_MS = 510 * 1000;

function createTimeoutError(label: string, timeoutMs: number): Error {
  const error = new Error(`${label} request timed out after ${Math.round(timeoutMs / 1000)}s`);
  error.name = "AbortError";
  return error;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OAUTH_FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw createTimeoutError(label, OAUTH_FETCH_TIMEOUT_MS);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Decode the OAuth state parameter to extract PKCE verifier and project ID
 */
function decodeState(state: string): { verifier: string; projectId: string } {
  try {
    const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed.verifier !== "string") {
      throw new Error("Missing PKCE verifier in state");
    }
    return {
      verifier: parsed.verifier,
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : "",
    };
  } catch (e) {
    throw new Error(`Failed to decode OAuth state: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * GET /api/auth/antigravity/callback
 * Handle OAuth callback with authorization code or token
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const state = url.searchParams.get("state");

    // Handle OAuth errors
    if (error) {
      console.error("[AntigravityCallback] OAuth error:", error);
      return new NextResponse(
        generateCallbackHTML(false, `Authentication failed: ${error}`),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // If we have an authorization code, exchange it for tokens
    if (code && state) {
      try {
        // Decode state to get PKCE verifier
        const { verifier } = decodeState(state);
        const tokenResponse = await exchangeCodeForToken(code, verifier, url);

        if (tokenResponse.access_token) {
          const token = parseOAuthCallbackToken(tokenResponse);
          saveAntigravityToken(token, tokenResponse.email, true);
          invalidateProviderCache();

          return new NextResponse(
            generateCallbackHTML(true, "Authentication successful! You can close this window."),
            { headers: { "Content-Type": "text/html" } }
          );
        }
      } catch (exchangeError) {
        console.error("[AntigravityCallback] Token exchange failed:", exchangeError);
        return new NextResponse(
          generateCallbackHTML(false, `Failed to exchange authorization code: ${exchangeError instanceof Error ? exchangeError.message : "Unknown error"}`),
          { headers: { "Content-Type": "text/html" } }
        );
      }
    }

    // No code or error - invalid callback
    return new NextResponse(
      generateCallbackHTML(false, "Invalid callback - no authorization code or state received"),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error) {
    console.error("[AntigravityCallback] Callback error:", error);
    return new NextResponse(
      generateCallbackHTML(false, "An unexpected error occurred"),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

/**
 * Exchange authorization code for access token using Google OAuth
 */
async function exchangeCodeForToken(code: string, verifier: string, requestUrl: URL): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  email?: string;
  project_id?: string;
}> {
  // Build redirect URI from the request URL (this is the callback URL)
  const redirectUri = `${requestUrl.origin}/api/auth/antigravity/callback`;

  // Exchange code with Google's token endpoint
  const tokenResponse = await fetchWithTimeout(
    ANTIGRAVITY_OAUTH.TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_OAUTH.CLIENT_ID,
        client_secret: ANTIGRAVITY_OAUTH.CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    },
    "Token exchange"
  );

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
  }

  const tokenData = await tokenResponse.json();

  // Fetch user info to get email
  let email: string | undefined;
  try {
    const userInfoResponse = await fetchWithTimeout(
      ANTIGRAVITY_OAUTH.USERINFO_URL,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      },
      "User info"
    );

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      email = userInfo.email;
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e;
    }
    console.warn("[AntigravityCallback] Failed to fetch user info:", e);
  }

  // Fetch account info to get project ID
  let projectId: string | undefined;
  try {
    projectId = await fetchAccountProjectId(tokenData.access_token);
  } catch (e) {
    console.warn("[AntigravityCallback] Failed to fetch account info:", e);
  }

  return {
    ...tokenData,
    email,
    project_id: projectId,
  };
}

/**
 * Fetch the user's Antigravity project ID from the API
 */
async function fetchAccountProjectId(accessToken: string): Promise<string | undefined> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...ANTIGRAVITY_CONFIG.HEADERS,
  };

  for (const endpoint of ANTIGRAVITY_CONFIG.API_ENDPOINTS) {
    try {
      const url = `${endpoint}/${ANTIGRAVITY_CONFIG.API_VERSION}:loadCodeAssist`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();

      // Extract Project ID from response
      if (typeof data.cloudaicompanionProject === "string" && data.cloudaicompanionProject) {
        return data.cloudaicompanionProject;
      } else if (data.cloudaicompanionProject?.id) {
        return data.cloudaicompanionProject.id;
      }
    } catch (e) {
      continue;
    }
  }

  return undefined;
}

/**
 * Generate HTML page for OAuth callback result
 */
function generateCallbackHTML(success: boolean, message: string): string {
  const bgColor = success ? "#10b981" : "#ef4444";
  const icon = success ? "OK" : "!";
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>Antigravity Authentication</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${bgColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      margin: 0 auto 20px;
    }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 0; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${success ? "Success!" : "Error"}</h1>
    <p>${message}</p>
  </div>
  <script>
    // Notify parent window if in popup
    if (window.opener) {
      const targetOrigin = window.location.origin;
      window.opener.postMessage({ type: 'antigravity-auth', success: ${success} }, targetOrigin);
    }
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`;
}
