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
import { getCharacterModelConfig } from "@/lib/characters/queries";
import {
  extractSessionModelConfig,
  buildSessionModelMetadata,
  clearSessionModelMetadata,
  resolveSessionModelScope,
} from "@/lib/ai/session-model-resolver";
import { validateSessionModelConfig } from "@/lib/ai/model-validation";
import type { AgentModelConfig, SessionModelConfig } from "@/components/model-bag/model-bag.types";

type RouteParams = { params: Promise<{ id: string }> };

async function getAgentConfigForSession(
  metadata: Record<string, unknown>,
  sessionCharacterId?: string | null,
): Promise<AgentModelConfig | null> {
  const characterId =
    (typeof sessionCharacterId === "string" ? sessionCharacterId : null) ??
    (typeof metadata.characterId === "string" ? metadata.characterId : null);
  return characterId ? getCharacterModelConfig(characterId) : null;
}

// -----------------------------------------------------------------------
// GET - read current session model config
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
    const agentDefaults = await getAgentConfigForSession(metadata, session.characterId);
    const resolved = await resolveSessionModelScope(metadata, { agentModelConfig: agentDefaults, settings });

    return NextResponse.json({
      sessionId: id,
      hasOverrides: config !== null,
      config: config ?? {},
      agentDefaults: agentDefaults ?? {},
      globalDefaults: {
        provider: settings.llmProvider,
        chatModel: settings.chatModel || "",
        researchModel: settings.researchModel || "",
        visionModel: settings.visionModel || "",
        utilityModel: settings.utilityModel || "",
      },
      effective: resolved.effectiveConfig,
      sources: resolved.sources,
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
// PUT - update session model config
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
    const agentDefaults = await getAgentConfigForSession(currentMetadata, session.characterId);

    let newMetadata: Record<string, unknown>;

    if (body.clear) {
      newMetadata = clearSessionModelMetadata(currentMetadata);
      console.log(`[Session Model Config] Cleared overrides for session ${id}`);
    } else {
      const fallbackProvider = agentDefaults?.provider || settings.llmProvider;
      const validation = validateSessionModelConfig(body, fallbackProvider);
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: "Incompatible session model configuration",
            details: validation.errors,
          },
          { status: 400 },
        );
      }

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

    await updateSession(id, { metadata: newMetadata });
    const resolved = await resolveSessionModelScope(newMetadata, { agentModelConfig: agentDefaults, settings });

    return NextResponse.json({
      success: true,
      sessionId: id,
      config: extractSessionModelConfig(newMetadata) ?? {},
      effective: resolved.effectiveConfig,
      sources: resolved.sources,
    });
  } catch (error) {
    console.error("[Session Model Config] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update session model config" },
      { status: 500 },
    );
  }
}
