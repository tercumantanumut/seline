/**
 * Antigravity OAuth Authorization Route
 * 
 * Generates the OAuth URL with PKCE for Antigravity authentication.
 * This route creates the authorization URL that the frontend will open.
 */

import { NextResponse } from "next/server";
import { ANTIGRAVITY_OAUTH } from "@/lib/auth/antigravity-auth";

/**
 * Generate a cryptographically random string for PKCE
 */
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

/**
 * Generate PKCE code verifier and challenge
 */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateRandomString(64);
  
  // Create SHA-256 hash of verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  
  // Convert to base64url
  const hashArray = new Uint8Array(hashBuffer);
  const base64 = btoa(String.fromCharCode(...hashArray));
  const challenge = base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  
  return { verifier, challenge };
}

/**
 * Encode state for OAuth (contains PKCE verifier and project ID)
 */
function encodeState(payload: { verifier: string; projectId: string }): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * GET /api/auth/antigravity/authorize
 * Generate OAuth authorization URL with PKCE
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || "";
    
    // Generate PKCE pair
    const pkce = await generatePKCE();
    
    // Build redirect URI for this environment
    const redirectUri = `${url.origin}/api/auth/antigravity/callback`;
    
    // Build OAuth URL
    const authUrl = new URL(ANTIGRAVITY_OAUTH.AUTH_URL);
    authUrl.searchParams.set("client_id", ANTIGRAVITY_OAUTH.CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", ANTIGRAVITY_OAUTH.SCOPES.join(" "));
    authUrl.searchParams.set("code_challenge", pkce.challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set(
      "state",
      encodeState({ verifier: pkce.verifier, projectId })
    );
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    
    return NextResponse.json({
      success: true,
      url: authUrl.toString(),
      verifier: pkce.verifier,
      projectId,
    });
  } catch (error) {
    console.error("[AntigravityAuthorize] Failed to generate auth URL:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}

