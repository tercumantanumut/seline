import { NextResponse } from "next/server";
import { exchangeClaudeCodeManualCode } from "@/lib/auth/claudecode-oauth-server";

/**
 * POST /api/auth/claudecode/exchange
 * Body: { code: string }
 *
 * Exchanges a manually-pasted authorization code (from Anthropic's console callback page)
 * for OAuth tokens.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = body.code;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing authorization code" },
        { status: 400 }
      );
    }

    const result = await exchangeClaudeCodeManualCode(code);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ClaudeCodeExchange] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to exchange authorization code" },
      { status: 500 }
    );
  }
}
