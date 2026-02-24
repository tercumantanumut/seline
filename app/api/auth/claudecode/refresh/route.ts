import { NextResponse } from "next/server";
import { getClaudeCodeAuthStatus } from "@/lib/auth/claudecode-auth";

export async function POST() {
  try {
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
