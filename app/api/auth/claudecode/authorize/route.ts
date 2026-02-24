import { NextResponse } from "next/server";
import { getClaudeCodeAuthStatus } from "@/lib/auth/claudecode-auth";
import { startClaudeLoginProcess } from "@/lib/auth/claude-login-process";

/**
 * GET /api/auth/claudecode/authorize
 *
 * First checks if already authenticated via the Agent SDK.
 * If not, spawns `claude login` as a persistent subprocess (stdin piped) so the
 * user can paste the authorization code back via POST /api/auth/claudecode/exchange.
 */
export async function GET() {
  try {
    const status = await getClaudeCodeAuthStatus();

    if (status.authenticated) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        message: "Claude Agent SDK is already authenticated",
      });
    }

    // Start the login subprocess and wait for the URL to appear in its output.
    const { url, output } = await startClaudeLoginProcess();

    return NextResponse.json({
      success: true,
      authenticated: false,
      url: url ?? status.authUrl ?? null,
      output,
      message: url
        ? "Open the provided URL to authenticate, then paste the code below."
        : "Authenticate Claude Agent SDK via your terminal if no URL is provided",
    });
  } catch (error) {
    console.error("[ClaudeCodeAuthorize] Failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to prepare authentication" },
      { status: 500 },
    );
  }
}
