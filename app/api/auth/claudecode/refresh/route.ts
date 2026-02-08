import { NextResponse } from "next/server";
import {
  getClaudeCodeToken,
  needsClaudeCodeTokenRefresh,
  refreshClaudeCodeToken,
} from "@/lib/auth/claudecode-auth";

export async function POST() {
  try {
    const token = getClaudeCodeToken();

    if (!token) {
      return NextResponse.json({ refreshed: false, reason: "no_token" });
    }

    const now = Date.now();
    const isExpired = token.expires_at <= now;
    const needsRefresh = needsClaudeCodeTokenRefresh() || isExpired;

    if (needsRefresh && token.refresh_token) {
      const success = await refreshClaudeCodeToken();
      return NextResponse.json({
        refreshed: success,
        reason: success ? "refreshed" : "refresh_failed",
      });
    }

    return NextResponse.json({ refreshed: false, reason: "not_needed" });
  } catch (error) {
    console.error("[ClaudeCodeRefresh] Error:", error);
    return NextResponse.json(
      { refreshed: false, reason: "error" },
      { status: 500 }
    );
  }
}
