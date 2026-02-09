import { generateText } from "ai";
import { getUtilityModel } from "@/lib/ai/providers";
import {
  getNonCompactedMessages,
  updateSessionSummary,
  markMessagesAsCompacted,
  getSession,
} from "@/lib/db/queries";
import { estimateMessageTokens } from "@/lib/utils";
import type { Message } from "@/lib/db/schema";
import { getCompactionThreshold } from "@/lib/ai/context-limits";
import type { LLMProvider } from "@/components/model-bag/model-bag.types";

const MIN_MESSAGES_FOR_COMPACTION = 10;
const KEEP_RECENT_MESSAGES = 6; // Keep last N messages uncompacted

const COMPACTION_PROMPT = `You are a conversation summarizer. Your task is to create a concise summary of the conversation history that captures:

1. The main topics discussed
2. Key decisions made
3. Important context about images, designs, or edits requested
4. Any user preferences mentioned
5. Current state of any ongoing work

Create a summary that would allow continuing the conversation naturally. Be concise but comprehensive. Focus on information that would be relevant for future interactions.

Previous conversation:
`;

export async function compactIfNeeded(
  sessionId: string, 
  modelId: string, 
  provider: LLMProvider
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  const messages = await getNonCompactedMessages(sessionId);
  if (messages.length < MIN_MESSAGES_FOR_COMPACTION) return;

  // Estimate total tokens
  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += estimateMessageTokens({ content: msg.content });
  }

  // Add existing summary tokens if present
  if (session.summary) {
    totalTokens += estimateMessageTokens({ content: session.summary });
  }

  // Calculate dynamic threshold based on the model's context window
  // Use 75% of the context window as the trigger point
  const tokenThreshold = getCompactionThreshold(modelId, provider, 0.75);

  if (totalTokens < tokenThreshold) return;

  // Need to compact - keep recent messages, summarize older ones
  const messagesToCompact = messages.slice(0, -KEEP_RECENT_MESSAGES);
  if (messagesToCompact.length === 0) return;

  const lastMessageToCompact = messagesToCompact[messagesToCompact.length - 1];

  // Format messages for summarization
  const conversationText = formatMessagesForSummary(messagesToCompact);

  // Include existing summary if present
  const fullText = session.summary
    ? `Previous summary:\n${session.summary}\n\nNew messages to incorporate:\n${conversationText}`
    : conversationText;

  try {
    const { text: newSummary } = await generateText({
      model: getUtilityModel(),
      prompt: COMPACTION_PROMPT + fullText,
      maxOutputTokens: 2000,
    });

    // Update session with new summary
    await updateSessionSummary(sessionId, newSummary, lastMessageToCompact.id);

    // Mark messages as compacted
    await markMessagesAsCompacted(sessionId, lastMessageToCompact.id);
  } catch (error) {
    console.error("Failed to compact session:", error);
    // Don't throw - compaction failure shouldn't break the chat
  }
}

function formatMessagesForSummary(messages: Message[]): string {
  return messages
    .map((msg) => {
      const role = msg.role.toUpperCase();
      let content: string;

      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = (msg.content as Array<{ type: string; text?: string }>)
          .map((part) => {
            if (part.type === "text" && part.text) {
              return part.text;
            }
            if (part.type === "image") {
              return "[Image]";
            }
            if (part.type === "tool-call") {
              return `[Tool call: ${msg.toolName || "unknown"}]`;
            }
            return "[Content]";
          })
          .join(" ");
      } else {
        content = JSON.stringify(msg.content);
      }

      return `${role}: ${content}`;
    })
    .join("\n\n");
}

export function buildMessagesWithSummary(
  session: { summary?: string | null },
  messages: Message[]
): Array<{ role: string; content: unknown }> {
  const result: Array<{ role: string; content: unknown }> = [];

  // Add summary as a system message if present
  if (session.summary) {
    result.push({
      role: "system",
      content: `Previous conversation summary:\n${session.summary}`,
    });
  }

  // Add non-compacted messages
  for (const msg of messages) {
    if (!msg.isCompacted) {
      result.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  return result;
}
