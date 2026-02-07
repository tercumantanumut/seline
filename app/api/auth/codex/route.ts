import { NextResponse } from "next/server";
import {
  clearCodexAuth,
  decodeCodexJWT,
  getCodexAuthState,
  invalidateCodexAuthCache,
  isCodexAuthenticated,
  saveCodexToken,
  type CodexOAuthToken,
} from "@/lib/auth/codex-auth";
import { CODEX_MODEL_IDS } from "@/lib/auth/codex-models";
import { invalidateProviderCache } from "@/lib/ai/providers";
import { invalidateSettingsCache } from "@/lib/settings/settings-manager";

export async function GET() {
  try {
    invalidateSettingsCache();
    invalidateCodexAuthCache();

    const authState = getCodexAuthState();
    const authenticated = isCodexAuthenticated();

    return NextResponse.json({
      success: true,
      authenticated,
      email: authState.email,
      accountId: authState.accountId,
      expiresAt: authState.expiresAt,
      availableModels: authenticated ? CODEX_MODEL_IDS : [],
    });
  } catch (error) {
    console.error("[CodexAuth] Failed to get auth status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get authentication status" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.access_token) {
      const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
      const token: CodexOAuthToken = {
        type: "oauth",
        access_token: body.access_token,
        refresh_token: body.refresh_token || "",
        expires_at: Date.now() + expiresIn * 1000,
      };

      const decoded = decodeCodexJWT(token.access_token);
      saveCodexToken(token, decoded?.email, decoded?.accountId, true);
      invalidateProviderCache();

      return NextResponse.json({
        success: true,
        message: "Codex authentication saved",
        expiresAt: token.expires_at,
      });
    }

    if (body.token && body.token.access_token) {
      const token: CodexOAuthToken = {
        type: "oauth",
        access_token: body.token.access_token,
        refresh_token: body.token.refresh_token || "",
        expires_at: body.token.expires_at || Date.now() + 3600 * 1000,
      };

      const decoded = decodeCodexJWT(token.access_token);
      saveCodexToken(token, decoded?.email, decoded?.accountId, true);
      invalidateProviderCache();

      return NextResponse.json({
        success: true,
        message: "Codex authentication saved",
        expiresAt: token.expires_at,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid token format" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[CodexAuth] Failed to save token:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save authentication" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    clearCodexAuth();
    invalidateProviderCache();
    return NextResponse.json({
      success: true,
      message: "Codex authentication cleared",
    });
  } catch (error) {
    console.error("[CodexAuth] Failed to clear auth:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear authentication" },
      { status: 500 }
    );
  }
}
