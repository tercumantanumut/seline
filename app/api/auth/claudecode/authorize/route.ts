import { NextResponse } from "next/server";
import { getClaudeCodeAuthStatus } from "@/lib/auth/claudecode-auth";

/**
 * GET /api/auth/claudecode/authorize
 *
 * With the official Agent SDK, authentication is initiated by the SDK/CLI.
 * This endpoint returns latest auth status and any login URL surfaced by SDK output.
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

    return NextResponse.json({
      success: true,
      authenticated: false,
      url: status.authUrl || null,
      output: status.output,
      error: status.error,
      message:
        status.authUrl
          ? "Open the provided URL to authenticate Claude Agent SDK"
          : "Authenticate Claude Agent SDK via your terminal if no URL is provided",
    });
  } catch (error) {
    console.error("[ClaudeCodeAuthorize] Failed to read Agent SDK auth status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to prepare authentication" },
      { status: 500 },
    );
  }
}
