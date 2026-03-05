/**
 * GET /api/browser/[sessionId]/history
 *
 * Returns the live action history for an active browser session.
 * Used by the dedicated browser session viewer to poll for updates.
 */

import { NextRequest } from "next/server";
import { peekHistory } from "@/lib/browser/action-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const history = peekHistory(sessionId);
  if (!history) {
    return new Response(
      JSON.stringify({ error: "No active session", sessionId }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify(history), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
  });
}
