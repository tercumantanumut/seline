import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  deleteChannelConnection,
  getChannelConnection,
  getOrCreateLocalUser,
  updateChannelConnection,
} from "@/lib/db/queries";
import type { ChannelConnectionConfig, ChannelType } from "@/lib/channels/types";
import { getChannelManager } from "@/lib/channels/manager";

const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional().nullable(),
  config: z.record(z.any()).optional(),
});

function buildConfig(
  channelType: ChannelType,
  config: Record<string, unknown> | undefined,
  label?: string | null
): ChannelConnectionConfig {
  const normalizeBool = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
    }
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    return undefined;
  };

  if (channelType === "whatsapp") {
    return {
      type: "whatsapp",
      label: typeof label === "string" ? label : undefined,
      authPath: typeof config?.authPath === "string" ? config.authPath : undefined,
      selfChatMode: normalizeBool(config?.selfChatMode),
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

async function getAuthorizedConnection(req: Request, connectionId: string) {
  const userId = await requireAuth(req);
  const settings = loadSettings();
  const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
  const connection = await getChannelConnection(connectionId);

  if (!connection) {
    return { error: "Connection not found", status: 404 as const };
  }
  if (connection.userId !== dbUser.id) {
    return { error: "Forbidden", status: 403 as const };
  }

  return { connection };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getAuthorizedConnection(req, id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ connection: result.connection });
  } catch (error) {
    console.error("Get channel connection error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch connection" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getAuthorizedConnection(req, id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const connection = result.connection;
    const previousSelfChatMode = (connection.config as Record<string, unknown> | null)?.selfChatMode;
    const mergedConfig = {
      ...(connection.config as Record<string, unknown>),
      ...(parsed.data.config ?? {}),
    };
    const resolvedDisplayName =
      parsed.data.displayName !== undefined ? parsed.data.displayName : connection.displayName;
    let normalizedConfig: ChannelConnectionConfig;
    try {
      normalizedConfig = buildConfig(
        connection.channelType as ChannelType,
        mergedConfig,
        resolvedDisplayName ?? undefined
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid configuration" },
        { status: 400 }
      );
    }

    const updated = await updateChannelConnection(connection.id, {
      displayName: resolvedDisplayName ?? null,
      config: normalizedConfig,
    });

    const nextSelfChatMode = normalizedConfig.type === "whatsapp" ? normalizedConfig.selfChatMode : undefined;
    if (connection.channelType === "whatsapp" && previousSelfChatMode !== nextSelfChatMode) {
      await getChannelManager().disconnect(connection.id);
      await getChannelManager().connect(connection.id);
    }

    return NextResponse.json({ connection: updated });
  } catch (error) {
    console.error("Update channel connection error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getAuthorizedConnection(req, id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await getChannelManager().disconnect(id);
    await deleteChannelConnection(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete channel connection error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete connection" },
      { status: 500 }
    );
  }
}
