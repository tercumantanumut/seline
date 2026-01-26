import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  createChannelConnection,
  getOrCreateLocalUser,
  listChannelConnections,
} from "@/lib/db/queries";
import { getCharacter } from "@/lib/characters/queries";
import type { ChannelConnectionConfig, ChannelType } from "@/lib/channels/types";

const createSchema = z.object({
  characterId: z.string().min(1),
  channelType: z.enum(["whatsapp", "telegram", "slack"]),
  displayName: z.string().trim().min(1).max(100).optional().nullable(),
  config: z.record(z.any()).optional(),
});

function buildConfig(
  channelType: ChannelType,
  config: Record<string, unknown> | undefined,
  label?: string | null
): ChannelConnectionConfig {
  if (channelType === "whatsapp") {
    return {
      type: "whatsapp",
      label: typeof label === "string" ? label : undefined,
      authPath: typeof config?.authPath === "string" ? config.authPath : undefined,
    };
  }

  if (channelType === "telegram") {
    const botToken = typeof config?.botToken === "string" ? config.botToken.trim() : "";
    if (!botToken) {
      throw new Error("Telegram bot token is required");
    }
    return {
      type: "telegram",
      botToken,
      label: typeof label === "string" ? label : undefined,
    };
  }

  const botToken = typeof config?.botToken === "string" ? config.botToken.trim() : "";
  const appToken = typeof config?.appToken === "string" ? config.appToken.trim() : "";
  const signingSecret = typeof config?.signingSecret === "string" ? config.signingSecret.trim() : "";
  if (!botToken || !appToken || !signingSecret) {
    throw new Error("Slack bot token, app token, and signing secret are required");
  }
  return {
    type: "slack",
    botToken,
    appToken,
    signingSecret,
    label: typeof label === "string" ? label : undefined,
  };
}

export async function GET(req: Request) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get("characterId") || undefined;

    const connections = await listChannelConnections({
      userId: dbUser.id,
      characterId,
    });

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("List channel connections error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list connections" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { characterId, channelType, displayName, config } = parsed.data;
    const character = await getCharacter(characterId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let normalizedConfig: ChannelConnectionConfig;
    try {
      normalizedConfig = buildConfig(channelType, config, displayName ?? undefined);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid configuration" },
        { status: 400 }
      );
    }

    const connection = await createChannelConnection({
      userId: dbUser.id,
      characterId,
      channelType,
      displayName: displayName ?? null,
      config: normalizedConfig,
      status: "disconnected",
      lastError: null,
    });

    return NextResponse.json({ connection });
  } catch (error) {
    console.error("Create channel connection error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create connection" },
      { status: 500 }
    );
  }
}
