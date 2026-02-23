import { NextResponse } from "next/server";
import { getClaudeCodeAuthStatus } from "@/lib/auth/claudecode-auth";

/**
 * POST /api/auth/claudecode/exchange
 *
 * Manual authorization code exchange is removed for Agent SDK mode.
 * Clients should re-check SDK auth status after completing login externally.
 */
export async function POST() {
  try {
    const status = await getClaudeCodeAuthStatus();

    return NextResponse.json({
      success: status.authenticated,
      authenticated: status.authenticated,
      error: status.authenticated
        ? undefined
        : "Claude Agent SDK is not authenticated yet. Complete login and try again.",
      output: status.output,
      url: status.authUrl || null,
    });
  } catch (error) {
    console.error("[ClaudeCodeExchange] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to verify authentication status" },
      { status: 500 },
    );
  }
}
