/**
 * message-prep.ts
 *
 * Prepares messages for the AI streaming request:
 * - Builds refetch tools for tool-result enhancement
 * - Enhances frontend messages with DB tool results
 * - Converts messages to the AI SDK core format
 * - Splits tool-result parts from assistant messages for native Claude providers
 * - Strips stale <environment_details> and injects a fresh block
 */

import type { ModelMessage, UserModelMessage } from "ai";
import {
  createDocsSearchTool,
  createRetrieveFullContentTool,
} from "@/lib/ai/tools";
import { createWebSearchTool } from "@/lib/ai/web-search";
import { createVectorSearchToolV2 } from "@/lib/ai/vector-search";
import { createReadFileTool } from "@/lib/ai/tools/read-file-tool";
import { createLocalGrepTool } from "@/lib/ai/ripgrep";
import { createSendMessageToChannelTool } from "@/lib/ai/tools/channel-tools";
import { createRunSkillTool } from "@/lib/ai/tools/run-skill-tool";
import { createUpdateSkillTool } from "@/lib/ai/tools/update-skill-tool";
import {
  enhanceFrontendMessagesWithToolResults,
  type FrontendMessage,
} from "@/lib/messages/tool-enhancement";
import { splitToolResultsFromAssistantMessages } from "./message-splitter";
import { extractContent } from "./content-extractor";
import { MAX_TOOL_REFETCH } from "./content-sanitizer";

// ─── Public interface ─────────────────────────────────────────────────────────

export interface MessagePrepArgs {
  messages: FrontendMessage[];
  sessionId: string;
  userId: string;
  characterId: string | null;
  sessionMetadata: Record<string, unknown>;
  currentModelId: string | undefined;
  currentProvider: string | undefined;
}

export interface MessagePrepResult {
  coreMessages: ModelMessage[];
  enhancedMessages: FrontendMessage[];
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function prepareMessagesForRequest(
  args: MessagePrepArgs
): Promise<MessagePrepResult> {
  const {
    messages,
    sessionId,
    userId,
    characterId,
    sessionMetadata,
    currentModelId,
    currentProvider,
  } = args;

  // Build refetch tools for enhanceFrontendMessagesWithToolResults
  const refetchTools = {
    sendMessageToChannel: createSendMessageToChannelTool({
      sessionId,
      userId,
      sessionMetadata,
    }),
    readFile: createReadFileTool({
      sessionId,
      userId,
      characterId: characterId || null,
    }),
    localGrep: createLocalGrepTool({
      sessionId,
      characterId: characterId || null,
    }),
    vectorSearch: createVectorSearchToolV2({
      sessionId,
      userId,
      characterId: characterId || null,
      sessionMetadata,
    }),
    docsSearch: createDocsSearchTool({
      userId,
      characterId: characterId || null,
    }),
    webSearch: createWebSearchTool({
      sessionId,
      userId,
      characterId: characterId || null,
    }),
    retrieveFullContent: createRetrieveFullContentTool({ sessionId }),
    runSkill: createRunSkillTool({
      sessionId,
      userId,
      characterId: characterId || "",
    }),
    updateSkill: createUpdateSkillTool({
      userId,
      characterId: characterId || "",
    }),
  };

  // Enhance frontend messages with tool results from database
  const enhancedMessages = await enhanceFrontendMessagesWithToolResults(
    messages,
    sessionId,
    {
      refetchTools,
      maxRefetch: MAX_TOOL_REFETCH,
    }
  );

  console.log(
    `[CHAT API] Enhanced ${enhancedMessages.length} messages with DB tool results`
  );

  // Convert to core format for the AI SDK
  let coreMessages: ModelMessage[] = await Promise.all(
    enhancedMessages.map(async (msg, idx) => {
      const content = await extractContent(
        msg as Parameters<typeof extractContent>[0],
        true, // includeUrlHelpers
        true, // convertUserImagesToBase64
        sessionId
      );
      console.log(
        `[CHAT API] Message ${idx} (${msg.role}):`,
        JSON.stringify(
          {
            hasParts: !!(msg as { parts?: unknown[] }).parts,
            partsCount: (msg as { parts?: unknown[] }).parts?.length,
            partTypes: (
              msg as { parts?: Array<{ type: string }> }
            ).parts?.map((p) => p.type),
            contentType:
              typeof content === "string" ? "string" : "array",
            contentLength:
              typeof content === "string"
                ? content.length
                : (content as unknown[]).length,
          },
          null,
          2
        )
      );
      return {
        role: msg.role as "user" | "assistant" | "system",
        content,
      } as ModelMessage;
    })
  );

  // Split tool-result parts from assistant messages into separate role:"tool"
  // messages. Both Anthropic and OpenAI APIs require tool results as distinct
  // messages — the AI SDK OpenAI converter silently drops tool-result parts
  // that remain inline in assistant messages, causing "Tool results are missing"
  // errors on follow-up turns.
  coreMessages = splitToolResultsFromAssistantMessages(coreMessages);

  // Log coreMessages structure after all sanitization
  console.log(
    `[CHAT API] Final coreMessages (${coreMessages.length} messages) before streamText:`
  );
  coreMessages.forEach((msg, idx) => {
    if (typeof msg.content === "string") {
      console.log(
        `  [${idx}] role=${msg.role}, content=string(${msg.content.length})`
      );
    } else if (Array.isArray(msg.content)) {
      const types = (
        msg.content as Array<{ type: string; toolCallId?: string }>
      ).map((p) => p.type + (p.toolCallId ? `:${p.toolCallId}` : ""));
      console.log(
        `  [${idx}] role=${msg.role}, parts=[${types.join(", ")}]`
      );
    }
  });

  // Validate tool call inputs before sending to AI SDK
  coreMessages.forEach((msg, idx) => {
    if (Array.isArray(msg.content)) {
      msg.content.forEach((part: any, partIdx) => {
        if (part.type === "tool-use" && part.input !== undefined) {
          if (typeof part.input === "string") {
            try {
              JSON.parse(part.input);
              console.warn(
                `[CHAT API] Tool input at message ${idx}, part ${partIdx} is a JSON string instead of object. ` +
                  `This may cause API errors. Tool: ${part.toolName}`
              );
            } catch (e) {
              console.error(
                `[CHAT API] Invalid tool input at message ${idx}, part ${partIdx}: ` +
                  `Tool: ${part.toolName}, Input: ${part.input
                    ?.toString()
                    .substring(0, 100)}`
              );
            }
          }
        }
      });
    }
  });

  // ── Environment details injection ──────────────────────────────────────────
  // Strip stale <environment_details> from all user messages, then inject a
  // fresh block with current server time + user timezone into the last user message.
  const envDetailsRegex =
    /\n*<environment_details>[\s\S]*?<\/environment_details>/g;

  function stripEnvDetails(userMsg: UserModelMessage): UserModelMessage {
    if (typeof userMsg.content === "string") {
      return {
        ...userMsg,
        content: userMsg.content.replace(envDetailsRegex, ""),
      };
    }
    return {
      ...userMsg,
      content: userMsg.content.map((part) =>
        part.type === "text"
          ? { ...part, text: part.text.replace(envDetailsRegex, "") }
          : part
      ),
    };
  }

  for (let i = 0; i < coreMessages.length; i++) {
    const msg = coreMessages[i];
    if (msg.role !== "user") continue;
    coreMessages[i] = stripEnvDetails(msg);
  }

  // Inject fresh environment_details into the last user message
  {
    const envNow = new Date();
    const userTz = (sessionMetadata?.userTimezone as string) || null;
    const tzOffset = userTz
      ? (() => {
          try {
            const fmt = new Intl.DateTimeFormat("en", {
              timeZone: userTz,
              timeZoneName: "shortOffset",
            });
            const offset =
              fmt
                .formatToParts(envNow)
                .find((p) => p.type === "timeZoneName")?.value || "";
            return offset.replace("GMT", "UTC");
          } catch {
            return "";
          }
        })()
      : "";
    const envBlock =
      `\n\n<environment_details>\nCurrent time: ${envNow.toISOString()}` +
      (userTz ? `\nUser timezone: ${userTz}, ${tzOffset}` : "") +
      `\n</environment_details>`;

    const lastUserIdx = coreMessages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx !== -1) {
      const msg = coreMessages[lastUserIdx];
      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          coreMessages[lastUserIdx] = {
            ...msg,
            content: msg.content + envBlock,
          };
        } else {
          coreMessages[lastUserIdx] = {
            ...msg,
            content: [
              ...msg.content,
              { type: "text" as const, text: envBlock },
            ],
          };
        }
      }
    }
  }

  return { coreMessages, enhancedMessages };
}
