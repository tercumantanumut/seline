/**
 * POST /api/browser/[sessionId]/replay
 *
 * Triggers a replay of a recorded browser session.
 * Accepts the session history and re-executes actions sequentially.
 *
 * The screencast is auto-started on open, so the dedicated viewer
 * window will show the replay live.
 */

import { NextRequest, NextResponse } from "next/server";
import { peekHistory, buildReplayPlan, type SessionHistory } from "@/lib/browser/action-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  // Get the recorded history for this session
  const liveHistory = peekHistory(sessionId);

  let historyToReplay: SessionHistory | null = liveHistory;

  // If no live history, check if the request body contains a history
  if (!historyToReplay) {
    try {
      const body = await req.json() as { history?: SessionHistory };
      if (body.history) {
        historyToReplay = body.history;
      }
    } catch {
      // No body or invalid JSON
    }
  }

  if (!historyToReplay || historyToReplay.actions.length === 0) {
    return NextResponse.json(
      { error: "No history available for replay", sessionId },
      { status: 404 }
    );
  }

  const plan = buildReplayPlan(historyToReplay);

  return NextResponse.json({
    sessionId,
    plan,
    totalActions: plan.length,
    message: "Replay plan generated. Use the chromiumWorkspace tool with action 'replay' and this plan as history to execute.",
  });
}
