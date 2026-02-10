import { NextResponse } from "next/server";
import {
  clearClaudeCodeAuth,
  getClaudeCodeAuthState,
  invalidateClaudeCodeAuthCache,
  isClaudeCodeAuthenticated,
  saveClaudeCodeToken,
  type ClaudeCodeOAuthToken,
} from "@/lib/auth/claudecode-auth";
import { CLAUDECODE_MODEL_IDS } from "@/lib/auth/claudecode-models";
import { invalidateProviderCache } from "@/lib/ai/providers";
import { invalidateSettingsCache } from "@/lib/settings/settings-manager";

export async function GET() {
  try {
    invalidateSettingsCache();
    invalidateClaudeCodeAuthCache();

    const authState = getClaudeCodeAuthState();
    const authenticated = isClaudeCodeAuthenticated();

    return NextResponse.json({
      success: true,
      authenticated,
      email: authState.email,
      expiresAt: authState.expiresAt,
      availableModels: authenticated ? [...CLAUDECODE_MODEL_IDS] : [],
    });
  } catch (error) {
    console.error("[ClaudeCodeAuth] Failed to get auth status:", error);
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
      const token: ClaudeCodeOAuthToken = {
        type: "oauth",
        access_token: body.access_token,
        refresh_token: body.refresh_token || "",
        expires_at: Date.now() + expiresIn * 1000,
      };

      saveClaudeCodeToken(token, body.email, true);
      invalidateProviderCache();

      return NextResponse.json({
        success: true,
        message: "Claude Code authentication saved",
        expiresAt: token.expires_at,
      });
    }

    if (body.token && body.token.access_token) {
      const token: ClaudeCodeOAuthToken = {
        type: "oauth",
        access_token: body.token.access_token,
        refresh_token: body.token.refresh_token || "",
        expires_at: body.token.expires_at || Date.now() + 3600 * 1000,
      };

      saveClaudeCodeToken(token, body.email, true);
      invalidateProviderCache();

      return NextResponse.json({
        success: true,
        message: "Claude Code authentication saved",
        expiresAt: token.expires_at,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid token format" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[ClaudeCodeAuth] Failed to save token:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save authentication" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    clearClaudeCodeAuth();
    invalidateProviderCache();
    return NextResponse.json({
      success: true,
      message: "Claude Code authentication cleared",
    });
  } catch (error) {
    console.error("[ClaudeCodeAuth] Failed to clear auth:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear authentication" },
      { status: 500 }
    );
  }
}
