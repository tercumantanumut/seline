import { NextResponse } from "next/server";
import { getClaudeCodeAuthStatus } from "@/lib/auth/claudecode-auth";
import { submitClaudeLoginCode } from "@/lib/auth/claude-login-process";

/**
 * POST /api/auth/claudecode/exchange
 *
 * Accepts { code: string } and pipes it to the waiting `claude login` subprocess.
 * Falls back to re-checking SDK auth status if no active process exists
 * (e.g. user already authenticated via terminal).
 */
export async function POST(req: Request) {
  try {
    let code: string | undefined;
    try {
      const body = await req.json();
      code = body?.code;
    } catch {
      // body may be empty for backwards-compat callers
    }

    if (code?.trim()) {
      const result = await submitClaudeLoginCode(code.trim());

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error ?? "Authentication failed" },
          { status: 400 },
        );
      }
    }

    // Verify final auth state via Agent SDK (source of truth).
    const status = await getClaudeCodeAuthStatus();

    return NextResponse.json({
      success: status.authenticated,
      authenticated: status.authenticated,
      error: status.authenticated
        ? undefined
        : "Claude Agent SDK is not authenticated yet. Complete login and try again.",
      output: status.output,
      url: status.authUrl ?? null,
    });
  } catch (error) {
    console.error("[ClaudeCodeExchange] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to verify authentication status" },
      { status: 500 },
    );
  }
}
