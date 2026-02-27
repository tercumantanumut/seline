import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getSessionWithMessages, updateMessage, getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";

type RouteParams = { params: Promise<{ id: string }> };

function sealDanglingToolCallsInContent(
  content: unknown
): { content: unknown; changed: boolean } {
  if (!Array.isArray(content) || content.length === 0) {
    return { content, changed: false };
  }

  const parts = content as Array<Record<string, unknown>>;
  const toolResultIds = new Set<string>();

  for (const part of parts) {
    if (part.type === "tool-result" && typeof part.toolCallId === "string") {
      toolResultIds.add(part.toolCallId);
    }
  }

  let changed = false;
  const nextParts: Array<Record<string, unknown>> = [];

  for (const part of parts) {
    nextParts.push(part);
    if (part.type !== "tool-call") continue;

    const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
    if (!toolCallId || toolResultIds.has(toolCallId)) continue;

    const state = typeof part.state === "string" ? part.state : undefined;
    if (state !== "input-available" && state !== "input-streaming") continue;

    part.state = "output-error";
    if (part.args === undefined) {
      part.args = {};
    }

    nextParts.push({
      type: "tool-result",
      toolCallId,
      toolName: typeof part.toolName === "string" ? part.toolName : "tool",
      result: {
        status: "error",
        error: "Tool execution ended before a final result was persisted.",
        reconstructed: true,
      },
      status: "error",
      state: "output-error",
      timestamp: new Date().toISOString(),
    });

    toolResultIds.add(toolCallId);
    changed = true;
  }

  return changed ? { content: nextParts, changed: true } : { content, changed: false };
}

/**
 * GET - Fetch all messages for a session
 * Used to refresh messages after background processing completes
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: sessionId } = await params;

    const sessionWithMessages = await getSessionWithMessages(sessionId);

    if (!sessionWithMessages || sessionWithMessages.session.userId !== dbUser.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const repairedMessages = await Promise.all(
      sessionWithMessages.messages.map(async (message) => {
        if (message.role !== "assistant") return message;
        const metadata = (message.metadata ?? {}) as Record<string, unknown>;
        if (metadata.isStreaming === true) return message;

        const repaired = sealDanglingToolCallsInContent(message.content);
        if (!repaired.changed) return message;

        await updateMessage(message.id, { content: repaired.content as any });
        return { ...message, content: repaired.content };
      })
    );

    return NextResponse.json({
      messages: repairedMessages,
    });
  } catch (error) {
    console.error("Fetch session messages error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
