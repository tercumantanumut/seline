/**
 * POST /api/browser/[sessionId]/interact
 *
 * Receives user interactions from the browser session viewer and forwards
 * them to the Playwright page via CDP input dispatch. Records each
 * interaction in the action history with source: "user".
 *
 * Supported interaction types:
 *  - click: { type: "click", x, y, button?, clickCount? }
 *  - type: { type: "type", text }
 *  - keypress: { type: "keypress", key, modifiers? }
 *  - scroll: { type: "scroll", x, y, deltaX, deltaY }
 *  - navigate: { type: "navigate", url }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/browser/session-manager";
import { recordAction, initHistory } from "@/lib/browser/action-history";
import {
  dispatchClick,
  dispatchType,
  dispatchKeyPress,
  dispatchScroll,
} from "@/lib/browser/input-dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InteractionPayload {
  type: "click" | "type" | "keypress" | "scroll" | "navigate";
  // click
  x?: number;
  y?: number;
  button?: "left" | "right" | "middle";
  clickCount?: number;
  // type
  text?: string;
  // keypress
  key?: string;
  modifiers?: number;
  // scroll
  deltaX?: number;
  deltaY?: number;
  // navigate
  url?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "No active browser session", sessionId },
      { status: 404 }
    );
  }

  let payload: InteractionPayload;
  try {
    payload = await req.json() as InteractionPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!payload.type) {
    return NextResponse.json(
      { error: "Missing 'type' field" },
      { status: 400 }
    );
  }

  // Ensure history is initialized (may not be if session was created by another path)
  initHistory(sessionId);

  const startTime = Date.now();

  try {
    let actionDescription: string;
    let pageUrl: string | undefined;
    let pageTitle: string | undefined;

    switch (payload.type) {
      case "click": {
        if (payload.x == null || payload.y == null) {
          return NextResponse.json({ error: "click requires x and y" }, { status: 400 });
        }
        await dispatchClick(sessionId, session.page, payload.x, payload.y, {
          button: payload.button,
          clickCount: payload.clickCount,
        });
        actionDescription = `User clicked at (${Math.round(payload.x)}, ${Math.round(payload.y)})`;
        pageUrl = session.page.url();
        pageTitle = await session.page.title();
        break;
      }

      case "type": {
        if (!payload.text) {
          return NextResponse.json({ error: "type requires text" }, { status: 400 });
        }
        await dispatchType(sessionId, session.page, payload.text);
        actionDescription = `User typed "${payload.text.slice(0, 50)}${payload.text.length > 50 ? "..." : ""}"`;
        pageUrl = session.page.url();
        pageTitle = await session.page.title();
        break;
      }

      case "keypress": {
        if (!payload.key) {
          return NextResponse.json({ error: "keypress requires key" }, { status: 400 });
        }
        await dispatchKeyPress(sessionId, session.page, payload.key, {
          modifiers: payload.modifiers,
        });
        actionDescription = `User pressed ${payload.key}`;
        pageUrl = session.page.url();
        pageTitle = await session.page.title();
        break;
      }

      case "scroll": {
        if (payload.x == null || payload.y == null || payload.deltaX == null || payload.deltaY == null) {
          return NextResponse.json({ error: "scroll requires x, y, deltaX, deltaY" }, { status: 400 });
        }
        await dispatchScroll(sessionId, session.page, payload.x, payload.y, payload.deltaX, payload.deltaY);
        actionDescription = `User scrolled at (${Math.round(payload.x)}, ${Math.round(payload.y)})`;
        pageUrl = session.page.url();
        pageTitle = await session.page.title();
        break;
      }

      case "navigate": {
        if (!payload.url) {
          return NextResponse.json({ error: "navigate requires url" }, { status: 400 });
        }
        // Use Playwright's goto for proper navigation (handles redirects, waits for load)
        await session.page.goto(payload.url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        actionDescription = `User navigated to ${payload.url}`;
        pageUrl = session.page.url();
        pageTitle = await session.page.title();
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown interaction type: ${payload.type}` },
          { status: 400 }
        );
    }

    const durationMs = Date.now() - startTime;

    // Record in action history with source: "user"
    recordAction(sessionId, payload.type, payload as unknown as Record<string, unknown>, {
      success: true,
      durationMs,
      output: actionDescription,
      pageUrl,
      pageTitle,
      source: "user",
    });

    return NextResponse.json({
      success: true,
      action: payload.type,
      durationMs,
      description: actionDescription,
      pageUrl,
      pageTitle,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    recordAction(sessionId, payload.type, payload as unknown as Record<string, unknown>, {
      success: false,
      durationMs,
      error: errorMsg,
      source: "user",
    });

    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
