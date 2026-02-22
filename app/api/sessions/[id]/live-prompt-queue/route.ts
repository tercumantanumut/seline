import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getOrCreateLocalUser, getSession, updateSession } from "@/lib/db/queries";
import { listAgentRunsBySession } from "@/lib/observability";
import { taskRegistry } from "@/lib/background-tasks/registry";
import {
  appendLivePromptQueueEntry,
  sanitizeLivePromptContent,
} from "@/lib/agent-run/live-prompt-queue";
import { nowISO } from "@/lib/utils/timestamp";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = (await request.json()) as {
      runId?: unknown;
      id?: unknown;
      content?: unknown;
      source?: unknown;
    };

    const runId = typeof payload.runId === "string" ? payload.runId.trim() : "";
    const content = sanitizeLivePromptContent(payload.content);

    if (!runId || !content) {
      return NextResponse.json(
        { error: "runId and content are required" },
        { status: 400 }
      );
    }

    const promptIdRaw = typeof payload.id === "string" ? payload.id.trim() : "";
    const promptId = promptIdRaw.length > 0
      ? promptIdRaw
      : `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const source = typeof payload.source === "string" ? payload.source.trim() : "chat";

    const runs = await listAgentRunsBySession(sessionId, 100);
    const targetRun = runs.find((run) => run.id === runId);
    if (!targetRun || targetRun.status !== "running") {
      return NextResponse.json(
        { error: "Target run is not active", runId },
        { status: 409 }
      );
    }

    const updatedMetadata = appendLivePromptQueueEntry(
      (session.metadata as Record<string, unknown>) ?? {},
      {
        id: promptId,
        runId,
        content,
        createdAt: nowISO(),
        source,
      }
    );

    await updateSession(sessionId, {
      metadata: updatedMetadata,
    });

    taskRegistry.emitProgress(runId, "Live prompt queued");

    return NextResponse.json({
      success: true,
      queued: true,
      runId,
      id: promptId,
    });
  } catch (error) {
    console.error("[LivePromptQueue] Failed to queue live prompt:", error);
    return NextResponse.json(
      { error: "Failed to queue live prompt" },
      { status: 500 }
    );
  }
}
