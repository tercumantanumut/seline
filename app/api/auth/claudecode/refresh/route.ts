import { NextResponse } from "next/server";
import { getClaudeCodeAuthStatus } from "@/lib/auth/claudecode-auth";
import { killLoginProcess } from "@/lib/auth/claude-login-process";

export async function POST() {
  try {
    // Kill any hanging login subprocess before running the Agent SDK check.
    // A stale `claude login` process interferes with the Agent SDK query.
    killLoginProcess();

    const status = await getClaudeCodeAuthStatus();

    return NextResponse.json({
      refreshed: status.authenticated,
      authenticated: status.authenticated,
      reason: status.authenticated ? "authenticated" : "not_authenticated",
      output: status.output,
      url: status.authUrl || null,
      error: status.error,
    });
  } catch (error) {
    console.error("[ClaudeCodeRefresh] Error:", error);
    return NextResponse.json(
      { refreshed: false, reason: "error" },
      { status: 500 },
    );
  }
}
