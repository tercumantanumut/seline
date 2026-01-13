import { NextResponse } from "next/server";
import {
  getCodexToken,
  needsCodexTokenRefresh,
  refreshCodexToken,
} from "@/lib/auth/codex-auth";

export async function POST() {
  try {
    const token = getCodexToken();

    if (!token) {
      return NextResponse.json({ refreshed: false, reason: "no_token" });
    }

    const now = Date.now();
    const isExpired = token.expires_at <= now;
    const needsRefresh = needsCodexTokenRefresh() || isExpired;

    if (needsRefresh && token.refresh_token) {
      const success = await refreshCodexToken();
      return NextResponse.json({
        refreshed: success,
        reason: success ? "refreshed" : "refresh_failed",
      });
    }

    return NextResponse.json({ refreshed: false, reason: "not_needed" });
  } catch (error) {
    console.error("[CodexRefresh] Error:", error);
    return NextResponse.json(
      { refreshed: false, reason: "error" },
      { status: 500 }
    );
  }
}
