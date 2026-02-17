/**
 * GET/PUT /api/sessions/[id]/model-config
 *
 * Per-session model override configuration.
 * Reads/writes sessionProvider, sessionChatModel, etc. in session.metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession, getOrCreateLocalUser } from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  extractSessionModelConfig,
  buildSessionModelMetadata,
  clearSessionModelMetadata,
} from "@/lib/ai/session-model-resolver";
import { validateSessionModelConfig } from "@/lib/ai/model-validation";
import type { SessionModelConfig } from "@/components/model-bag/model-bag.types";

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------------------
// GET — read current session model config
// -----------------------------------------------------------------------

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const metadata = (session.metadata as Record<string, unknown>) || {};
    const config = extractSessionModelConfig(metadata);

    return NextResponse.json({
      sessionId: id,
      hasOverrides: config !== null,
      config: config ?? {},
      // Also return global defaults for comparison in the UI
      globalDefaults: {
        provider: settings.llmProvider,
        chatModel: settings.chatModel || "",
        researchModel: settings.researchModel || "",
        visionModel: settings.visionModel || "",
        utilityModel: settings.utilityModel || "",
      },
    });
  } catch (error) {
    console.error("[Session Model Config] GET error:", error);
    return NextResponse.json(
      { error: "Failed to read session model config" },
      { status: 500 },
    );
  }
}

// -----------------------------------------------------------------------
// PUT — update session model config
// -----------------------------------------------------------------------

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as SessionModelConfig & { clear?: boolean };
    const currentMetadata = (session.metadata as Record<string, unknown>) || {};

    let newMetadata: Record<string, unknown>;

    if (body.clear) {
      // Clear all session overrides
      newMetadata = clearSessionModelMetadata(currentMetadata);
      console.log(`[Session Model Config] Cleared overrides for session ${id}`);
    } else {
      // Validate model-provider compatibility before persisting
      const validation = validateSessionModelConfig(body, settings.llmProvider);
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: "Incompatible session model configuration",
            details: validation.errors,
          },
          { status: 400 },
        );
      }

      // Merge new overrides into metadata
      const modelMeta = buildSessionModelMetadata(body);
      newMetadata = {
        ...currentMetadata,
        ...modelMeta,
      };
      console.log(
        `[Session Model Config] Updated session ${id}:`,
        JSON.stringify(modelMeta),
      );
    }

    const updated = await updateSession(id, { metadata: newMetadata });

    return NextResponse.json({
      success: true,
      sessionId: id,
      config: extractSessionModelConfig(newMetadata) ?? {},
    });
  } catch (error) {
    console.error("[Session Model Config] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update session model config" },
      { status: 500 },
    );
  }
}
