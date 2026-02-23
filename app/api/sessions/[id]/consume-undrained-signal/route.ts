import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { consumeUndrainedSignal } from "@/lib/background-tasks/undrained-signal";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST - Check-and-clear the undrained-signal flag for a session.
 *
 * Returns { hasPending: true } if the last run ended with unprocessed
 * live-prompt queue messages (i.e. the frontend should replay the chips
 * as a new run). Clears the flag atomically so subsequent calls return false.
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    await requireAuth(req);
    const { id: sessionId } = await params;
    const hasPending = consumeUndrainedSignal(sessionId);
    return NextResponse.json({ hasPending });
  } catch (error) {
    console.error("[consume-undrained-signal] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
