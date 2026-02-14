import { tool, jsonSchema } from "ai";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import { getChannelManager } from "@/lib/channels/manager";
import { 
  findActiveChannelConnection, 
  findRecentChannelConversation, 
  createChannelMessage,
  getChannelConversation,
  getChannelConnection,
  createMessage
} from "@/lib/db/queries";
import { nextOrderingIndex } from "@/lib/session/message-ordering";

const sendMessageToChannelSchema = jsonSchema<{
  message: string;
  channelType?: "telegram" | "slack" | "whatsapp";
}>({
  type: "object",
  properties: {
    message: {
      type: "string",
      description: "The text content to send to the external channel."
    },
    channelType: {
      type: "string",
      enum: ["telegram", "slack", "whatsapp"],
      description: "Optional: Target specific channel type. If omitted, uses the current session's channel or the most recently active connection."
    }
  },
  required: ["message"]
});

interface SendMessageToChannelArgs {
  message: string;
  channelType?: "telegram" | "slack" | "whatsapp";
}

async function executeSendMessageToChannel(
  sessionId: string,
  userId: string,
  sessionMetadata: Record<string, unknown>,
  args: SendMessageToChannelArgs
) {
  const { message, channelType } = args;
  const manager = getChannelManager();

  // 1. Resolve Target Connection & Conversation
  let connectionId: string | undefined;
  let conversationId: string | undefined;
  let peerId: string | undefined;
  let threadId: string | undefined | null;
  let targetChannelType = channelType;

  // Case A: Agent is ALREADY in a channel session (replying context)
  if (sessionMetadata.channelConversationId) {
    const convo = await getChannelConversation(sessionMetadata.channelConversationId as string);
    if (convo) {
      const conn = await getChannelConnection(convo.connectionId);
      if (conn) {
        connectionId = conn.id;
        peerId = convo.peerId;
        threadId = convo.threadId;
        targetChannelType = conn.channelType as any;
      }
    }
  }

  // Case B: Agent is in Web Chat, needs to find external connection
  if (!connectionId) {
    // If channel type specified, look for that specific active connection
    if (targetChannelType) {
      const conn = await findActiveChannelConnection(userId, targetChannelType);
      if (conn) {
        connectionId = conn.id;
        const recentConvo = await findRecentChannelConversation(conn.id);
        if (recentConvo) {
          peerId = recentConvo.peerId;
          threadId = recentConvo.threadId;
        }
      }
    } else {
      // Default: Find ANY active connection (priority logic could be added here)
      const telegram = await findActiveChannelConnection(userId, "telegram");
      if (telegram) {
        connectionId = telegram.id;
        targetChannelType = "telegram";
        const recentConvo = await findRecentChannelConversation(telegram.id);
        if (recentConvo) {
          peerId = recentConvo.peerId;
          threadId = recentConvo.threadId;
        }
      }
      // Add fallbacks for Slack/WhatsApp...
    }
  }

  if (!connectionId || !peerId) {
    return {
      status: "failed",
      error: "No active channel connection or conversation found. Please connect a channel in Settings first."
    };
  }

  try {
    // 2. Send Message via Channel Manager
    const result = await manager.sendMessage(connectionId, {
      peerId,
      text: message,
      threadId,
    });

    // 2.5 Create an internal message to anchor the channel message
    const orderingIndex = await nextOrderingIndex(sessionId);
    const internalMessage = await createMessage({
      sessionId,
      role: "assistant",
      content: [{ type: "text", text: `[Sent external message: ${message}]` }],
      orderingIndex,
      metadata: { 
        isToolOutput: true,
        toolName: "sendMessageToChannel",
        hidden: true
      }
    });

    if (internalMessage) {
      // 3. Log to Database (Channel Messages)
      await createChannelMessage({
        connectionId,
        channelType: targetChannelType!,
        externalMessageId: result.externalMessageId,
        sessionId,
        messageId: internalMessage.id,
        direction: "outbound",
      });
    }

    return {
      status: "success",
      channel: targetChannelType,
      recipient: peerId,
      messagePreview: message.substring(0, 50) + "..."
    };

  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error sending message"
    };
  }
}

export function createSendMessageToChannelTool(options: { sessionId: string; userId: string; sessionMetadata: Record<string, unknown> }) {
  const executeWithLogging = withToolLogging(
    "sendMessageToChannel",
    options.sessionId,
    (args: SendMessageToChannelArgs) => executeSendMessageToChannel(options.sessionId, options.userId, options.sessionMetadata, args)
  );

  return tool({
    description: "Send a direct message to the user via their connected external channel (Telegram, Slack, etc.). Use this to notify the user of important events or when explicitly asked to message them externally.",
    inputSchema: sendMessageToChannelSchema,
    execute: executeWithLogging
  });
}
