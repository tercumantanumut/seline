/**
 * Antigravity OAuth API Routes
 * 
 * Handles OAuth token storage and status for Antigravity authentication.
 * The actual OAuth flow is initiated by Electron via IPC (opens browser).
 */

import { NextResponse } from "next/server";
import {
  getAntigravityAuthState,
  saveAntigravityToken,
  clearAntigravityAuth,
  isAntigravityAuthenticated,
  parseOAuthCallbackToken,
  invalidateAntigravityAuthCache,
  ANTIGRAVITY_CONFIG,
  type AntigravityOAuthToken,
} from "@/lib/auth/antigravity-auth";
import { invalidateProviderCacheFor } from "@/lib/ai/providers";
import { invalidateSettingsCache } from "@/lib/settings/settings-manager";

/**
 * GET /api/auth/antigravity
 * Get current Antigravity authentication status
 */
export async function GET() {
  try {
    // Invalidate all caches to get fresh state from disk
    invalidateSettingsCache();
    invalidateAntigravityAuthCache();

    const authState = getAntigravityAuthState();
    const isAuthenticated = isAntigravityAuthenticated();
    
    return NextResponse.json({
      success: true,
      authenticated: isAuthenticated,
      email: authState.email,
      expiresAt: authState.expiresAt,
      availableModels: isAuthenticated ? ANTIGRAVITY_CONFIG.AVAILABLE_MODELS : [],
    });
  } catch (error) {
    console.error("[AntigravityAuth] Failed to get auth status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get authentication status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/antigravity
 * Save OAuth token from callback or manual input
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Handle token from OAuth callback
    if (body.access_token) {
      const token = parseOAuthCallbackToken({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_in: body.expires_in,
        token_type: body.token_type,
        scope: body.scope,
      });
      
      saveAntigravityToken(token, body.email, true);
      invalidateProviderCacheFor("antigravity");
      
      return NextResponse.json({
        success: true,
        message: "Antigravity authentication saved",
        expiresAt: token.expires_at,
      });
    }
    
    // Handle pre-formatted token object
    if (body.token && body.token.access_token) {
      const token: AntigravityOAuthToken = {
        type: "oauth",
        access_token: body.token.access_token,
        refresh_token: body.token.refresh_token || "",
        expires_at: body.token.expires_at || Date.now() + 3600000, // 1 hour default
        token_type: body.token.token_type || "Bearer",
        scope: body.token.scope,
      };
      
      saveAntigravityToken(token, body.email, true);
      invalidateProviderCacheFor("antigravity");
      
      return NextResponse.json({
        success: true,
        message: "Antigravity authentication saved",
        expiresAt: token.expires_at,
      });
    }
    
    return NextResponse.json(
      { success: false, error: "Invalid token format" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[AntigravityAuth] Failed to save token:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save authentication" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/antigravity
 * Clear Antigravity authentication (logout)
 */
export async function DELETE() {
  try {
    clearAntigravityAuth();
    invalidateProviderCacheFor("antigravity");
    
    return NextResponse.json({
      success: true,
      message: "Antigravity authentication cleared",
    });
  } catch (error) {
    console.error("[AntigravityAuth] Failed to clear auth:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear authentication" },
      { status: 500 }
    );
  }
}

