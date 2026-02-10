import crypto from "crypto";
import { NextResponse } from "next/server";
import { CLAUDECODE_OAUTH } from "@/lib/auth/claudecode-auth";
import { registerClaudeCodeOAuthState } from "@/lib/auth/claudecode-oauth-server";

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function GET(request: Request) {
  try {
    const { verifier, challenge } = generatePkce();
    const state = generateState();
    const origin = new URL(request.url).origin;

    // Store the PKCE verifier and state for later code exchange
    registerClaudeCodeOAuthState(state, verifier, origin);

    const authUrl = new URL(CLAUDECODE_OAUTH.AUTH_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", CLAUDECODE_OAUTH.CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", CLAUDECODE_OAUTH.REDIRECT_URI);
    authUrl.searchParams.set("scope", CLAUDECODE_OAUTH.SCOPES);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code", "true");

    return NextResponse.json({
      success: true,
      url: authUrl.toString(),
      state,
    });
  } catch (error) {
    console.error("[ClaudeCodeAuthorize] Failed to generate auth URL:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}
