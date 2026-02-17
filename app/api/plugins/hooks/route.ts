import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getRegisteredHooks, clearAllHooks } from "@/lib/plugins/hooks-engine";
import type { HookEventType } from "@/lib/plugins/types";

export const runtime = "nodejs";

/**
 * GET /api/plugins/hooks — list all registered hooks by event type.
 * Useful for debugging and the plugin manager UI.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const event = searchParams.get("event") as HookEventType | null;

    if (event) {
      const hooks = getRegisteredHooks(event);
      return NextResponse.json({ event, hooks });
    }

    // Return all events
    const events: HookEventType[] = [
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "SessionStart",
      "Stop",
      "SessionEnd",
    ];

    const allHooks: Record<string, unknown> = {};
    for (const evt of events) {
      const hooks = getRegisteredHooks(evt);
      if (hooks.length > 0) {
        allHooks[evt] = hooks;
      }
    }

    return NextResponse.json({ hooks: allHooks });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list hooks" },
      { status: 500 }
    );
  }
}
