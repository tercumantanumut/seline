import { loadSettings } from "@/lib/settings/settings-manager";
import { saveFile } from "@/lib/storage/local-storage";
import { convertDBMessagesToUIMessages } from "@/lib/messages/converter";
import { SESSION_COOKIE_NAME } from "@/lib/auth/local-auth";
import {
  createChannelConversation,
  createChannelMessage,
  createMessage,
  createSession,
  findChannelConversation,
  findChannelMessageByExternalId,
  getChannelConnection,
  getMessages,
  getSession,
  getOrCreateLocalUser,
  touchChannelConversation,
  updateChannelConversation,
  updateSession,
} from "@/lib/db/queries";
import { getCharacter } from "@/lib/characters/queries";
import type { ChannelInboundMessage } from "./types";
import { buildConversationKey, normalizeChannelText } from "./utils";
import { getChannelManager } from "./manager";
import { taskRegistry } from "@/lib/background-tasks/registry";
import type { ChannelTask } from "@/lib/background-tasks/types";
import { nowISO } from "@/lib/utils/timestamp";

const conversationQueues = new Map<string, Promise<void>>();

export async function handleInboundMessage(message: ChannelInboundMessage): Promise<void> {
  const key = buildConversationKey({
    connectionId: message.connectionId,
    peerId: message.peerId,
    threadId: message.threadId,
  });
  const previous = conversationQueues.get(key) ?? Promise.resolve();
  const next = previous
    .then(() => processInboundMessage(message))
    .catch((error) => {
      console.error("[Channels] Inbound processing error:", error);
    })
    .finally(() => {
      if (conversationQueues.get(key) === next) {
        conversationQueues.delete(key);
      }
    });
  conversationQueues.set(key, next);
  await next;
}

async function processInboundMessage(message: ChannelInboundMessage): Promise<void> {
  if (message.fromSelf) {
    const outbound = await findChannelMessageByExternalId({
      connectionId: message.connectionId,
      channelType: message.channelType,
      externalMessageId: message.messageId,
      direction: "outbound",
    });
    if (outbound) {
      return;
    }
  }

  const existing = await findChannelMessageByExternalId({
    connectionId: message.connectionId,
    channelType: message.channelType,
    externalMessageId: message.messageId,
    direction: "inbound",
  });
  if (existing) {
    return;
  }

  const connection = await getChannelConnection(message.connectionId);
  if (!connection) {
    throw new Error("Channel connection missing");
  }

  const character = await getCharacter(message.characterId);
  if (!character) {
    throw new Error("Character missing");
  }

  const settings = loadSettings();
  const dbUser = await getOrCreateLocalUser(connection.userId, settings.localUserEmail);

  const runId = crypto.randomUUID();
  const startedAt = nowISO();
  const channelTask: ChannelTask = {
    type: "channel",
    runId,
    userId: connection.userId,
    characterId: message.characterId,
    status: "running",
    startedAt,
    channelType: message.channelType,
    connectionId: message.connectionId,
    peerId: message.peerId,
    threadId: message.threadId ?? undefined,
    peerName: message.peerName ?? undefined,
  };
  taskRegistry.register(channelTask);

  const normalizedText = normalizeChannelText(message.text);
  const wantsNewSession = isNewSessionCommand(normalizedText);

  let conversation = await findChannelConversation({
    connectionId: message.connectionId,
    peerId: message.peerId,
    threadId: message.threadId,
  });

  const sessionMetadata = {
    characterId: character.id,
    characterName: character.name,
    channelType: message.channelType,
    channelConnectionId: message.connectionId,
    channelPeerId: message.peerId,
    channelPeerName: message.peerName ?? null,
    channelThreadId: message.threadId ?? null,
  };

  const createSessionForConversation = async () => {
    const session = await createSession({
      title: buildConversationTitle(message.channelType, message.peerName, message.peerId),
      userId: dbUser.id,
      metadata: sessionMetadata,
    });

    if (!conversation) {
      conversation = await createChannelConversation({
        connectionId: message.connectionId,
        characterId: character.id,
        channelType: message.channelType,
        peerId: message.peerId,
        peerName: message.peerName ?? null,
        threadId: message.threadId ?? null,
        sessionId: session.id,
        lastMessageAt: message.timestamp ?? new Date().toISOString(),
      });
    } else {
      const updated = await updateChannelConversation(conversation.id, {
        sessionId: session.id,
        peerName: message.peerName ?? conversation.peerName ?? null,
        lastMessageAt: message.timestamp ?? new Date().toISOString(),
      });
      conversation = updated ?? conversation;
    }

    const updatedSession = await updateSession(session.id, {
      metadata: {
        ...(session.metadata as Record<string, unknown>),
        channelConversationId: conversation.id,
      },
    });

    return { session: updatedSession ?? session };
  };

  try {
    if (wantsNewSession) {
      await createSessionForConversation();
      await sendNewSessionConfirmation(message);
      taskRegistry.updateStatus(runId, "succeeded", {
        durationMs: Date.now() - new Date(startedAt).getTime(),
      });
      return;
    }

    let sessionId: string;
    if (!conversation) {
      const created = await createSessionForConversation();
      sessionId = created.session.id;
    } else {
      const existingSession = await getSession(conversation.sessionId);
      if (!existingSession || existingSession.status !== "active") {
        const created = await createSessionForConversation();
        sessionId = created.session.id;
      } else {
        sessionId = existingSession.id;
        if (message.peerName && message.peerName !== conversation.peerName) {
          await updateChannelConversation(conversation.id, { peerName: message.peerName });
        }
      }
    }

    taskRegistry.updateStatus(runId, "running", { sessionId });

    if (conversation) {
      await touchChannelConversation(conversation.id, message.timestamp);
    }

    const contentParts = await buildMessageContent(sessionId, message);
    if (contentParts.length === 0) {
      taskRegistry.updateStatus(runId, "cancelled", {
        durationMs: Date.now() - new Date(startedAt).getTime(),
      });
      return;
    }

    const createdMessage = await createMessage({
      sessionId,
      role: "user",
      content: contentParts,
      metadata: {
        channel: {
          connectionId: message.connectionId,
          channelType: message.channelType,
          peerId: message.peerId,
          threadId: message.threadId,
          externalMessageId: message.messageId,
          fromSelf: message.fromSelf ?? false,
        },
      },
    });

    if (createdMessage?.id) {
      await createChannelMessage({
        connectionId: message.connectionId,
        channelType: message.channelType,
        externalMessageId: message.messageId,
        sessionId,
        messageId: createdMessage.id,
        direction: "inbound",
      });
    }

    const dbMessages = await getMessages(sessionId);
    const uiMessages = convertDBMessagesToUIMessages(dbMessages);

    await invokeChatApi({
      userId: connection.userId,
      sessionId,
      characterId: character.id,
      messages: uiMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        parts: msg.parts,
      })),
    });

    taskRegistry.updateStatus(runId, "succeeded", {
      durationMs: Date.now() - new Date(startedAt).getTime(),
    });
  } catch (error) {
    taskRegistry.updateStatus(runId, "failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - new Date(startedAt).getTime(),
    });
    throw error;
  }
}

async function buildMessageContent(sessionId: string, message: ChannelInboundMessage) {
  const parts: Array<{ type: string; text?: string; image?: string }> = [];
  const text = normalizeChannelText(message.text);
  if (text) {
    parts.push({ type: "text", text });
  }

  if (message.attachments?.length) {
    for (const attachment of message.attachments) {
      if (attachment.type === "image") {
        const saved = await saveFile(attachment.data, sessionId, attachment.filename, "upload");
        parts.push({ type: "image", image: saved.url });
      } else {
        parts.push({ type: "text", text: `[File: ${attachment.filename}]` });
      }
    }
  }

  return parts;
}

function buildConversationTitle(channelType: string, peerName?: string | null, peerId?: string | null) {
  const label = channelType.charAt(0).toUpperCase() + channelType.slice(1);
  if (peerName) {
    return `${label}: ${peerName}`;
  }
  if (peerId) {
    return `${label}: ${peerId}`;
  }
  return `${label} conversation`;
}

function isNewSessionCommand(text: string): boolean {
  if (!text) return false;
  return /^(?:\/|!)new(?:@[\w_]+)?$/i.test(text.trim());
}

async function sendNewSessionConfirmation(message: ChannelInboundMessage): Promise<void> {
  if (message.channelType === "whatsapp") {
    return;
  }
  try {
    const manager = getChannelManager();
    await manager.sendMessage(message.connectionId, {
      peerId: message.peerId,
      threadId: message.threadId,
      text: "Started a new session. Send your next message to begin.",
    });
  } catch (error) {
    console.warn("[Channels] Failed to send /new confirmation:", error);
  }
}

/**
 * Detects the correct Chat API base URL for Electron production vs development.
 *
 * - Development: Next.js dev server runs on port 3000
 * - Electron Production: Next.js standalone server runs on port 3456
 */
function getChatApiBaseUrl(): string {
  // Detect Electron production environment (same logic as lib/mcp/stdio-transport.ts)
  const isElectronProduction =
    (process.env.SELINE_PRODUCTION_BUILD === "1" ||
     !!(process as any).resourcesPath ||
     !!process.env.ELECTRON_RESOURCES_PATH) &&
    process.env.ELECTRON_IS_DEV !== "1" &&
    process.env.NODE_ENV !== "development";

  const baseUrl = isElectronProduction ? "http://localhost:3456" : "http://localhost:3000";
  console.log(`[Channels] Chat API base URL: ${baseUrl} (isElectronProd=${isElectronProduction})`);

  return baseUrl;
}

async function invokeChatApi(params: {
  userId: string;
  sessionId: string;
  characterId: string;
  messages: Array<{
    id?: string;
    role: string;
    parts: Array<{ type: string; text?: string; image?: string; url?: string }>;
  }>;
}) {
  const baseUrl = getChatApiBaseUrl();
  const settings = loadSettings();
  await getOrCreateLocalUser(params.userId, settings.localUserEmail);

  const controller = new AbortController();
  const configuredTimeoutMs = Number(process.env.CHANNEL_CHAT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeoutMs) ? configuredTimeoutMs : 300000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  // Retry logic for transient connection failures
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Channels] Chat API request (attempt ${attempt}/${maxRetries}) to ${baseUrl}/api/chat`);

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${params.userId}`,
          "X-Session-Id": params.sessionId,
          "X-Character-Id": params.characterId,
        },
        body: JSON.stringify({
          sessionId: params.sessionId,
          messages: params.messages,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Channels] Chat API error (attempt ${attempt}):`, response.status, errorText);

        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Chat API returned ${response.status}: ${errorText}`);
        }

        // Retry on server errors (5xx)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw new Error(`Chat API returned ${response.status} after ${maxRetries} attempts`);
      }

      reader = response.body?.getReader();
      if (!reader) {
        console.warn("[Channels] Chat API response has no body reader");
        return;
      }

      // Consume the stream
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      console.log(`[Channels] Chat API request completed successfully`);
      return; // Success - exit retry loop

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof Error && error.name === "AbortError") {
        console.warn(`[Channels] Chat API request timed out after ${timeoutMs}ms`);
        throw error; // Don't retry timeouts
      }

      // Enhanced logging for connection errors
      if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
        console.error(
          `[Channels] Chat API connection refused (attempt ${attempt}/${maxRetries}):`,
          `\n  URL: ${baseUrl}/api/chat`,
          `\n  Error: ${error.message}`,
          `\n  NODE_ENV: ${process.env.NODE_ENV}`
        );
      } else {
        console.error(`[Channels] Chat API invocation error (attempt ${attempt}):`, error);
      }

      if (reader) {
        try {
          await reader.cancel();
        } catch (cancelError) {
          console.warn("[Channels] Failed to cancel chat stream reader:", cancelError);
        }
        reader = undefined;
      }

      // Retry on connection errors
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      // All retries exhausted - throw to trigger task failure
      throw lastError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // If we get here, all retries failed
  if (lastError) {
    throw lastError;
  }
}
