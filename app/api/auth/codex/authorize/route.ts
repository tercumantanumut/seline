import crypto from "crypto";
import { NextResponse } from "next/server";
import { CODEX_OAUTH } from "@/lib/auth/codex-auth";
import { ensureCodexOAuthServer, registerCodexOAuthState } from "@/lib/auth/codex-oauth-server";

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

    registerCodexOAuthState(state, verifier, origin);

    const serverReady = await ensureCodexOAuthServer();
    if (!serverReady) {
      return NextResponse.json(
        { success: false, error: "Failed to start local OAuth server on port 1455" },
        { status: 500 }
      );
    }

    const authUrl = new URL(CODEX_OAUTH.AUTH_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", CODEX_OAUTH.CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", CODEX_OAUTH.REDIRECT_URI);
    authUrl.searchParams.set("scope", CODEX_OAUTH.SCOPES);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("id_token_add_organizations", "true");
    authUrl.searchParams.set("codex_cli_simplified_flow", "true");
    authUrl.searchParams.set("originator", "codex_cli_rs");

    return NextResponse.json({
      success: true,
      url: authUrl.toString(),
    });
  } catch (error) {
    console.error("[CodexAuthorize] Failed to generate auth URL:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}
