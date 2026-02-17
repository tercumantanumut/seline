import { consumeStream, streamText, stepCountIs, type ModelMessage, type Tool } from "ai";
import { getLanguageModel, getProviderDisplayName, getConfiguredProvider, ensureAntigravityTokenValid, ensureClaudeCodeTokenValid, getProviderTemperature } from "@/lib/ai/providers";
import { resolveSessionLanguageModel } from "@/lib/ai/session-model-resolver";
import { createDocsSearchTool, createRetrieveFullContentTool } from "@/lib/ai/tools";
import { createWebSearchTool } from "@/lib/ai/web-search";
import { createWebBrowseTool, createWebQueryTool } from "@/lib/ai/web-browse";
import { createVectorSearchToolV2 } from "@/lib/ai/vector-search";
import { createReadFileTool } from "@/lib/ai/tools/read-file-tool";
import { createLocalGrepTool } from "@/lib/ai/ripgrep";
import { createExecuteCommandTool } from "@/lib/ai/tools/execute-command-tool";
import { createEditFileTool } from "@/lib/ai/tools/edit-file-tool";
import { createWriteFileTool } from "@/lib/ai/tools/write-file-tool";
import { createPatchFileTool } from "@/lib/ai/tools/patch-file-tool";
import { createUpdatePlanTool } from "@/lib/ai/tools/update-plan-tool";
import { createSendMessageToChannelTool } from "@/lib/ai/tools/channel-tools";
import { createCreateSkillTool } from "@/lib/ai/tools/create-skill-tool";
import { createListSkillsTool } from "@/lib/ai/tools/list-skills-tool";
import { createRunSkillTool } from "@/lib/ai/tools/run-skill-tool";
import { createUpdateSkillTool } from "@/lib/ai/tools/update-skill-tool";
import { createCopySkillTool } from "@/lib/ai/tools/copy-skill-tool";
import { ToolRegistry, registerAllTools, createToolSearchTool, createListToolsTool } from "@/lib/ai/tool-registry";
import { getSystemPrompt, AI_CONFIG } from "@/lib/ai/config";
import { buildCharacterSystemPrompt, buildCacheableCharacterPrompt, getCharacterAvatarUrl } from "@/lib/ai/character-prompt";
import { shouldUseCache, getCacheConfig } from "@/lib/ai/cache/config";
import { buildDefaultCacheableSystemPrompt } from "@/lib/ai/prompts/base-system-prompt";
import { applyCacheToMessages, estimateCacheSavings } from "@/lib/ai/cache/message-cache";
import type { CacheableSystemBlock } from "@/lib/ai/cache/types";
import { compactIfNeeded } from "@/lib/sessions/compaction";
import { ContextWindowManager } from "@/lib/context-window";
import { getSessionModelId, getSessionProvider } from "@/lib/ai/session-model-resolver";
import { triggerExtraction } from "@/lib/agent-memory";
import { generateSessionTitle } from "@/lib/ai/title-generator";
import { createSession, createMessage, getSession, getOrCreateLocalUser, updateSession, updateMessage } from "@/lib/db/queries";
import { getCharacterFull } from "@/lib/characters/queries";
import { getSkillsSummaryForPrompt } from "@/lib/skills/queries";
import { buildInterruptionMessage, buildInterruptionMetadata } from "@/lib/messages/interruption";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { sessionHasTruncatedContent } from "@/lib/ai/truncated-content-store";
import { taskRegistry } from "@/lib/background-tasks/registry";
import { limitProgressContent } from "@/lib/background-tasks/progress-content-limiter";
import { registerChatAbortController, removeChatAbortController } from "@/lib/background-tasks/chat-abort-registry";
import { combineAbortSignals } from "@/lib/utils/abort";
import {
  classifyRecoverability,
  getBackoffDelayMs,
  shouldRetry,
  sleepWithAbort,
} from "@/lib/ai/retry/stream-recovery";
import type { ChatTask } from "@/lib/background-tasks/types";
import { nowISO } from "@/lib/utils/timestamp";
import { deliverChannelReply } from "@/lib/channels/delivery";
import type { DBContentPart, DBToolCallPart, DBToolResultPart } from "@/lib/messages/converter";
import {
  enhanceFrontendMessagesWithToolResults,
  type FrontendMessage,
} from "@/lib/messages/tool-enhancement";
import { estimateMessageTokens } from "@/lib/utils";
import { normalizeToolResultOutput } from "@/lib/ai/tool-result-utils";
import {
  withRunContext,
  createAgentRun,
  completeAgentRun,
  appendRunEvent,
  initializeToolEventHandler,
} from "@/lib/observability";
import { nextOrderingIndex, allocateOrderingIndices } from "@/lib/session/message-ordering";
import fs from "fs/promises";
import path from "path";

// ============================================================================
// System Prompt Injection
// ============================================================================
// CRITICAL: System prompt is sent with EVERY request to prevent the model
// from "forgetting" critical instructions like "don't output [SYSTEM: markers".
// Previously we tried to optimize by only sending every 7 messages, but this
// caused the model to start echoing internal markers after the 7th message.
//
// NOTE: Tools CANNOT be optimized the same way. Unlike the system prompt (which
// the AI "remembers" from conversation history), tools are function definitions
// that must be present for the AI to actually invoke them. Without the tools
// parameter, the AI will just output fake tool call syntax as plain text.

interface ContextInjectionTrackingMetadata {
  tokensSinceLastInjection: number;
  messagesSinceLastInjection: number;
  lastInjectedAt?: string;
  toolLoadingMode?: "deferred" | "always";
}

/**
 * Discovered tools tracking metadata.
 * Persists tools discovered via searchTools across requests so the model
 * can continue using them in subsequent turns.
 */
interface DiscoveredToolsMetadata {
  /** Tool names discovered via searchTools */
  toolNames: string[];
  /** When the tools were last discovered */
  lastUpdatedAt?: string;
}

/**
 * ALWAYS inject context (system prompt + tools) on every request.
 * This prevents the model from "forgetting" critical negative constraints
 * like "never output [SYSTEM: markers" after N messages.
 * 
 * Previously we tried to optimize by only injecting every 7 messages, but
 * this caused the model to start echoing internal markers and fake tool
 * call JSON after the threshold was exceeded.
 */
function shouldInjectContext(
  _trackingMetadata: ContextInjectionTrackingMetadata | null,
  _isFirstMessage: boolean,
  _toolLoadingMode: "deferred" | "always"
): boolean {
  // ALWAYS return true - send system prompt with every request
  // This is critical to prevent the model from echoing [SYSTEM: markers
  return true;
}

/**
 * Extract context injection tracking metadata from session metadata
 */
function getContextInjectionTracking(
  sessionMetadata: Record<string, unknown> | null
): ContextInjectionTrackingMetadata | null {
  if (!sessionMetadata) return null;

  const tracking = sessionMetadata.contextInjectionTracking as ContextInjectionTrackingMetadata | undefined;
  if (!tracking) return null;

  return {
    tokensSinceLastInjection: tracking.tokensSinceLastInjection ?? 0,
    messagesSinceLastInjection: tracking.messagesSinceLastInjection ?? 0,
    lastInjectedAt: tracking.lastInjectedAt,
    toolLoadingMode: tracking.toolLoadingMode ?? undefined,
  };
}

/**
 * Extract discovered tools from conversation history.
 * Ground truth for tool discovery - parses searchTools results from history.
 * This ensures tools discovered in previous turns remain active.
 */
function getDiscoveredToolsFromMessages(messages: any[]): Set<string> {
  const discovered = new Set<string>();
  for (const msg of messages) {
    if (msg.parts) {
      for (const part of msg.parts) {
        // dynamic-tool is for historical results loaded from DB
        // tool-searchTools is for streaming results (handled by AI SDK)
        const toolName = part.type === "dynamic-tool"
          ? part.toolName
          : (part.type.startsWith("tool-") ? part.type.replace("tool-", "") : null);

        if (toolName === "searchTools") {
          const output = part.output || part.result;
          if (output && Array.isArray(output.results)) {
            for (const res of output.results) {
              if (res.isAvailable && res.name) {
                discovered.add(res.name);
              }
            }
          }
        }
      }
    }
  }
  return discovered;
}

function getDiscoveredToolsFromMetadata(
  sessionMetadata: Record<string, unknown> | null
): Set<string> {
  if (!sessionMetadata) return new Set();

  const discovered = sessionMetadata.discoveredTools as DiscoveredToolsMetadata | undefined;
  if (!discovered?.toolNames) return new Set();

  return new Set(discovered.toolNames);
}

// Initialize tool event handler for observability (once per runtime)
initializeToolEventHandler();

// Maximum request duration in seconds
// Vercel Pro/Enterprise: 300s max, Hobby: 60s max
// Set to 300 (5 minutes) for longer agent operations
export const maxDuration = 300;

// Ensure settings are loaded (syncs provider selection to process.env)
loadSettings();

// Initialize tool registry once per runtime
registerAllTools();

// Check if Styly AI API is configured (for tool discovery instructions)
const hasStylyApiKey = () => !!process.env.STYLY_AI_API_KEY;

// Helper to convert relative image URLs to base64 data URIs for AI providers
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  // If already a data URI or absolute URL, return as-is
  if (imageUrl.startsWith("data:") || imageUrl.startsWith("http")) {
    return imageUrl;
  }

  // Handle relative /api/media/ paths
  if (imageUrl.startsWith("/api/media/")) {
    try {
      // Extract path after /api/media/
      const relativePath = imageUrl.replace("/api/media/", "");
      const filePath = path.join(
        process.env.LOCAL_DATA_PATH || ".local-data",
        "media",
        relativePath
      );

      const fileBuffer = await fs.readFile(filePath);
      const base64 = fileBuffer.toString("base64");

      // Determine mime type from extension
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
      };
      const mimeType = mimeTypes[ext] || "image/png";

      console.log(`[CHAT API] Converted image to base64: ${imageUrl} (${mimeType})`);
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error(`[CHAT API] Failed to convert image to base64: ${imageUrl}`, error);
      // Fall through to return original URL
    }
  }

  return imageUrl;
}

// Maximum length for any single text content to prevent base64 data from leaking into context
// Maximum text content length before smart truncation kicks in
// Content exceeding this limit is truncated, with full content stored for on-demand retrieval
const MAX_TEXT_CONTENT_LENGTH = 10000;

// Helper to check if a tool has ephemeral results (shown in UI but excluded from AI history)
// MCP tools have large outputs like browser snapshots that don't need to persist in context
function isEphemeralTool(toolName: string): boolean {
  // All MCP tools are ephemeral by default (their results are processed once then excluded)
  if (toolName.startsWith("mcp_")) {
    return true;
  }
  return false;
}

// When the conversation nears context limits, switch tool results to deterministic summaries
const TOOL_SUMMARY_TOKEN_THRESHOLD = 120000;

// Limit how many missing tool results we attempt to re-fetch per request
const MAX_TOOL_REFETCH = 6;

// Import the truncated content store for smart truncation
import { storeFullContent } from "@/lib/ai/truncated-content-store";

/**
 * Check if a string looks like base64 image data that shouldn't be in text context
 * This is a safeguard against accidentally including base64 in conversation
 */
function looksLikeBase64ImageData(text: string): boolean {
  // Base64 image data is typically very long and contains specific patterns
  if (text.length < 1000) return false;

  // Check for data URL pattern
  if (text.includes("data:image/") && text.includes(";base64,")) return true;

  // Check for long base64-like strings (mostly alphanumeric with + and /)
  // A typical base64 image would have very high ratio of base64 chars
  const base64Chars = text.match(/[A-Za-z0-9+/=]/g);
  if (base64Chars && base64Chars.length / text.length > 0.95 && text.length > 5000) {
    return true;
  }

  return false;
}

/**
 * Sanitize text content with smart truncation:
 * - Detects and removes base64 image data (safety mechanism)
 * - Strips [SYSTEM: ...] markers that the model may have echoed from context
 * - Strips fake tool call JSON that may have been output as text
 * - When content exceeds MAX_TEXT_CONTENT_LENGTH:
 *   - Stores full content in session store with unique ID
 *   - Returns truncated content with instructions on how to retrieve full content
 *
 * @param text - The text content to sanitize
 * @param context - Description of where this content came from (for logging)
 * @param sessionId - Optional session ID for storing full content (enables smart truncation)
 */
function sanitizeTextContent(text: string, context: string, sessionId?: string): string {
  // Strip [SYSTEM: ...] markers that the model may have echoed from previous context
  // These are internal markers and should never be in the model's output
  const systemMarkerPattern = /\[SYSTEM:\s*Tool\s+[^\]]+\]/gi;
  text = text.replace(systemMarkerPattern, '');
  
  // Strip fake tool call JSON that may have been output as text
  text = stripFakeToolCallJson(text);
  
  if (looksLikeBase64ImageData(text)) {
    console.warn(`[CHAT API] Detected base64 image data in ${context}, stripping to prevent token overflow`);
    return `[Base64 image data removed - use image URL instead]`;
  }

  // Smart truncation: store full content and provide retrieval instructions
  if (text.length > MAX_TEXT_CONTENT_LENGTH) {
    console.warn(`[CHAT API] Truncating long text in ${context}: ${text.length} chars`);

    // If sessionId is provided, store full content for later retrieval
    if (sessionId) {
      const contentId = storeFullContent(sessionId, context, text, MAX_TEXT_CONTENT_LENGTH);

      const truncatedText = text.slice(0, MAX_TEXT_CONTENT_LENGTH);
      const truncationNotice = `

---
⚠️ CONTENT TRUNCATED: This content was truncated at ${MAX_TEXT_CONTENT_LENGTH.toLocaleString()} characters (original: ${text.length.toLocaleString()} chars).
📦 FULL CONTENT AVAILABLE: Reference ID: ${contentId}
🔧 TO RETRIEVE FULL CONTENT: Use the "retrieveFullContent" tool with contentId="${contentId}"
💡 Only retrieve full content if the truncated portion above is insufficient for your task.
---`;

      return truncatedText + truncationNotice;
    } else {
      // No sessionId - simple truncation without storage (fallback behavior)
      return text.slice(0, MAX_TEXT_CONTENT_LENGTH) + `\n\n[Content truncated at ${MAX_TEXT_CONTENT_LENGTH.toLocaleString()} chars - sessionId not available for full content retrieval]`;
    }
  }

  return text;
}

/**
 * Strip fake tool call JSON from model text output.
 * The LLM sometimes outputs raw JSON like {"type":"tool-call",...} or {"type":"tool-result",...}
 * as plain text instead of using structured tool calls. This creates a feedback loop where
 * the next turn sees this text and mimics it. Stripping it breaks the cycle.
 * 
 * Also strips [SYSTEM: Tool ...] markers that the model may echo from previous context.
 */
function stripFakeToolCallJson(text: string): string {
  // Pattern 1: Multi-line JSON objects with type:tool-call or type:tool-result
  // Uses lazy matching with [\s\S] to handle newlines within JSON
  const multilineJsonPattern = /\{\s*"type"\s*:\s*"tool-(call|result)"[\s\S]*?\}/g;
  let cleaned = text.replace(multilineJsonPattern, '');
  
  // Pattern 2: [SYSTEM: Tool ...] markers that the model may echo
  // These are internal markers injected into context - the model should never output them
  const systemMarkerPattern = /\[SYSTEM:\s*Tool\s+[^\]]+\]/gi;
  cleaned = cleaned.replace(systemMarkerPattern, '');
  
  // Pattern 3: Legacy single-line patterns (kept as fallback)
  const linePattern = /^\s*\{[^}]*"type"\s*:\s*"tool-(call|result)"[^\n]*\}\s*$/gm;
  cleaned = cleaned.replace(linePattern, '');
  
  // Pattern 4: Inline tool JSON without newlines
  const inlinePattern = /\{"type"\s*:\s*"tool-(call|result)"\s*,\s*"toolCallId"\s*:\s*"[^"]*"[^}]*\}/g;
  cleaned = cleaned.replace(inlinePattern, '');
  
  return cleaned.trim();
}

// Helper to extract content from assistant-ui message format
// assistant-ui sends messages with `parts` array, but AI SDK expects `content`
// Also handles `experimental_attachments` from AI SDK format
// includeUrlHelpers: when true, adds [Image URL: ...] text for AI context (not for DB storage)
// convertUserImagesToBase64: when true, converts USER-uploaded image URLs to base64 (not tool-generated images)
// sessionId: when provided, enables smart truncation with full content retrieval
// toolSummaryMode: when true, replace tool outputs with deterministic summaries to reduce context bloat
async function extractContent(
  msg: {
    role?: string;
    content?: string | unknown;
    parts?: Array<{
      type: string;
      text?: string;
      image?: string;
      url?: string;
      mediaType?: string;
      filename?: string;
      // For dynamic-tool parts (historical tool calls from DB)
      toolName?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
      // For streaming tool parts from assistant-ui (format: "tool-{toolName}")
      result?: unknown;
    }>;
    // AI SDK experimental_attachments format
    experimental_attachments?: Array<{
      name?: string;
      contentType?: string;
      url?: string;
    }>;
  },
  includeUrlHelpers = false,
  convertUserImagesToBase64 = false,
  sessionId?: string,
  toolSummaryMode = false
): Promise<string | Array<{
  type: string;
  text?: string;
  image?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
}>> {
  // If content exists and is a string, use it directly (with sanitization)
  if (typeof msg.content === "string" && msg.content) {
    // Strip fake tool call JSON that may have been saved from previous model outputs
    const stripped = stripFakeToolCallJson(msg.content);
    if (!stripped.trim()) return "";
    return sanitizeTextContent(stripped, "string content", sessionId);
  }

  // Determine if this is a user message (only user images should be converted to base64)
  const isUserMessage = msg.role === "user";

  // If parts array exists (assistant-ui format), convert it
  if (msg.parts && Array.isArray(msg.parts)) {
    const explicitToolResultIds = new Set(
      msg.parts
        .filter(
          (
            part
          ): part is {
            type: "tool-result";
            toolCallId: string;
          } => part.type === "tool-result" && typeof part.toolCallId === "string"
        )
        .map((part) => part.toolCallId)
    );
    const contentParts: Array<{
      type: string;
      text?: string;
      image?: string;
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
    }> =
      [];

    for (const part of msg.parts) {
      if (part.type === "text" && part.text?.trim()) {
        // Strip fake tool call JSON that the model may have output as text in previous turns
        const strippedText = stripFakeToolCallJson(part.text);
        if (!strippedText.trim()) continue; // Skip entirely empty parts after stripping
        // Sanitize text to prevent base64 leakage (with smart truncation if sessionId provided)
        const sanitizedText = sanitizeTextContent(strippedText, `text part in ${msg.role} message`, sessionId);
        contentParts.push({ type: "text", text: sanitizedText });
      } else if (part.type === "image" && (part.image || part.url)) {
        const imageUrl = (part.image || part.url) as string;
        // ONLY convert to base64 for USER-uploaded images
        // Assistant/tool-generated images should NOT be converted (they're just URLs for reference)
        const shouldConvert = convertUserImagesToBase64 && isUserMessage;
        const finalImageUrl = shouldConvert ? await imageUrlToBase64(imageUrl) : imageUrl;

        if (shouldConvert) {
          // User uploaded image - add as actual image for Claude to see
          contentParts.push({ type: "image", image: finalImageUrl });
        }
        // Add URL as text so Claude can use it in tool calls
        if (includeUrlHelpers) {
          contentParts.push({
            type: "text",
            text: `[Image URL: ${imageUrl}]`,
          });
        }
      } else if (
        part.type === "file" &&
        part.url &&
        part.mediaType?.startsWith("image/")
      ) {
        // ONLY convert to base64 for USER-uploaded files
        const shouldConvert = convertUserImagesToBase64 && isUserMessage;
        const finalImageUrl = shouldConvert ? await imageUrlToBase64(part.url) : part.url;

        if (shouldConvert) {
          // User uploaded image - add as actual image for Claude to see
          contentParts.push({ type: "image", image: finalImageUrl });
        }
        // Add URL as text so Claude can use it in tool calls
        if (includeUrlHelpers) {
          const label = part.filename || "uploaded image";
          contentParts.push({
            type: "text",
            text: `[${label} URL: ${part.url}]`,
          });
        }
        // ALWAYS preserve the file reference (for DB storage when flags are off)
        if (!shouldConvert && !includeUrlHelpers) {
          contentParts.push({
            type: "image",
            image: part.url,
          });
        }
      } else if (part.type === "dynamic-tool" && part.toolName) {
        // Handle historical tool calls from DB
        // CRITICAL: Tool results are now kept as structured data, NOT converted to text with [SYSTEM: ...] markers
        // This prevents the model from learning to mimic these markers and causing fake tool call hallucinations
        const toolName = part.toolName || "tool";

        // Skip ephemeral tools (MCP) - their results are shown in UI but excluded from AI history
        // This saves tokens for large outputs like browser snapshots that were already processed
        if (isEphemeralTool(toolName)) {
          console.log(`[EXTRACT] Skipping ephemeral tool ${toolName} from AI context`);
          continue;
        }

        console.log(`[EXTRACT] Found dynamic-tool: ${toolName}, output:`, JSON.stringify(part.output, null, 2));
        const output = part.output as { images?: Array<{ url: string }>; videos?: Array<{ url: string }>; text?: string; status?: string } | null;
        const toolCallId = part.toolCallId;
        const normalizedInput = toolCallId
          ? normalizeToolCallInput(part.input, toolName, toolCallId) ?? {}
          : null;
        if (toolCallId && normalizedInput) {
          contentParts.push({
            type: "tool-call",
            toolCallId,
            toolName,
            input: normalizedInput,
          });
        }

        if (toolCallId && output !== undefined) {
          const normalizedOutput = toolSummaryMode
            ? summarizeToolResult(toolName, output)
            : normalizeToolResultOutput(toolName, output, normalizedInput).output;
          contentParts.push({
            type: "tool-result",
            toolCallId,
            toolName,
            output: toModelToolResultOutput(normalizedOutput),
          });
        }
        
        // For image/video generation tools, add a natural language reference so AI can use the URLs
        if (output?.images && output.images.length > 0) {
          const urlList = output.images.map((img, idx) => `  ${idx + 1}. ${img.url}`).join("\n");
          console.log(`[EXTRACT] Adding generated image URLs to context: ${urlList}`);
          contentParts.push({
            type: "text",
            text: `Previously generated ${output.images.length} image(s) using ${toolName}:\n${urlList}\nUse these URLs for EDITING requests. For NEW image generation, call the tool.`,
          });
        } else if (output?.videos && output.videos.length > 0) {
          const urlList = output.videos.map((vid, idx) => `  ${idx + 1}. ${vid.url}`).join("\n");
          console.log(`[EXTRACT] Adding generated video URLs to context: ${urlList}`);
          contentParts.push({
            type: "text",
            text: `Previously generated ${output.videos.length} video(s) using ${toolName}:\n${urlList}\nUse these URLs for EDITING requests. For NEW video generation, call the tool.`,
          });
        }
        // For other tools, the structured tool-result part is already in the message parts
        // and will be handled by the AI SDK - no need to add text markers
        // Just log for debugging purposes
        else if (toolName === "searchTools") {
          const searchOutput = output as { status?: string; query?: string; results?: Array<{ name?: string; displayName?: string; isAvailable?: boolean }> } | null;
          if (searchOutput?.results && searchOutput.results.length > 0) {
            const toolNames = searchOutput.results
              .filter((t) => t.isAvailable)
              .map((t) => t.displayName || t.name)
              .join(", ");
            console.log(`[EXTRACT] searchTools found: ${toolNames}`);
          }
        } else if (toolName === "webSearch") {
          const webSearchOutput = output as {
            status?: string;
            query?: string;
            sources?: Array<{ url: string; title: string; snippet: string }>;
            answer?: string;
            formattedResults?: string;
          } | null;
          if (webSearchOutput?.sources && webSearchOutput.sources.length > 0) {
            console.log(`[EXTRACT] webSearch completed: ${webSearchOutput.query} (${webSearchOutput.sources.length} sources)`);
          }
        } else if (toolName === "webBrowse") {
          const webBrowseOutput = output as {
            status?: string;
            synthesis?: string;
            fetchedUrls?: string[];
            sourcesUsed?: string[];
          } | null;
          if (webBrowseOutput?.synthesis) {
            const urls = webBrowseOutput.fetchedUrls || webBrowseOutput.sourcesUsed;
            console.log(`[EXTRACT] webBrowse completed: fetched ${urls?.length || 0} URLs`);
          }
        } else if (toolName === "vectorSearch") {
          const vectorSearchOutput = output as {
            status?: string;
            strategy?: string;
            reasoning?: string;
            findings?: Array<{ filePath: string; lineRange?: string; snippet: string; explanation: string; confidence: number }>;
            summary?: string;
            suggestedRefinements?: string[];
          } | null;
          if (vectorSearchOutput?.findings && vectorSearchOutput.findings.length > 0) {
            console.log(`[EXTRACT] vectorSearch completed: ${vectorSearchOutput.findings.length} findings`);
          }
        } else if (toolName === "showProductImages") {
          const productGalleryOutput = output as {
            status?: string;
            query?: string;
            products?: Array<{
              id: string;
              name: string;
              imageUrl: string;
              price?: string;
              sourceUrl?: string;
              description?: string;
            }>;
          } | null;
          if (productGalleryOutput?.products && productGalleryOutput.products.length > 0) {
            console.log(`[EXTRACT] showProductImages completed: ${productGalleryOutput.products.length} products for "${productGalleryOutput.query}"`);
          }
        } else if (toolName === "executeCommand") {
          console.log("[EXTRACT] executeCommand output preserved as structured data");
        } else {
          // Handle universal truncation notice from limitToolOutput
          const resultObj = output as any;
          if (resultObj?.truncated && resultObj?.truncatedContentId) {
            contentParts.push({
              type: "text",
              text: `\n---\n⚠️ CONTENT TRUNCATED: Full content available via retrieveFullContent with contentId="${resultObj.truncatedContentId}"\n---`,
            });
          }

          // For tools with text output or other results, log but don't add [SYSTEM: ...] markers
          // The structured tool-result part is already preserved in the message
          console.log(`[EXTRACT] dynamic-tool ${toolName} output preserved as structured data`);
        }
      } else if (part.type === "tool-call" && part.toolCallId && part.toolName) {
        const normalizedInput = normalizeToolCallInput(part.input, part.toolName, part.toolCallId) ?? {};
        contentParts.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: normalizedInput,
        });

        // Some historical messages store tool output inline on the tool-call part.
        // Preserve that as a structured tool-result to keep call/result pairs valid.
        const rawOutput = part.output ?? part.result;
        if (rawOutput !== undefined && !explicitToolResultIds.has(part.toolCallId)) {
          const normalizedOutput = toolSummaryMode
            ? summarizeToolResult(part.toolName, rawOutput)
            : normalizeToolResultOutput(part.toolName, rawOutput, normalizedInput).output;
          contentParts.push({
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: toModelToolResultOutput(normalizedOutput),
          });
        }
      } else if (part.type === "tool-result" && part.toolCallId && part.toolName) {
        const normalizedInput = normalizeToolCallInput(part.input, part.toolName, part.toolCallId) ?? {};
        const rawOutput = part.output ?? part.result;
        const normalizedOutput = toolSummaryMode
          ? summarizeToolResult(part.toolName, rawOutput)
          : normalizeToolResultOutput(part.toolName, rawOutput, normalizedInput).output;
        contentParts.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: toModelToolResultOutput(normalizedOutput),
        });
      } else if (part.type.startsWith("tool-") && part.type !== "tool-call" && part.type !== "tool-result") {
        // Handle streaming tool calls from assistant-ui (format: "tool-{toolName}")
        // CRITICAL: Tool results are kept as structured data in the parts, NOT converted to text
        // The AI SDK handles tool-result parts natively - no need for [SYSTEM: ...] markers
        const toolName = part.type.replace("tool-", "");

        // Skip ephemeral tools (MCP) - their results are shown in UI but excluded from AI history
        if (isEphemeralTool(toolName)) {
          console.log(`[EXTRACT] Skipping ephemeral tool ${toolName} from AI context`);
          continue;
        }

        const partWithOutput = part as typeof part & {
          input?: unknown;
          output?: { images?: Array<{ url: string }>; videos?: Array<{ url: string }>; text?: string };
          result?: { images?: Array<{ url: string }>; videos?: Array<{ url: string }>; text?: string };
        };
        const toolOutput = partWithOutput.output ?? partWithOutput.result;
        const toolCallId = part.toolCallId;
        const normalizedInput = toolCallId
          ? normalizeToolCallInput(partWithOutput.input, toolName, toolCallId) ?? {}
          : null;
        if (toolCallId && normalizedInput) {
          contentParts.push({
            type: "tool-call",
            toolCallId,
            toolName,
            input: normalizedInput,
          });
        }
        if (toolCallId && toolOutput !== undefined) {
          const normalizedOutput = toolSummaryMode
            ? summarizeToolResult(toolName, toolOutput)
            : normalizeToolResultOutput(toolName, toolOutput, normalizedInput).output;
          contentParts.push({
            type: "tool-result",
            toolCallId,
            toolName,
            output: toModelToolResultOutput(normalizedOutput),
          });
        }
        console.log(`[EXTRACT] Found tool-${toolName}, result:`, JSON.stringify(toolOutput, null, 2));

        // For image/video generation tools, add natural language reference so AI can use the URLs
        if (toolOutput?.images && toolOutput.images.length > 0) {
          const urlList = toolOutput.images.map((img, idx) => `  ${idx + 1}. ${img.url}`).join("\n");
          console.log(`[EXTRACT] Adding generated image URLs to context: ${urlList}`);
          contentParts.push({
            type: "text",
            text: `Previously generated ${toolOutput.images.length} image(s) using ${toolName}:\n${urlList}\nUse these URLs for EDITING requests. For NEW image generation, call the tool.`,
          });
        } else if (toolOutput?.videos && toolOutput.videos.length > 0) {
          const urlList = toolOutput.videos.map((vid, idx) => `  ${idx + 1}. ${vid.url}`).join("\n");
          console.log(`[EXTRACT] Adding generated video URLs to context: ${urlList}`);
          contentParts.push({
            type: "text",
            text: `Previously generated ${toolOutput.videos.length} video(s) using ${toolName}:\n${urlList}\nUse these URLs for EDITING requests. For NEW video generation, call the tool.`,
          });
        }
        // For other tools, the structured tool-result part is already in the message parts
        // and will be handled by the AI SDK - no need to add text markers
        // Just log for debugging purposes
        else if (toolName === "searchTools") {
          const searchResult = toolOutput as { status?: string; query?: string; results?: Array<{ name?: string; displayName?: string; isAvailable?: boolean }> } | undefined;
          if (searchResult?.results && searchResult.results.length > 0) {
            const toolNames = searchResult.results
              .filter((t) => t.isAvailable)
              .map((t) => t.displayName || t.name)
              .join(", ");
            console.log(`[EXTRACT] searchTools found: ${toolNames}`);
          }
        } else if (toolName === "webSearch") {
          const webSearchResult = toolOutput as {
            status?: string;
            query?: string;
            sources?: Array<{ url: string; title: string; snippet: string }>;
            answer?: string;
          } | undefined;
          if (webSearchResult?.sources && webSearchResult.sources.length > 0) {
            console.log(`[EXTRACT] webSearch completed: ${webSearchResult.query} (${webSearchResult.sources.length} sources)`);
          }
        } else if (toolName === "webBrowse") {
          const webBrowseResult = toolOutput as {
            status?: string;
            synthesis?: string;
            fetchedUrls?: string[];
            sourcesUsed?: string[];
          } | undefined;
          if (webBrowseResult?.synthesis) {
            const urls = webBrowseResult.fetchedUrls || webBrowseResult.sourcesUsed;
            console.log(`[EXTRACT] webBrowse completed: fetched ${urls?.length || 0} URLs`);
          }
        } else if (toolName === "vectorSearch") {
          const vectorSearchResult = toolOutput as {
            status?: string;
            strategy?: string;
            reasoning?: string;
            findings?: Array<{ filePath: string; lineRange?: string; snippet: string; explanation: string; confidence: number }>;
            summary?: string;
            suggestedRefinements?: string[];
          } | undefined;
          if (vectorSearchResult?.findings && vectorSearchResult.findings.length > 0) {
            console.log(`[EXTRACT] vectorSearch completed: ${vectorSearchResult.findings.length} findings`);
          }
        } else if (toolName === "showProductImages") {
          const productGalleryResult = toolOutput as {
            status?: string;
            query?: string;
            products?: Array<{
              id: string;
              name: string;
              imageUrl: string;
              price?: string;
              sourceUrl?: string;
              description?: string;
            }>;
          } | undefined;
          if (productGalleryResult?.products && productGalleryResult.products.length > 0) {
            console.log(`[EXTRACT] showProductImages completed: ${productGalleryResult.products.length} products for "${productGalleryResult.query}"`);
          }
        } else if (toolName === "executeCommand") {
          console.log("[EXTRACT] tool-executeCommand output preserved as structured data");
        } else {
          // Handle universal truncation notice from limitToolOutput
          const resultObj = toolOutput as any;
          if (resultObj?.truncated && resultObj?.truncatedContentId) {
            contentParts.push({
              type: "text",
              text: `\n---\n⚠️ CONTENT TRUNCATED: Full content available via retrieveFullContent with contentId="${resultObj.truncatedContentId}"\n---`,
            });
          }

          // For tools with other output, log but don't add [SYSTEM: ...] markers
          // The structured tool-result part is already preserved in the message
          console.log(`[EXTRACT] tool-${toolName} output preserved as structured data`);
        }
      }
    }

    // Also process experimental_attachments (AI SDK format for file uploads)
    if (msg.experimental_attachments && Array.isArray(msg.experimental_attachments)) {
      console.log(`[EXTRACT] Processing ${msg.experimental_attachments.length} experimental_attachments`);
      for (const attachment of msg.experimental_attachments) {
        if (attachment.url && attachment.contentType?.startsWith("image/")) {
          console.log(`[EXTRACT] Found image attachment: ${attachment.name}, url: ${attachment.url}`);
          const shouldConvert = convertUserImagesToBase64 && isUserMessage;
          const finalImageUrl = shouldConvert ? await imageUrlToBase64(attachment.url) : attachment.url;

          if (shouldConvert) {
            // User uploaded image - add as actual image for Claude to see
            contentParts.push({ type: "image", image: finalImageUrl });
          }
          // Add URL as text so Claude can use it in tool calls
          if (includeUrlHelpers) {
            const label = attachment.name || "uploaded image";
            contentParts.push({
              type: "text",
              text: `[${label} URL: ${attachment.url}]`,
            });
          }
        }
      }
    }

    const normalizedParts = filterOrphanToolCalls(contentParts);

    // If no content parts, return non-empty fallback string for AI providers
    if (normalizedParts.length === 0) {
      return "[Message content not available]";
    }

    // If only one text part, return as string for simplicity
    if (normalizedParts.length === 1 && normalizedParts[0].type === "text") {
      return normalizedParts[0].text || "";
    }

    return normalizedParts;
  }

  // Also check for experimental_attachments even without parts array
  if (msg.experimental_attachments && Array.isArray(msg.experimental_attachments)) {
    const contentParts: Array<{ type: string; text?: string; image?: string }> = [];
    const isUserMessage = msg.role === "user";

    // If there's string content, add it first (with smart truncation if sessionId provided)
    if (typeof msg.content === "string" && msg.content) {
      contentParts.push({ type: "text", text: sanitizeTextContent(msg.content, "string content with attachments", sessionId) });
    }

    console.log(`[EXTRACT] Processing ${msg.experimental_attachments.length} experimental_attachments (no parts)`);
    for (const attachment of msg.experimental_attachments) {
      if (attachment.url && attachment.contentType?.startsWith("image/")) {
        console.log(`[EXTRACT] Found image attachment: ${attachment.name}, url: ${attachment.url}`);
        const shouldConvert = convertUserImagesToBase64 && isUserMessage;
        const finalImageUrl = shouldConvert ? await imageUrlToBase64(attachment.url) : attachment.url;

        if (shouldConvert) {
          contentParts.push({ type: "image", image: finalImageUrl });
        }
        if (includeUrlHelpers) {
          const label = attachment.name || "uploaded image";
          contentParts.push({
            type: "text",
            text: `[${label} URL: ${attachment.url}]`,
          });
        }
      }
    }

    if (contentParts.length > 0) {
      if (contentParts.length === 1 && contentParts[0].type === "text") {
        return contentParts[0].text || "";
      }
      return contentParts;
    }
  }

  // If content is an array, pass it through
  if (Array.isArray(msg.content)) {
    return msg.content as Array<{
      type: string;
      text?: string;
      image?: string;
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
    }>;
  }

  // Fallback
  return "[Message content not available]";
}

function estimateFrontendMessageTokens(
  messages: FrontendMessage[],
  sessionSummary?: string | null
): number {
  let total = 0;

  if (sessionSummary) {
    total += estimateMessageTokens({ content: sessionSummary });
  }

  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      total += estimateMessageTokens({ content: msg.content });
      continue;
    }
    if (typeof msg.content === "string") {
      total += estimateMessageTokens({ content: msg.content });
      continue;
    }
    if (Array.isArray(msg.parts)) {
      total += estimateMessageTokens({ content: msg.parts });
      continue;
    }
    total += 10;
  }

  return total;
}

function shouldUseToolSummaries(
  messages: FrontendMessage[],
  sessionSummary?: string | null
): boolean {
  const estimatedTokens = estimateFrontendMessageTokens(messages, sessionSummary);
  return estimatedTokens >= TOOL_SUMMARY_TOKEN_THRESHOLD;
}

const TOOL_HISTORY_SUMMARY_MAX_CHARS = 320;

function summarizeHistoricalToolOutput(output: unknown): string {
  if (typeof output === "string") {
    return output.slice(0, TOOL_HISTORY_SUMMARY_MAX_CHARS);
  }

  if (output && typeof output === "object") {
    const maybeTyped = output as { type?: unknown; value?: unknown };
    if (maybeTyped.type === "text" && typeof maybeTyped.value === "string") {
      return maybeTyped.value.slice(0, TOOL_HISTORY_SUMMARY_MAX_CHARS);
    }
    if (maybeTyped.type === "json") {
      try {
        const jsonText = JSON.stringify(maybeTyped.value);
        return jsonText.slice(0, TOOL_HISTORY_SUMMARY_MAX_CHARS);
      } catch {
        return "[unserializable json output]";
      }
    }
    try {
      return JSON.stringify(output).slice(0, TOOL_HISTORY_SUMMARY_MAX_CHARS);
    } catch {
      return "[unserializable output]";
    }
  }

  return String(output ?? "").slice(0, TOOL_HISTORY_SUMMARY_MAX_CHARS);
}

function sanitizeToolHistoryForAntigravityClaude(messages: ModelMessage[]): ModelMessage[] {
  let removedCalls = 0;
  let removedResults = 0;

  const sanitized: ModelMessage[] = messages.map((message): ModelMessage => {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      return message;
    }

    const keptParts: Array<Record<string, unknown>> = [];
    const summaryLines: string[] = [];

    for (const rawPart of message.content as Array<Record<string, unknown>>) {
      const partType = rawPart?.type;
      if (partType === "tool-call") {
        removedCalls += 1;
        continue;
      }
      if (partType === "tool-result") {
        removedResults += 1;
        const toolName = typeof rawPart.toolName === "string" ? rawPart.toolName : "tool";
        const summary = summarizeHistoricalToolOutput(rawPart.output);
        summaryLines.push(`[Previous ${toolName} result] ${summary}`);
        continue;
      }
      keptParts.push(rawPart);
    }

    if (summaryLines.length > 0) {
      keptParts.push({
        type: "text",
        text: summaryLines.join("\n"),
      });
    }

    if (keptParts.length === 0) {
      return {
        ...message,
        content: "[Previous tool activity omitted for Claude compatibility.]",
      } as ModelMessage;
    }

    if (
      keptParts.length === 1 &&
      keptParts[0].type === "text" &&
      typeof keptParts[0].text === "string"
    ) {
      return {
        ...message,
        content: keptParts[0].text,
      } as ModelMessage;
    }

    return {
      ...message,
      content: keptParts as ModelMessage["content"],
    } as ModelMessage;
  });

  if (removedCalls > 0 || removedResults > 0) {
    console.log(
      `[CHAT API] Antigravity Claude history sanitization: removed ${removedCalls} tool-call and ${removedResults} tool-result parts`
    );
  }

  return sanitized;
}

/**
 * Split tool-result parts out of assistant messages into separate role:"tool" messages.
 *
 * The AI SDK's Anthropic converter only handles tool-result in assistant messages for
 * provider-executed tools (MCP, web_search, code_execution). Regular tool results
 * (executeCommand, vectorSearch, etc.) are silently dropped, leaving orphan tool_use
 * blocks that cause: "tool_use ids were found without tool_result blocks immediately after".
 *
 * This function moves tool-result parts from assistant messages into role:"tool" messages
 * placed immediately after, which the AI SDK correctly converts to Anthropic tool_result blocks.
 *
 * Also removes orphan tool-call parts (those without matching tool-result anywhere)
 * to prevent the same error when tool execution was interrupted.
 */
function splitToolResultsFromAssistantMessages(messages: ModelMessage[]): ModelMessage[] {
  // First pass: collect all tool-call and tool-result IDs across all messages
  const allToolCallIds = new Set<string>();
  const allToolResultIds = new Set<string>();

  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content as Array<Record<string, unknown>>) {
      if (part.type === "tool-call" && typeof part.toolCallId === "string") {
        allToolCallIds.add(part.toolCallId);
      }
      if (part.type === "tool-result" && typeof part.toolCallId === "string") {
        allToolResultIds.add(part.toolCallId);
      }
    }
  }

  const result: ModelMessage[] = [];
  let splitCount = 0;
  let removedOrphanCalls = 0;

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      result.push(message);
      continue;
    }

    // Separate parts into: before-tool-call, tool-call, tool-result, after-tool-call
    // The Anthropic API requires:
    //   assistant: [text, tool_use]        ← parts up to and including last tool_use
    //   user:      [tool_result]           ← tool results
    //   assistant: [text]                  ← any content generated AFTER tool results
    // Content after the last tool_use was generated in a new step after tool execution,
    // so it must go in a separate assistant message AFTER the tool result message.

    const parts = message.content as Array<Record<string, unknown>>;

    // Find the index of the last tool-call part
    let lastToolCallIdx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].type === "tool-call") {
        lastToolCallIdx = i;
        break;
      }
    }

    // No tool-calls in this message — check for orphan tool-results
    if (lastToolCallIdx === -1) {
      const hasToolResults = parts.some(p => p.type === "tool-result");
      if (hasToolResults) {
        // Orphan tool-results without tool-calls — convert to text
        const filtered = parts.filter(p => p.type !== "tool-result");
        if (filtered.length > 0) {
          result.push({ ...message, content: filtered as ModelMessage["content"] } as ModelMessage);
        } else {
          result.push({ ...message, content: "[Previous tool activity omitted.]" } as ModelMessage);
        }
      } else {
        result.push(message);
      }
      continue;
    }

    // Split the parts at the last tool-call boundary
    // beforeAndIncluding: text + tool-call parts (the "step 1" assistant content)
    // toolResults: tool-result parts
    // afterToolCalls: text parts after the last tool-call (the "step 2" content)
    const beforeAndIncluding: Array<Record<string, unknown>> = [];
    const toolResultParts: Array<Record<string, unknown>> = [];
    const afterToolCalls: Array<Record<string, unknown>> = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.type === "tool-result") {
        toolResultParts.push(part);
        continue;
      }

      if (part.type === "tool-call" && typeof part.toolCallId === "string" && !allToolResultIds.has(part.toolCallId)) {
        // Orphan tool-call without matching result — remove
        removedOrphanCalls++;
        continue;
      }

      if (i <= lastToolCallIdx) {
        beforeAndIncluding.push(part);
      } else {
        afterToolCalls.push(part);
      }
    }

    // No tool-results found and no orphans — keep as-is
    if (toolResultParts.length === 0 && removedOrphanCalls === 0 && afterToolCalls.length === 0) {
      result.push(message);
      continue;
    }

    // Reorder beforeAndIncluding: text parts must come before all tool-call parts.
    // When tool-result parts are extracted, text blocks that were between tool-call/result
    // pairs end up between tool-call blocks. The Anthropic API treats text between tool_use
    // blocks as a boundary, expecting tool_results for the preceding group immediately.
    // Moving text before tool-calls avoids this: [text, tool_use, tool_use] is valid.
    const textParts = beforeAndIncluding.filter(p => p.type !== "tool-call");
    const toolCallParts = beforeAndIncluding.filter(p => p.type === "tool-call");
    const reorderedParts = [...textParts, ...toolCallParts];

    // Emit assistant message with parts up to and including tool-calls (step 1)
    if (reorderedParts.length > 0) {
      result.push({ ...message, content: reorderedParts as ModelMessage["content"] } as ModelMessage);
    } else {
      result.push({ ...message, content: "[Calling tools...]" } as ModelMessage);
    }

    // Emit tool message with tool-results
    if (toolResultParts.length > 0) {
      splitCount += toolResultParts.length;
      result.push({
        role: "tool",
        content: toolResultParts,
      } as ModelMessage);
    }

    // Emit second assistant message with content after tool-calls (step 2)
    if (afterToolCalls.length > 0) {
      const afterContent = afterToolCalls.length === 1 &&
        afterToolCalls[0].type === "text" && typeof afterToolCalls[0].text === "string"
        ? afterToolCalls[0].text as string
        : afterToolCalls as ModelMessage["content"];
      result.push({ role: "assistant", content: afterContent } as ModelMessage);
    }
  }

  if (splitCount > 0 || removedOrphanCalls > 0) {
    console.log(
      `[CHAT API] Claude message splitting: moved ${splitCount} tool-result parts to role:tool messages, removed ${removedOrphanCalls} orphan tool-calls`
    );
  }

  return result;
}

function filterOrphanToolCalls(
  parts: Array<{
    type: string;
    text?: string;
    image?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  }>
): Array<{
  type: string;
  text?: string;
  image?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
}> {
  const toolCallIds = new Set(
    parts
      .filter(
        (part): part is { type: "tool-call"; toolCallId: string } =>
          part.type === "tool-call" && typeof part.toolCallId === "string"
      )
      .map((part) => part.toolCallId)
  );
  const toolResultIds = new Set(
    parts
      .filter(
        (part): part is { type: "tool-result"; toolCallId: string } =>
          part.type === "tool-result" && typeof part.toolCallId === "string"
      )
      .map((part) => part.toolCallId)
  );

  let removedOrphanCalls = 0;
  let removedOrphanResults = 0;
  let removedDuplicateCalls = 0;
  let removedDuplicateResults = 0;
  const seenToolCalls = new Set<string>();
  const seenToolResults = new Set<string>();

  const filtered = parts.filter((part) => {
    if (part.type === "tool-call") {
      if (typeof part.toolCallId !== "string") {
        removedOrphanCalls += 1;
        return false;
      }
      if (!toolResultIds.has(part.toolCallId)) {
        removedOrphanCalls += 1;
        return false;
      }
      if (seenToolCalls.has(part.toolCallId)) {
        removedDuplicateCalls += 1;
        return false;
      }
      seenToolCalls.add(part.toolCallId);
      return true;
    }

    if (part.type === "tool-result") {
      if (typeof part.toolCallId !== "string") {
        removedOrphanResults += 1;
        return false;
      }
      if (!toolCallIds.has(part.toolCallId)) {
        removedOrphanResults += 1;
        return false;
      }
      if (seenToolResults.has(part.toolCallId)) {
        removedDuplicateResults += 1;
        return false;
      }
      seenToolResults.add(part.toolCallId);
      return true;
    }

    return true;
  });

  if (
    removedOrphanCalls > 0 ||
    removedOrphanResults > 0 ||
    removedDuplicateCalls > 0 ||
    removedDuplicateResults > 0
  ) {
    console.warn(
      `[CHAT API] Filtered tool parts before model send: ` +
      `orphan calls=${removedOrphanCalls}, orphan results=${removedOrphanResults}, ` +
      `duplicate calls=${removedDuplicateCalls}, duplicate results=${removedDuplicateResults}`
    );
  }

  return filtered;
}

function toModelToolResultOutput(
  output: unknown
): { type: "text"; value: string } | { type: "json"; value: unknown } {
  if (typeof output === "string") {
    return { type: "text", value: output };
  }

  // Ensure payload stays JSON-serializable for ModelMessage validation.
  try {
    return { type: "json", value: JSON.parse(JSON.stringify(output ?? null)) };
  } catch {
    return {
      type: "json",
      value: { status: "error", error: "Tool result was not JSON-serializable." },
    };
  }
}

function summarizeToolResult(toolName: string, output: unknown): unknown {
  const normalized = normalizeToolResultOutput(toolName, output, undefined).output as Record<string, unknown> | string | null;

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return normalized;
  }

  const summary: Record<string, unknown> = {};
  const status = normalized.status;
  if (typeof status === "string") {
    summary.status = status;
  }

  if (typeof normalized.message === "string" && normalized.message.trim()) {
    summary.message = normalized.message;
  }

  if (typeof normalized.exitCode === "number") {
    summary.exitCode = normalized.exitCode;
  }

  if (typeof normalized.executionTime === "number") {
    summary.executionTime = normalized.executionTime;
  }

  if (typeof normalized.logId === "string" && normalized.logId) {
    summary.logId = normalized.logId;
  }

  if (typeof normalized.stdout === "string" && normalized.stdout) {
    summary.stdoutPreview = normalized.stdout.slice(0, 300);
  }

  if (typeof normalized.stderr === "string" && normalized.stderr) {
    summary.stderrPreview = normalized.stderr.slice(0, 300);
  }

  if (Object.keys(summary).length === 0) {
    return { status: "success", summarized: true };
  }

  summary.summarized = true;
  return summary;
}

function normalizeToolCallInput(
  input: unknown,
  toolName: string,
  toolCallId: string
): Record<string, unknown> | null {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      console.warn(
        `[CHAT API] Invalid tool call input for ${toolName} (${toolCallId}): ${String(error)}`
      );
      return null;
    }
  }
  console.warn(
    `[CHAT API] Skipping tool call ${toolName} (${toolCallId}) with non-object input`
  );
  return null;
}

/**
 * Attempt to repair truncated JSON from streaming tool calls.
 * Handles common patterns where the stream was interrupted mid-JSON:
 * - Missing closing braces/brackets: {"command": "python", "args": ["-c"
 * - Truncated string values: {"command": "python", "args": ["-c", "from PIL
 * Returns parsed object or null if repair is not possible.
 */
function attemptJsonRepair(malformedJson: string): Record<string, unknown> | null {
  if (!malformedJson || malformedJson.trim().length === 0) {
    return null;
  }

  const trimmed = malformedJson.trim();

  // If it doesn't start with {, it's not a recoverable JSON object
  if (!trimmed.startsWith("{")) {
    return null;
  }

  // Strategy: Track string/escape state and count open braces/brackets,
  // then append the necessary closing characters.
  let inString = false;
  let escapeNext = false;
  const stack: string[] = [];

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      if (inString) escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
    } else if (char === "}" || char === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === char) {
        stack.pop();
      }
    }
  }

  // If nothing is unclosed, the JSON is structurally complete but still
  // failed to parse — we can't repair syntax errors, only truncation.
  if (stack.length === 0 && !inString) {
    return null;
  }

  // Build a repaired string: close any open string, then close brackets/braces
  let repaired = trimmed;
  if (inString) {
    repaired += '"';
  }
  // Close all open brackets/braces in reverse order
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  try {
    const parsed = JSON.parse(repaired);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Repair attempt didn't produce valid JSON
  }

  return null;
}

interface StreamingMessageState {
  parts: DBContentPart[];
  toolCallParts: Map<string, DBToolCallPart>;
  loggedIncompleteToolCalls: Set<string>;
  messageId?: string;
  lastBroadcastAt: number;
  lastBroadcastSignature: string;
  pendingBroadcast?: boolean;
}

function cloneContentParts(parts: DBContentPart[]): DBContentPart[] {
  if (typeof structuredClone === "function") {
    return structuredClone(parts);
  }
  return JSON.parse(JSON.stringify(parts));
}

function buildProgressSignature(parts: DBContentPart[]): string {
  return parts.map((part) => {
    if (part.type === "text") {
      return `t:${part.text.length}:${part.text.slice(0, 100)}`;
    }

    if (part.type === "tool-call") {
      return `tc:${part.toolCallId}:${part.state ?? ""}`;
    }

    if (part.type === "tool-result") {
      const preview =
        typeof part.result === "string"
          ? `s:${part.result.length}:${part.result.slice(0, 120)}`
          : part.result && typeof part.result === "object"
            ? (() => {
                const entries = Object.entries(part.result as Record<string, unknown>)
                  .slice(0, 5)
                  .map(([key, value]) => {
                    if (typeof value === "string") return `${key}:${value.length}:${value.slice(0, 60)}`;
                    if (typeof value === "number" || typeof value === "boolean") return `${key}:${value}`;
                    if (Array.isArray(value)) return `${key}:arr${value.length}`;
                    return `${key}:${typeof value}`;
                  })
                  .join(",");
                return `o:${Object.keys(part.result as Record<string, unknown>).length}:${entries}`;
              })()
            : `p:${typeof part.result}`;
      return `tr:${part.toolCallId}:${part.state ?? ""}:${preview}`;
    }

    return `o:${part.type}`;
  }).join("|");
}

function extractTextFromParts(parts: DBContentPart[]): string {
  return parts
    .filter((part): part is Extract<DBContentPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function appendTextPartToState(state: StreamingMessageState, delta: string | undefined): boolean {
  if (!delta) {
    return false;
  }
  const lastPart = state.parts[state.parts.length - 1];
  if (lastPart?.type === "text") {
    lastPart.text += delta;
  } else {
    state.parts.push({ type: "text", text: delta });
  }
  return true;
}

function ensureToolCallPart(state: StreamingMessageState, toolCallId: string, toolName?: string): DBToolCallPart {
  let part = state.toolCallParts.get(toolCallId);
  if (!part) {
    part = {
      type: "tool-call",
      toolCallId,
      toolName: toolName ?? "tool",
      state: "input-streaming",
    };
    state.toolCallParts.set(toolCallId, part);
    state.parts.push(part);
  } else if (toolName && part.toolName !== toolName) {
    part.toolName = toolName;
  }
  return part;
}

function recordToolInputStart(state: StreamingMessageState, toolCallId: string, toolName?: string): boolean {
  if (!toolCallId) {
    return false;
  }
  const part = ensureToolCallPart(state, toolCallId, toolName);
  part.state = "input-streaming";
  return true;
}

function recordToolInputDelta(state: StreamingMessageState, toolCallId: string, delta: string | undefined): boolean {
  if (!toolCallId || !delta) {
    return false;
  }
  const part = ensureToolCallPart(state, toolCallId);
  part.argsText = `${part.argsText ?? ""}${delta}`;
  part.state = part.state ?? "input-streaming";
  return true;
}

function finalizeStreamingToolCalls(state: StreamingMessageState): boolean {
  let changed = false;
  for (const part of state.toolCallParts.values()) {
    // Finalize any tool call that's still in input-streaming state without args
    if (part.type === "tool-call" && part.state === "input-streaming" && !part.args) {
      if (part.argsText) {
        // Parse the accumulated argsText
        try {
          const parsed = JSON.parse(part.argsText);
          part.args = parsed;
          part.state = "input-available";
          changed = true;
          console.log(`[CHAT API] Finalized streaming tool call: ${part.toolName} (${part.toolCallId})`);
        } catch (error) {
          // argsText is invalid JSON - log full details for debugging
          console.warn(
            `[CHAT API] Failed to parse argsText for ${part.toolName} (${part.toolCallId}).\n` +
            `  Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `  argsText length: ${part.argsText.length}\n` +
            `  Full argsText: ${part.argsText}`
          );

          // Attempt to repair truncated JSON (e.g. missing closing braces/brackets)
          const repaired = attemptJsonRepair(part.argsText);
          if (repaired !== null) {
            console.log(
              `[CHAT API] Successfully repaired malformed JSON for ${part.toolName} (${part.toolCallId})`
            );
            part.args = repaired;
            part.state = "input-available";
            changed = true;
          } else {
            // Last resort: empty object so the tool call doesn't crash downstream
            console.warn(
              `[CHAT API] JSON repair failed for ${part.toolName} (${part.toolCallId}), using empty args`
            );
            part.args = {};
            part.state = "input-available";
            changed = true;
          }
        }
      } else {
        // No argsText means the tool was called with empty args (no tool-input-delta chunks sent)
        // This is valid - many tools accept empty/optional parameters
        part.args = {};
        part.state = "input-available";
        changed = true;
        console.log(`[CHAT API] Finalized streaming tool call with empty args: ${part.toolName} (${part.toolCallId})`);
      }
    }
  }
  return changed;
}

function recordStructuredToolCall(
  state: StreamingMessageState,
  toolCallId: string,
  toolName: string,
  input: unknown,
): boolean {
  if (!toolCallId) {
    return false;
  }
  const part = ensureToolCallPart(state, toolCallId, toolName);
  part.state = "input-available";
  part.args = input;
  return true;
}

function recordToolResultChunk(
  state: StreamingMessageState,
  toolCallId: string,
  toolName: string,
  output: unknown,
  preliminary?: boolean,
): boolean {
  if (!toolCallId) {
    return false;
  }
  const normalizedName = toolName || state.toolCallParts.get(toolCallId)?.toolName || "tool";
  const callPart = ensureToolCallPart(state, toolCallId, normalizedName);
  const normalized = normalizeToolResultOutput(normalizedName, output, callPart.args);
  const status = normalized.status.toLowerCase();
  const isErrorStatus = status === "error" || status === "failed";
  callPart.state = isErrorStatus ? "output-error" : "output-available";

  // Check if we already have a tool-result for this toolCallId
  const existingResultIndex = state.parts.findIndex(
    (part) => part.type === "tool-result" && (part as DBToolResultPart).toolCallId === toolCallId
  );

  const resultPart: DBToolResultPart = {
    type: "tool-result",
    toolCallId,
    toolName: normalizedName,
    result: normalized.output,
    state: callPart.state,
    preliminary,
    status: normalized.status,
    timestamp: new Date().toISOString(),
  };

  if (existingResultIndex !== -1) {
    // Update existing result part instead of adding a new one
    state.parts[existingResultIndex] = resultPart;
  } else {
    // Only add new part if one doesn't exist
    state.parts.push(resultPart);
  }

  return true;
}

export async function POST(req: Request) {
  let agentRun: { id: string } | null = null;
  let chatTaskRegistered = false;
  try {
    // Check for internal scheduled task execution
    const isScheduledRun = req.headers.get("X-Scheduled-Run") === "true";
    const internalAuth = req.headers.get("X-Internal-Auth");
    const expectedSecret = process.env.INTERNAL_API_SECRET || "seline-internal-scheduler";

    let userId: string;

    const scheduledRunId = isScheduledRun ? req.headers.get("X-Scheduled-Run-Id") : null;
    const scheduledTaskId = isScheduledRun ? req.headers.get("X-Scheduled-Task-Id") : null;
    const scheduledTaskName = isScheduledRun ? req.headers.get("X-Scheduled-Task-Name") : null;

    if (isScheduledRun && internalAuth === expectedSecret) {
      // Scheduled task execution - use provided session's user
      // The user ID will be extracted from the session
      const headerSessionId = req.headers.get("X-Session-Id");
      if (headerSessionId) {
        const session = await getSession(headerSessionId);
        if (session?.userId) {
          userId = session.userId;
          console.log(`[CHAT API] Scheduled task execution for user ${userId}`);
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid session for scheduled task" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: "Session ID required for scheduled task" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      // Normal authentication flow
      userId = await requireAuth(req);
    }

    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const selectedProvider = (settings.llmProvider || process.env.LLM_PROVIDER || "").toLowerCase();

    // CRITICAL: If Antigravity is selected, ensure token is valid/refreshed BEFORE making API calls
    // This prevents authentication failures when token expires during normal usage
    if (selectedProvider === "antigravity") {
      const tokenValid = await ensureAntigravityTokenValid();
      if (!tokenValid) {
        return new Response(
          JSON.stringify({ error: "Antigravity authentication expired. Please re-authenticate in Settings." }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // CRITICAL: If Claude Code is selected, ensure token is valid/refreshed BEFORE making API calls
    if (selectedProvider === "claudecode") {
      const tokenValid = await ensureClaudeCodeTokenValid();
      if (!tokenValid) {
        return new Response(
          JSON.stringify({ error: "Claude Code authentication expired. Please re-authenticate in Settings." }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const { messages, sessionId: bodySessionId } = body as {
      messages: Array<{
        id?: string;
        role: string;
        content?: string | unknown;
        parts?: Array<{ type: string; text?: string; image?: string; url?: string }>;
        experimental_attachments?: Array<{ name?: string; contentType?: string; url?: string }>;
      }>;
      sessionId?: string;
    };

    // Get session ID from header (AssistantChatTransport) or body
    const headerSessionId = req.headers.get("X-Session-Id");
    const providedSessionId = headerSessionId || bodySessionId;

    // Get character ID from header (for character-specific chats)
    const characterId = req.headers.get("X-Character-Id");
    const taskSource = req.headers.get("X-Task-Source")?.toLowerCase();
    const isChannelSource = taskSource === "channel";

    // DEBUG: Log session ID sources and last message structure
    console.log(`[CHAT API] Session ID: header=${headerSessionId}, body=${bodySessionId}, using=${providedSessionId}, characterId=${characterId}, source=${taskSource || "chat"}`);

    // DEBUG: Log full structure of last message to understand attachment handling
    const lastMsg = messages[messages.length - 1];
    console.log(`[CHAT API] Last message structure:`, JSON.stringify({
      id: lastMsg?.id,
      role: lastMsg?.role,
      hasContent: !!lastMsg?.content,
      contentType: typeof lastMsg?.content,
      hasParts: !!lastMsg?.parts,
      partsCount: lastMsg?.parts?.length,
      parts: lastMsg?.parts?.map(p => ({ type: p.type, hasImage: !!p.image, hasUrl: !!p.url })),
      hasAttachments: !!(lastMsg as any)?.experimental_attachments,
      attachmentsCount: (lastMsg as any)?.experimental_attachments?.length,
      attachments: (lastMsg as any)?.experimental_attachments,
    }, null, 2));

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get or create session (always associated with user)
    // Also track system prompt injection state
    let sessionId = providedSessionId;
    let isNewSession = false;
    let sessionMetadata: Record<string, unknown> = {};
    let sessionSummary: string | null = null;

    if (!sessionId) {
      const session = await createSession({
        title: "New Design Session",
        userId: dbUser.id,
        metadata: {},
      });
      sessionId = session.id;
      isNewSession = true;
    } else {
      // Verify session exists and belongs to user
      const session = await getSession(sessionId);
      if (!session) {
        const newSession = await createSession({
          id: sessionId,
          title: "New Design Session",
          userId: dbUser.id,
          metadata: {},
        });
        sessionId = newSession.id;
        isNewSession = true;
      } else if (session.userId !== dbUser.id) {
        // Session exists but belongs to another user
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      } else {
        // Session exists and belongs to user - extract metadata for system prompt tracking
        sessionMetadata = (session.metadata as Record<string, unknown>) || {};
        sessionSummary = session.summary ?? null;
      }
    }

    const appSettings = loadSettings();
    const toolLoadingMode = appSettings.toolLoadingMode ?? "deferred";
    const eventCharacterId =
      characterId ||
      ((sessionMetadata?.characterId as string | undefined) ?? "");
    const shouldEmitProgress = Boolean(sessionId);
    const streamingState: StreamingMessageState | null = shouldEmitProgress
      ? {
        parts: [],
        toolCallParts: new Map<string, DBToolCallPart>(),
        loggedIncompleteToolCalls: new Set<string>(),
        messageId: undefined,
        lastBroadcastAt: 0,
        lastBroadcastSignature: "",
      }
      : null;

    const syncStreamingMessage = shouldEmitProgress
      ? async (force = false) => {
        if (!streamingState || streamingState.parts.length === 0) {
          return;
        }

        // Filter out incomplete tool calls before persisting to database
        // This prevents corrupted state from being saved during streaming interruptions
        let filteredParts = streamingState.parts.filter(part => {
          if (part.type === "tool-call") {
            // Only persist tool calls that have complete args or are beyond input-streaming state
            const hasCompleteArgs = part.args !== undefined;
            const isStillStreaming = part.state === "input-streaming";

            if (isStillStreaming && !hasCompleteArgs) {
              const logKey = `${part.toolCallId}:${part.toolName ?? "tool"}`;
              if (!streamingState.loggedIncompleteToolCalls.has(logKey)) {
                streamingState.loggedIncompleteToolCalls.add(logKey);
                console.log(
                  `[CHAT API] Filtering incomplete tool call ${part.toolCallId} (${part.toolName}) ` +
                  `from streaming persistence - state: ${part.state}, has args: ${hasCompleteArgs}`
                );
              }
              return false; // Don't persist incomplete streaming tool calls
            }

            // Also validate that argsText (if present without parsed args) is valid JSON
            // This prevents malformed JSON from reaching the client via the database
            if (!hasCompleteArgs && part.argsText) {
              try {
                JSON.parse(part.argsText);
              } catch {
                const logKey = `malformed:${part.toolCallId}:${part.toolName ?? "tool"}`;
                if (!streamingState.loggedIncompleteToolCalls.has(logKey)) {
                  streamingState.loggedIncompleteToolCalls.add(logKey);
                  console.warn(
                    `[CHAT API] Filtering tool call with malformed argsText from persistence: ` +
                    `${part.toolName} (${part.toolCallId}), argsText length: ${part.argsText.length}, ` +
                    `preview: ${part.argsText.substring(0, 120)}...`
                  );
                }
                return false; // Don't persist tool calls with invalid JSON argsText
              }
            }
          }
          return true; // Keep all other parts
        });

        if (filteredParts.length === 0 && streamingState.parts.length > 0) {
          filteredParts = [{ type: "text", text: "Working..." }];
        }

        const now = Date.now();
        const signature = buildProgressSignature(filteredParts);

        // Skip if content hasn't changed
        if (signature === streamingState.lastBroadcastSignature) {
          return;
        }

        // For non-forced updates, use smarter throttling
        if (!force) {
          const timeSinceLastBroadcast = now - streamingState.lastBroadcastAt;

          // Use shorter interval (200ms) for text-only updates
          // Use longer interval (400ms) for tool state changes
          const hasToolChanges = filteredParts.some(
            (part) => part.type === "tool-call" || part.type === "tool-result"
          );
          const throttleInterval = hasToolChanges ? 400 : 200;

          if (timeSinceLastBroadcast < throttleInterval) {
            // Mark that we have a pending broadcast
            if (!streamingState.pendingBroadcast) {
              streamingState.pendingBroadcast = true;
              // Schedule a delayed broadcast
              setTimeout(() => {
                if (streamingState.pendingBroadcast && syncStreamingMessage) {
                  streamingState.pendingBroadcast = false;
                  void syncStreamingMessage();
                }
              }, throttleInterval - timeSinceLastBroadcast);
            }
            return;
          }
        }

        streamingState.pendingBroadcast = false;

        const partsSnapshot = cloneContentParts(filteredParts);

        if (!streamingState.messageId) {
          // Allocate ordering index for streaming assistant message
          const assistantMessageIndex = await nextOrderingIndex(sessionId);

          const created = await createMessage({
            sessionId,
            role: "assistant",
            content: partsSnapshot,
            orderingIndex: assistantMessageIndex,
            metadata: {
              isStreaming: true,
              scheduledRunId,
              scheduledTaskId,
            },
          });
          streamingState.messageId = created?.id;
        } else {
          await updateMessage(streamingState.messageId, {
            content: partsSnapshot,
          });
        }

        if (streamingState.messageId) {
          streamingState.lastBroadcastSignature = signature;
          streamingState.lastBroadcastAt = now;
          let progressText = extractTextFromParts(partsSnapshot);
          if (!progressText) {
            for (let index = streamingState.parts.length - 1; index >= 0; index -= 1) {
              const part = streamingState.parts[index];
              if (part?.type === "tool-call") {
                progressText = `Running ${part.toolName || "tool"}...`;
                break;
              }
            }
          }
          if (!progressText) {
            progressText = "Working...";
          }
          const progressRunId = scheduledRunId ?? agentRun?.id;
          const progressType = scheduledRunId ? "scheduled" : agentRun?.id ? "chat" : undefined;

          console.log("[CHAT API] Progress event routing:", {
            scheduledRunId,
            agentRunId: agentRun?.id,
            progressRunId,
            progressType,
            progressText: progressText.slice(0, 50),
            willEmitToRegistry: Boolean(progressRunId && progressType),
          });

          if (progressRunId && progressType) {
            // Limit progressContent before emitting to prevent oversized payloads
            // from being serialized into SSE events. The full partsSnapshot is
            // already persisted to the database above — this only affects the
            // real-time progress display sent to clients.
            const progressLimit = limitProgressContent(partsSnapshot);
            if (progressLimit.wasTruncated) {
              console.log(
                `[CHAT API] Progress content truncated: ` +
                `~${progressLimit.originalTokens.toLocaleString()} → ~${progressLimit.finalTokens.toLocaleString()} tokens` +
                (progressLimit.hardCapped ? " (hard cap summary applied)" : "")
              );
            }

            taskRegistry.emitProgress(
              progressRunId,
              progressText,
              undefined,
              {
                type: progressType,
                taskId: scheduledTaskId ?? undefined,
                taskName: scheduledTaskName ?? undefined,
                userId: dbUser.id,
                characterId: eventCharacterId,
                sessionId,
                assistantMessageId: streamingState.messageId,
                progressContent: progressLimit.content as DBContentPart[],
                progressContentLimited: progressLimit.wasTruncated,
                progressContentOriginalTokens: progressLimit.originalTokens,
                progressContentFinalTokens: progressLimit.finalTokens,
                progressContentTruncatedParts: progressLimit.truncatedParts,
                startedAt: nowISO(),
              }
            );
          }
        }
      }
      : undefined;

    // Determine if we should inject context (system prompt + tools)
    // This reduces token usage by only sending these on first message and periodically thereafter
    const contextTracking = getContextInjectionTracking(sessionMetadata);
    const injectContext = shouldInjectContext(contextTracking, isNewSession, toolLoadingMode);
    console.log(`[CHAT API] Context injection: isNew=${isNewSession}, tracking=${JSON.stringify(contextTracking)}, inject=${injectContext}`);

    // ========================================================================
    // CONTEXT WINDOW MANAGEMENT - Pre-flight check before API call
    // ========================================================================
    // Get model ID and provider for context window lookups
    const currentModelId = getSessionModelId(sessionMetadata);
    const currentProvider = getSessionProvider(sessionMetadata);
    
    // Estimate system prompt length (will be refined after building actual prompt)
    const estimatedSystemPromptLength = 5000; // Conservative estimate
    
    // Run pre-flight context window check
    const contextCheck = await ContextWindowManager.preFlightCheck(
      sessionId,
      currentModelId,
      estimatedSystemPromptLength,
      currentProvider
    );
    
    // If context window is exceeded and compaction failed, return error with recovery options
    if (!contextCheck.canProceed) {
      console.error(
        `[CHAT API] Context window check failed: ${contextCheck.error}`,
        contextCheck.status
      );
      
      return new Response(
        JSON.stringify({
          error: "Context window limit exceeded",
          details: ContextWindowManager.getStatusMessage(contextCheck.status),
          status: contextCheck.status.status,
          recovery: contextCheck.recovery,
          compactionResult: contextCheck.compactionResult
            ? {
                success: contextCheck.compactionResult.success,
                tokensFreed: contextCheck.compactionResult.tokensFreed,
                messagesCompacted: contextCheck.compactionResult.messagesCompacted,
              }
            : undefined,
        }),
        { 
          status: 413, // Payload Too Large
          headers: { "Content-Type": "application/json" } 
        }
      );
    }
    
    // Log context window status
    console.log(
      `[CHAT API] Context window status: ${contextCheck.status.status} ` +
      `(${contextCheck.status.formatted.current}/${contextCheck.status.formatted.max}, ` +
      `${contextCheck.status.formatted.percentage})`
    );
    
    // If compaction was performed, log the result
    if (contextCheck.compactionResult?.success) {
      console.log(
        `[CHAT API] Compaction completed: ${contextCheck.compactionResult.messagesCompacted} messages, ` +
        `${contextCheck.compactionResult.tokensFreed} tokens freed`
      );
    }

    // Create agent run for observability
    agentRun = await createAgentRun({
      sessionId,
      userId: dbUser.id,
      pipelineName: "chat",
      triggerType: isScheduledRun ? "cron" : isChannelSource ? "webhook" : "chat",
      metadata: {
        characterId: characterId || null,
        messageCount: messages.length,
        taskSource: taskSource || "chat",
      },
    });
    const chatAbortController = new AbortController();
    registerChatAbortController(agentRun.id, chatAbortController);

    const chatTask: ChatTask = {
      type: "chat",
      runId: agentRun.id,
      userId: dbUser.id,
      characterId: characterId ?? undefined,
      sessionId,
      status: "running",
      startedAt: nowISO(),
      pipelineName: "chat",
      triggerType: isScheduledRun ? "cron" : isChannelSource ? "webhook" : "chat",
      messageCount: messages.length,
      metadata:
        isScheduledRun || isChannelSource
          ? {
              ...(isScheduledRun
                ? {
                    scheduledRunId: scheduledRunId ?? undefined,
                    scheduledTaskId: scheduledTaskId ?? undefined,
                  }
                : {}),
              ...(isChannelSource
                ? {
                    suppressFromUI: true,
                    taskSource: "channel",
                  }
                : {}),
            }
          : undefined,
    };
    const existingTask = taskRegistry.get(agentRun.id);
    if (existingTask) {
      taskRegistry.updateStatus(agentRun.id, "running", chatTask);
    } else {
      taskRegistry.register(chatTask);
    }
    chatTaskRegistered = true;

    // Only save the NEW user message (the last one in the array)
    // Previous messages have already been saved in earlier requests
    // The assistant response will be saved in onFinish callback
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const lastMessage = messages[messages.length - 1];
    const userMessageCount = messages.filter((msg) => msg.role === "user").length;
    let savedUserMessageId: string | undefined;

    if (!isScheduledRun && lastMessage && lastMessage.role === 'user') {
      // Extract content using the helper (handles parts array from assistant-ui)
      // Don't convert to base64 for DB storage (keeps URLs compact)
      const extractedContent = await extractContent(lastMessage);

      // Normalize content to array format for JSONB storage
      let normalizedContent: unknown[];
      if (typeof extractedContent === "string") {
        normalizedContent = [{ type: "text", text: extractedContent }];
      } else if (Array.isArray(extractedContent)) {
        normalizedContent = extractedContent;
      } else {
        normalizedContent = [{ type: "text", text: "" }];
      }

      // Only use the message ID if it's a valid UUID, otherwise let DB generate one
      const isValidUUID = lastMessage.id && uuidRegex.test(lastMessage.id);

      // Allocate ordering index for bullet-proof message ordering
      const userMessageIndex = await nextOrderingIndex(sessionId);

      const result = await createMessage({
        ...(isValidUUID && { id: lastMessage.id }),
        sessionId,
        role: 'user',
        content: normalizedContent,
        orderingIndex: userMessageIndex,
        metadata: {},
      });

      savedUserMessageId = result?.id;
      console.log(`[CHAT API] Saved new user message: ${lastMessage.id} -> ${savedUserMessageId || 'SKIPPED (conflict)'}`);

      const plainTextContent = getPlainTextFromContent(extractedContent);
      const shouldAutoNameSession = (isNewSession || userMessageCount === 1) && plainTextContent.length > 0;

      if (shouldAutoNameSession) {
        void generateSessionTitle(sessionId, plainTextContent);
      }
    }

    // ==========================================================================
    // HYBRID APPROACH: Use frontend messages enhanced with DB tool results
    // ==========================================================================
    //
    // WHY: The old approach loaded all messages from DB, then tried to filter
    // by frontend IDs. This failed because:
    // - Frontend uses runtime-generated IDs (e.g., "ugcMV6iZqVklzR4b")
    // - Database uses UUIDs (e.g., "c4fef2b7-9d87-4a49-9273-6a335acd08cb")
    // - These NEVER match, so filtering never worked
    //
    // NEW APPROACH:
    // 1. Use frontend messages directly (they have correct structure after edits)
    // 2. Enhance with tool results from DB (which frontend may lack)
    // 3. Convert to core format for AI
    //
    // This correctly handles message editing because the frontend has the
    // truncated conversation state with the edited content.
    // ==========================================================================

    console.log(`[CHAT API] Using HYBRID approach: ${messages.length} frontend messages`);

    const refetchTools: Record<string, Tool> = {
      sendMessageToChannel: createSendMessageToChannelTool({
        sessionId,
        userId: dbUser.id,
        sessionMetadata
      }),
      readFile: createReadFileTool({
        sessionId,
        userId: dbUser.id,
        characterId: characterId || null,
      }),
      localGrep: createLocalGrepTool({
        sessionId,
        characterId: characterId || null,
      }),
      vectorSearch: createVectorSearchToolV2({
        sessionId,
        userId: dbUser.id,
        characterId: characterId || null,
      }),
      docsSearch: createDocsSearchTool({
        userId: dbUser.id,
        characterId: characterId || null,
      }),
      webSearch: createWebSearchTool({
        userId: dbUser.id,
        characterId: characterId || null,
      }),
      webBrowse: createWebBrowseTool({
        sessionId,
        userId: dbUser.id,
        characterId: characterId || null,
      }),
      webQuery: createWebQueryTool({
        sessionId,
        userId: dbUser.id,
        characterId: characterId || null,
      }),
      retrieveFullContent: createRetrieveFullContentTool({
        sessionId,
      }),
      createSkill: createCreateSkillTool({
        sessionId,
        userId: dbUser.id,
        characterId: characterId || "",
      }),
      listSkills: createListSkillsTool({
        userId: dbUser.id,
        characterId: characterId || "",
      }),
      runSkill: createRunSkillTool({
        sessionId,
        userId: dbUser.id,
        characterId: characterId || "",
      }),
      updateSkill: createUpdateSkillTool({
        userId: dbUser.id,
      }),
      copySkill: createCopySkillTool({
        userId: dbUser.id,
      }),
    };

    // Enhance frontend messages with tool results from database
    // This adds tool results to assistant messages that have tool-call parts
    const enhancedMessages = await enhanceFrontendMessagesWithToolResults(
      messages as FrontendMessage[],
      sessionId,
      {
        refetchTools,
        maxRefetch: MAX_TOOL_REFETCH,
      }
    );

    console.log(`[CHAT API] Enhanced ${enhancedMessages.length} messages with DB tool results`);

    const useToolSummaries = shouldUseToolSummaries(enhancedMessages, sessionSummary);
    if (useToolSummaries) {
      console.log(`[CHAT API] Tool summary mode enabled (context nearing limit)`);
    }

    // Convert to core format for the AI SDK
    // includeUrlHelpers=true so Claude gets URL text like [Image URL: /api/media/...] for tool calls
    // convertUserImagesToBase64=true - Send base64 images so Claude can actually SEE user uploads
    // (Without this, Claude hallucinates URLs when asked about images from channels like Telegram)
    // sessionId enables smart truncation - long content is truncated but full version is retrievable
    let coreMessages: ModelMessage[] = await Promise.all(
      enhancedMessages.map(async (msg, idx) => {
        const content = await extractContent(
          msg as Parameters<typeof extractContent>[0],
          true,   // includeUrlHelpers - Claude needs URL text for tool calls
          true,   // convertUserImagesToBase64 - send actual image data so Claude can see it
          sessionId,  // sessionId - enables smart truncation with full content retrieval
          useToolSummaries
        );
        // DEBUG: Log what we're sending to Claude (avoid logging full content to prevent log spam)
        console.log(`[CHAT API] Message ${idx} (${msg.role}):`, JSON.stringify({
          hasParts: !!(msg as { parts?: unknown[] }).parts,
          partsCount: (msg as { parts?: unknown[] }).parts?.length,
          partTypes: (msg as { parts?: Array<{ type: string }> }).parts?.map(p => p.type),
          contentType: typeof content === 'string' ? 'string' : 'array',
          contentLength: typeof content === 'string' ? content.length : (content as unknown[]).length,
        }, null, 2));
        return {
          role: msg.role as "user" | "assistant" | "system",
          content,
        } as ModelMessage;
      })
    );

    const isAntigravityClaudeModel =
      currentProvider === "antigravity" &&
      typeof currentModelId === "string" &&
      currentModelId.toLowerCase().includes("claude");

    if (isAntigravityClaudeModel) {
      coreMessages = sanitizeToolHistoryForAntigravityClaude(coreMessages);
    }

    // Split tool-result parts from assistant messages into role:"tool" messages
    // for native Claude/Anthropic providers. The AI SDK's Anthropic converter silently
    // drops regular tool-result parts from assistant messages, causing orphan tool_use errors.
    const isNativeClaudeProvider =
      !isAntigravityClaudeModel && (
        currentProvider === "claudecode" ||
        currentProvider === "anthropic" ||
        (typeof currentModelId === "string" && currentModelId.toLowerCase().includes("claude"))
      );

    if (isNativeClaudeProvider) {
      coreMessages = splitToolResultsFromAssistantMessages(coreMessages);
    }

    // Log coreMessages structure after all sanitization for debugging tool_use/tool_result pairing
    console.log(`[CHAT API] Final coreMessages (${coreMessages.length} messages) before streamText:`);
    coreMessages.forEach((msg, idx) => {
      if (typeof msg.content === 'string') {
        console.log(`  [${idx}] role=${msg.role}, content=string(${msg.content.length})`);
      } else if (Array.isArray(msg.content)) {
        const types = (msg.content as Array<{ type: string; toolCallId?: string }>).map(
          p => p.type + (p.toolCallId ? `:${p.toolCallId}` : '')
        );
        console.log(`  [${idx}] role=${msg.role}, parts=[${types.join(', ')}]`);
      }
    });

    // Validate tool call inputs before sending to AI SDK
    // This helps detect if any invalid tool calls made it through the converter
    coreMessages.forEach((msg, idx) => {
      if (Array.isArray(msg.content)) {
        msg.content.forEach((part: any, partIdx) => {
          if (part.type === 'tool-use' && part.input !== undefined) {
            // Validate that tool input is valid (not a string that should be parsed)
            if (typeof part.input === 'string') {
              try {
                JSON.parse(part.input);
                console.warn(
                  `[CHAT API] Tool input at message ${idx}, part ${partIdx} is a JSON string instead of object. ` +
                  `This may cause API errors. Tool: ${part.toolName}`
                );
              } catch (e) {
                console.error(
                  `[CHAT API] Invalid tool input at message ${idx}, part ${partIdx}: ` +
                  `Tool: ${part.toolName}, Input: ${part.input?.toString().substring(0, 100)}`
                );
              }
            }
          }
        });
      }
    });

    // Build system prompt and get character context for tools
    // NOTE: Tool instructions are now embedded in tool descriptions (fullInstructions)
    // and discovered via searchTools. No need to concatenate them to system prompt.
    //
    // Prompt caching: If enabled (Anthropic only), system prompt is built as cacheable blocks
    // with cache_control markers to reduce costs by 70-85% on multi-turn conversations.
    const useCaching = shouldUseCache();
    const cacheConfig = getCacheConfig();

    let systemPromptValue: string | CacheableSystemBlock[];
    let characterAvatarUrl: string | null = null;
    let characterAppearanceDescription: string | null = null;
    let enabledTools: string[] | undefined;

    if (characterId) {
      const character = await getCharacterFull(characterId);
      if (character && character.userId === dbUser.id) {
        let hydratedSkillSummaries: Array<{ id: string; name: string; description: string }> = [];

        // Extract enabled tools from character metadata
        const metadata = character.metadata as { enabledTools?: string[]; skills?: unknown[] } | null;
        enabledTools = metadata?.enabledTools;

        try {
          const skillSummaries = await getSkillsSummaryForPrompt(character.id);
          if (skillSummaries.length > 0) {
            hydratedSkillSummaries = skillSummaries.map((skill) => ({
              id: skill.id,
              name: skill.name,
              description: skill.description,
            }));
          }
        } catch (skillError) {
          console.warn("[CHAT API] Failed to hydrate skill summaries for prompt:", skillError);
        }

        // Build character-specific system prompt (includes shared blocks)
        const channelType = (sessionMetadata?.channelType as string | undefined) ?? null;
        systemPromptValue = useCaching
          ? buildCacheableCharacterPrompt(character, {
              toolLoadingMode,
              channelType,
              enableCaching: true,
              cacheTtl: cacheConfig.defaultTtl,
              skillSummaries: hydratedSkillSummaries,
            })
          : buildCharacterSystemPrompt(character, {
              toolLoadingMode,
              channelType,
              skillSummaries: hydratedSkillSummaries,
            });

        // Get character avatar and appearance for tool context
        characterAvatarUrl = getCharacterAvatarUrl(character);
        characterAppearanceDescription = character.tagline || null;


        console.log(`[CHAT API] Using character: ${character.name} (${characterId}), avatar: ${characterAvatarUrl || "none"}, enabledTools: ${enabledTools?.join(", ") || "all"}`);
      } else {
        // Character not found or doesn't belong to user, use default
        systemPromptValue = useCaching
          ? buildDefaultCacheableSystemPrompt({
              includeToolDiscovery: hasStylyApiKey(),
              toolLoadingMode,
              enableCaching: true,
              cacheTtl: cacheConfig.defaultTtl,
            })
          : getSystemPrompt({
              stylyApiEnabled: hasStylyApiKey(),
              toolLoadingMode,
            });
        console.log(`[CHAT API] Character not found or unauthorized, using default prompt`);
      }
    } else {
      // No character specified, use default professional agent prompt
      systemPromptValue = useCaching
        ? buildDefaultCacheableSystemPrompt({
            includeToolDiscovery: hasStylyApiKey(),
            toolLoadingMode,
            enableCaching: true,
            cacheTtl: cacheConfig.defaultTtl,
          })
        : getSystemPrompt({
            stylyApiEnabled: hasStylyApiKey(),
            toolLoadingMode,
          });
    }

    // Create tools via the centralized Tool Registry
    // We load ALL tools (including deferred ones) but use activeTools to control visibility
    const registry = ToolRegistry.getInstance();

    // CRITICAL: Create agentEnabledTools Set for strict filtering
    // If the agent has specific tools selected, ONLY those tools (plus core utilities) will be loaded
    // Deduplicate the array to prevent duplicates in logs
    const agentEnabledTools = enabledTools
      ? new Set(Array.from(new Set(enabledTools))) // Dedupe before creating Set
      : undefined;


    // First, get non-deferred tools to build the initial active set
    // CRITICAL: We do NOT pass includeTools: enabledTools here!
    // Doing so would force all agent-enabled tools to be active from step 0,
    // defeating the purpose of deferred loading and token savings.
    // 'agentEnabledTools' filter still ensures only authorized tools are candidates.
    const nonDeferredTools = registry.getTools({
      sessionId,
      userId: dbUser.id,
      characterId: characterId || undefined,
      characterAvatarUrl: characterAvatarUrl || undefined,
      characterAppearanceDescription: characterAppearanceDescription || undefined,
      includeDeferredTools: false, // Only non-deferred tools for initial active set
      agentEnabledTools, // Filter by authorized tools
    });
    const initialActiveTools = new Set(Object.keys(nonDeferredTools));

    // CRITICAL FIX: Initialize with tools discovered in PREVIOUS requests.
    // We use both session metadata (fast) and message history (robust ground truth).
    const historicallyDiscoveredTools = getDiscoveredToolsFromMessages(enhancedMessages);
    const metadataDiscoveredTools = getDiscoveredToolsFromMetadata(sessionMetadata);
    const previouslyDiscoveredTools = new Set([
      ...historicallyDiscoveredTools,
      ...metadataDiscoveredTools
    ]);

    // Check user preference for tool loading mode
    const useDeferredLoading = appSettings.toolLoadingMode !== "always";

    // Load tools needed for this request:
    // - Non-deferred (alwaysLoad) tools: searchTools, listAllTools, retrieveFullContent, describeImage
    // - Previously discovered tools (from session metadata)
    // - If toolLoadingMode="always": all agent-enabled tools load upfront
    // - If toolLoadingMode="deferred": agent-enabled tools require discovery via searchTools
    //
    // CRITICAL: We always set includeDeferredTools: true here so that all AUTHORIZED tools
    // are present in the 'tools' implementation map. Their visibility to the AI is 
    // strictly controlled by 'activeTools'. This ensures discovered tools have schemas.
    const allTools = registry.getTools({
      sessionId,
      userId: dbUser.id,
      characterId: characterId || undefined,
      characterAvatarUrl: characterAvatarUrl || undefined,
      characterAppearanceDescription: characterAppearanceDescription || undefined,
      // agentEnabledTools filter handles which tools can actually be used
      agentEnabledTools,
      // Always include authorized tools in implementation map for AI SDK consistency
      includeDeferredTools: true,
    });

    // Mutable set to track tools discovered via searchTools during this request
    // When searchTools finds a deferred tool, it adds it here
    // The prepareStep callback reads this to dynamically enable discovered tools
    // NOTE: previouslyDiscoveredTools was already loaded above for includeTools
    const discoveredTools = new Set<string>(previouslyDiscoveredTools);

    if (previouslyDiscoveredTools.size > 0) {
      console.log(`[CHAT API] Restored ${previouslyDiscoveredTools.size} previously discovered tools: ${[...previouslyDiscoveredTools].join(", ")}`);
    }


    // Context for search/list tools
    // CRITICAL: Pass enabledTools to filter search results by agent-specific permissions
    const toolSearchContext = {
      initialActiveTools,
      discoveredTools,
      enabledTools: enabledTools ? new Set(enabledTools) : undefined,
    };

    // Build tools object with context-aware overrides
    // CRITICAL: Only add overrides for tools that were already loaded via registry
    // This ensures deferred loading is respected - we don't add tools that should be discovered
    const tools: Record<string, Tool> = {
      ...allTools,
      ...(allTools.sendMessageToChannel && {
        sendMessageToChannel: createSendMessageToChannelTool({
          sessionId,
          userId: dbUser.id,
          sessionMetadata
        }),
      }),
      // searchTools and listAllTools ALWAYS override (they're alwaysLoad: true)
      searchTools: createToolSearchTool(toolSearchContext),
      listAllTools: createListToolsTool(toolSearchContext),
      // retrieveFullContent ALWAYS overrides (alwaysLoad: true)
      retrieveFullContent: createRetrieveFullContentTool({
        sessionId,
      }),
      // Context-aware overrides: ONLY add if the tool was loaded in allTools
      // This respects deferred loading - tools must be discovered first
      ...(allTools.docsSearch && {
        docsSearch: createDocsSearchTool({
          userId: dbUser.id,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.vectorSearch && {
        vectorSearch: createVectorSearchToolV2({
          sessionId,
          userId: dbUser.id,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.readFile && {
        readFile: createReadFileTool({
          sessionId,
          userId: dbUser.id,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.localGrep && {
        localGrep: createLocalGrepTool({
          sessionId,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.webSearch && {
        webSearch: createWebSearchTool({
          userId: dbUser.id,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.webBrowse && {
        webBrowse: createWebBrowseTool({
          sessionId,
          userId: dbUser.id,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.webQuery && {
        webQuery: createWebQueryTool({
          sessionId,
          userId: dbUser.id,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.executeCommand && {
        executeCommand: createExecuteCommandTool({
          sessionId,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.editFile && {
        editFile: createEditFileTool({
          sessionId,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.writeFile && {
        writeFile: createWriteFileTool({
          sessionId,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.patchFile && {
        patchFile: createPatchFileTool({
          sessionId,
          characterId: characterId || null,
        }),
      }),
      ...(allTools.updatePlan && {
        updatePlan: createUpdatePlanTool({ sessionId }),
      }),
      ...(allTools.createSkill && {
        createSkill: createCreateSkillTool({
          sessionId,
          userId: dbUser.id,
          characterId: characterId || "",
        }),
      }),
      ...(allTools.listSkills && {
        listSkills: createListSkillsTool({
          userId: dbUser.id,
          characterId: characterId || "",
        }),
      }),
      ...(allTools.runSkill && {
        runSkill: createRunSkillTool({
          sessionId,
          userId: dbUser.id,
          characterId: characterId || "",
        }),
      }),
      ...(allTools.updateSkill && {
        updateSkill: createUpdateSkillTool({
          userId: dbUser.id,
        }),
      }),
      ...(allTools.copySkill && {
        copySkill: createCopySkillTool({
          userId: dbUser.id,
        }),
      }),
    };

    // Load MCP tools for this character (if configured)
    let mcpToolResult: { allTools: Record<string, Tool>; alwaysLoadToolIds: string[]; deferredToolIds: string[] } = {
      allTools: {},
      alwaysLoadToolIds: [],
      deferredToolIds: [],
    };

    try {
      const { loadMCPToolsForCharacter } = await import("@/lib/mcp/chat-integration");
      const character = characterId ? await getCharacterFull(characterId) : undefined;
      mcpToolResult = await loadMCPToolsForCharacter(character || undefined);

      if (Object.keys(mcpToolResult.allTools).length > 0) {
        console.log(`[CHAT API] Loaded ${Object.keys(mcpToolResult.allTools).length} MCP tools: ${Object.keys(mcpToolResult.allTools).join(", ")}`);
        console.log(`[CHAT API] MCP always-load: ${mcpToolResult.alwaysLoadToolIds.join(", ") || "none"}`);
        console.log(`[CHAT API] MCP deferred: ${mcpToolResult.deferredToolIds.join(", ") || "none"}`);

        // CRITICAL: Ensure MCP tools are strictly allowed in searchTools and listAllTools
        // If enabledTools is configured (agent has specific tool list), we MUST add MCP tools to it
        // otherwise they will be hidden from discovery.
        if (toolSearchContext.enabledTools) {
          Object.keys(mcpToolResult.allTools).forEach(name => toolSearchContext.enabledTools!.add(name));
          console.log(`[CHAT API] Added ${Object.keys(mcpToolResult.allTools).length} MCP tools to enabledTools set for discovery`);
        }
      }
    } catch (error) {
      console.error("[CHAT API] Failed to load MCP tools:", error);
    }

    let customComfyUIToolResult: { allTools: Record<string, Tool>; alwaysLoadToolIds: string[]; deferredToolIds: string[] } = {
      allTools: {},
      alwaysLoadToolIds: [],
      deferredToolIds: [],
    };

    try {
      const { loadCustomComfyUITools } = await import("@/lib/comfyui/custom/chat-integration");
      customComfyUIToolResult = await loadCustomComfyUITools(sessionId);

      if (Object.keys(customComfyUIToolResult.allTools).length > 0) {
        console.log(`[CHAT API] Loaded ${Object.keys(customComfyUIToolResult.allTools).length} Custom ComfyUI tools.`);

        if (toolSearchContext.enabledTools) {
          Object.keys(customComfyUIToolResult.allTools).forEach(name => toolSearchContext.enabledTools!.add(name));
          console.log(`[CHAT API] Added ${Object.keys(customComfyUIToolResult.allTools).length} Custom ComfyUI tools to enabledTools set for discovery`);
        }
      }
    } catch (error) {
      console.error("[CHAT API] Failed to load Custom ComfyUI tools:", error);
    }

    // Merge MCP + Custom ComfyUI tools with regular tools
    const allToolsWithMCP = {
      ...tools,
      ...mcpToolResult.allTools,
      ...customComfyUIToolResult.allTools,
    };


    // Build the initial activeTools array (tool names that are active from the start)
    // When toolLoadingMode="always", ALL tools are active from step 0 (no discovery needed)
    // When toolLoadingMode="deferred", only non-deferred + previously discovered tools are active
    // UPDATED: Include MCP alwaysLoad tools in initialActiveTools
    const initialActiveToolNames = useDeferredLoading
      ? [
        ...new Set([
          ...initialActiveTools,
          ...previouslyDiscoveredTools,
          ...mcpToolResult.alwaysLoadToolIds,  // NEW: MCP tools with alwaysLoad
          ...customComfyUIToolResult.alwaysLoadToolIds,
        ])
      ]
      : Object.keys(allToolsWithMCP); // "Always Include" mode: all tools active immediately

    console.log(`[CHAT API] Loaded ${Object.keys(allToolsWithMCP).length} tools (including ${Object.keys(mcpToolResult.allTools).length} MCP tools and ${Object.keys(customComfyUIToolResult.allTools).length} Custom ComfyUI tools)`);
    console.log(`[CHAT API] Tool loading mode: ${useDeferredLoading ? "deferred" : "always-include"}, initial active tools: ${initialActiveToolNames.length}`);
    if (useDeferredLoading) {
      console.log(`[CHAT API] Previously discovered (restored): ${previouslyDiscoveredTools.size > 0 ? [...previouslyDiscoveredTools].join(", ") : "none"}`);
    }

    // Apply caching to message history
    // Strategy: Cache all messages except the last 2 (leave recent user/assistant exchange uncached)
    const cachedMessages = useCaching
      ? applyCacheToMessages(coreMessages, {
          uncachedRecentCount: 2,
          minHistorySize: 5,
          cacheTtl: cacheConfig.defaultTtl,
        })
      : coreMessages;

    // Log cache savings estimate (if caching enabled and context injected)
    let estimatedSavings = { totalCacheableTokens: 0, estimatedSavings: 0 };
    if (useCaching && injectContext) {
      estimatedSavings = estimateCacheSavings(
        Array.isArray(systemPromptValue) ? systemPromptValue : [],
        cachedMessages
      );
      console.log(
        `[CACHE] Estimated savings: ${estimatedSavings.totalCacheableTokens} tokens cacheable, ` +
        `~$${estimatedSavings.estimatedSavings.toFixed(4)} saved per hit`
      );
    }

    // Stream the response using the configured provider
    // Wrap with run context for observability (tool events will be linked to this run)
    // System prompt is conditionally included to reduce token usage (first message + periodic re-injection)
    // NOTE: Tools MUST always be passed - unlike system prompt, tools are function definitions
    // that must be present for the AI to actually invoke them. Without tools, AI just outputs fake tool calls.
    const provider = getConfiguredProvider();
    const cachingStatus = useCaching
      ? `enabled (${cacheConfig.defaultTtl} TTL)${provider === "openrouter" ? " - OpenRouter multi-provider" : ""}`
      : "disabled";

    console.log(
      `[CHAT API] Using LLM: ${getProviderDisplayName()}, ` +
      `system prompt injected: ${injectContext}, ` +
      `caching: ${cachingStatus}`
    );
    let runFinalized = false;
    const finalizeFailedRun = async (errorMessage: string, isCreditError: boolean) => {
      if (runFinalized) return;
      runFinalized = true;
      if (chatTaskRegistered && agentRun?.id) {
        try {
          removeChatAbortController(agentRun.id);
          await completeAgentRun(agentRun.id, "failed", {
            error: isCreditError ? "Insufficient credits" : errorMessage,
          });
          const registryTask = taskRegistry.get(agentRun.id);
          const registryDurationMs = registryTask
            ? Date.now() - new Date(registryTask.startedAt).getTime()
            : undefined;
          taskRegistry.updateStatus(agentRun.id, "failed", {
            durationMs: registryDurationMs,
            error: isCreditError ? "Task interrupted - insufficient credits" : errorMessage,
          });
        } catch (failureError) {
          console.error("[CHAT API] Failed to mark agent run as failed:", failureError);
        }
      }
    };
    const runId = agentRun?.id;
    if (!runId) {
      throw new Error("Agent run unavailable for chat stream");
    }
    const streamAbortSignal = combineAbortSignals([req.signal, chatAbortController.signal]);
    const createStreamResult = async () =>
      withRunContext(
        {
          runId,
          sessionId,
          pipelineName: "chat",
          characterId: characterId || undefined,
        },
        async () => streamText({
        // Use session-level model override if present, otherwise fall back to global
        model: resolveSessionLanguageModel(sessionMetadata),
        // Conditionally include system prompt to reduce token usage
        // It's sent on first message, then periodically based on token/message thresholds
        // Use cacheable blocks if caching is enabled (Anthropic only)
        ...(injectContext && { system: systemPromptValue }),
        messages: cachedMessages,
        // Tools MUST always be passed - they are function definitions required for actual invocation
        tools: allToolsWithMCP,
        // Use activeTools to control which tools are visible to the model
        // Initially: non-deferred tools + previously discovered tools from session metadata
        activeTools: initialActiveToolNames as (keyof typeof allToolsWithMCP)[],
        abortSignal: streamAbortSignal,
        stopWhen: stepCountIs(AI_CONFIG.maxSteps),
        // Use slightly lower temperature when tools are available to reduce
        // "fake tool call" issues where model outputs tool syntax as text
        // Tool operations benefit from more deterministic behavior
        // Note: getProviderTemperature() handles provider-specific requirements (e.g., Kimi requires temp=1)
        temperature: getProviderTemperature(initialActiveToolNames.length > 0 ? AI_CONFIG.toolTemperature : AI_CONFIG.temperature),
        // Tool choice: "auto" allows model to decide between tools and text
        // Could be set to "required" to force tool use, but "auto" is more flexible
        toolChoice: AI_CONFIG.toolChoice,
        // prepareStep is called before each step - we use it to dynamically enable discovered tools
        //
        // CRITICAL FIX for timing gap bug:
        // Tools discovered via searchTools in step N should be available in step N+1.
        // We ensure consistency by ALWAYS combining:
        // 1. initialActiveTools (non-deferred, always-load tools)
        // 2. previouslyDiscoveredTools (tools from previous requests, restored from session)
        // 3. discoveredTools (tools discovered in THIS request, includes previouslyDiscoveredTools)
        //
        // The discoveredTools Set is initialized with previouslyDiscoveredTools, so spreading it
        // is sufficient to include both. But we explicitly deduplicate for safety.
        prepareStep: async ({ stepNumber }) => {
          // Build the active tools list by combining all sources
          // Use a Set to deduplicate in case tools appear in multiple sources
          let activeToolSet: Set<string>;

          if (useDeferredLoading) {
            // Deferred mode: start with core + restored + newly discovered in this request
            activeToolSet = new Set<string>([
              ...initialActiveTools,          // Non-deferred, always-load tools
              ...previouslyDiscoveredTools,   // Tools from previous requests (session metadata)
              ...discoveredTools,             // Tools discovered in this request (may overlap with previous)
            ]);
          } else {
            // "Always Include" mode: ALL available tools should be active from step 0
            activeToolSet = new Set<string>(Object.keys(allToolsWithMCP));
          }

          // Dynamically inject retrieveFullContent if session has truncated content
          // This prevents agent from misusing the tool when no truncation has occurred
          if (sessionHasTruncatedContent(sessionId) && !activeToolSet.has("retrieveFullContent")) {
            activeToolSet.add("retrieveFullContent");
          }

          const currentActiveTools = [...activeToolSet];

          // Log only when tools change (for debugging)
          if (stepNumber === 0) {
            console.log(`[CHAT API] Step 0: Starting with ${currentActiveTools.length} active tools (mode: ${useDeferredLoading ? "deferred" : "always-include"})`);
          } else if (useDeferredLoading && discoveredTools.size > previouslyDiscoveredTools.size) {
            // New tools were discovered in a previous step (only relevant in deferred mode)
            const newlyDiscovered = [...discoveredTools].filter(t => !previouslyDiscoveredTools.has(t));
            if (newlyDiscovered.length > 0) {
              console.log(`[CHAT API] Step ${stepNumber}: Active tools now include newly discovered: ${newlyDiscovered.join(", ")}`);
            }
          }

          return {
            activeTools: currentActiveTools as (keyof typeof tools)[],
          };
        },
        onError: async ({ error }) => {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          const errorMessageLower = errorMessage.toLowerCase();
          const isCreditError =
            errorMessageLower.includes("insufficient") ||
            errorMessageLower.includes("quota") ||
            errorMessageLower.includes("credit") ||
            errorMessageLower.includes("429");
          await finalizeFailedRun(errorMessage, isCreditError);
        },
        onChunk: shouldEmitProgress
          ? async ({ chunk }) => {
            if (!streamingState || !syncStreamingMessage) {
              return;
            }

            let changed = false;

            if (chunk.type === "text-delta") {
              changed = appendTextPartToState(streamingState, chunk.text ?? "") || changed;
            } else if (chunk.type === "tool-input-start") {
              changed = recordToolInputStart(streamingState, chunk.id, chunk.toolName) || changed;
            } else if (chunk.type === "tool-input-delta") {
              changed = recordToolInputDelta(streamingState, chunk.id, chunk.delta) || changed;
            } else if (chunk.type === "tool-call") {
              changed = recordStructuredToolCall(streamingState, chunk.toolCallId, chunk.toolName, chunk.input) || changed;
            } else if (chunk.type === "tool-result") {
              changed = recordToolResultChunk(streamingState, chunk.toolCallId, chunk.toolName, chunk.output, chunk.preliminary) || changed;
            }

            if (changed) {
              await syncStreamingMessage();
            }
          }
          : undefined,
        onFinish: async ({ text, steps, usage, providerMetadata }) => {
          if (runFinalized) return;
          runFinalized = true;
          if (agentRun?.id) {
            removeChatAbortController(agentRun.id);
          }
          // Finalize any tool calls that were streamed via deltas (OpenAI format)
          if (streamingState) {
            finalizeStreamingToolCalls(streamingState);
          }
          if (streamingState && syncStreamingMessage) {
            await syncStreamingMessage(true);
          }
          // Save assistant message to database
          // Build content by iterating through steps in order to preserve
          // the interleaved sequence: tool-call → tool-result → text per step
          const content: Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; args?: unknown; result?: unknown; status?: string; timestamp?: string; state?: string }> = [];
          const toolCallMetadata = new Map<string, { toolName: string; input?: unknown }>();
          // Separate dedup sets: tool-calls and tool-results naturally share the same
          // toolCallId (a result references its call). Using a single shared set caused
          // all tool-results to be dropped because the call was already recorded.
          const seenToolCalls = new Set<string>();
          const seenToolResults = new Set<string>();

          if (steps && steps.length > 0) {
            for (const step of steps) {
              // Add tool calls from this step (if any)
              if (step.toolCalls) {
                for (const call of step.toolCalls) {
                  const normalizedInput = normalizeToolCallInput(
                    call.input,
                    call.toolName,
                    call.toolCallId
                  );
                  if (!normalizedInput) {
                    continue;
                  }
                  if (seenToolCalls.has(call.toolCallId)) {
                    continue;
                  }
                  seenToolCalls.add(call.toolCallId);
                  content.push({
                    type: "tool-call",
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                    args: normalizedInput,
                  });
                  toolCallMetadata.set(call.toolCallId, {
                    toolName: call.toolName,
                    input: normalizedInput,
                  });
                }
              }

              // Add tool results from this step (if any)
              if (step.toolResults) {
                for (const res of step.toolResults) {
                  const meta = toolCallMetadata.get(res.toolCallId);
                  const toolName = (res as { toolName?: string }).toolName || meta?.toolName || "tool";
                  const normalized = normalizeToolResultOutput(toolName, res.output, meta?.input);
                  const status = normalized.status.toLowerCase();
                  const state =
                    status === "error" || status === "failed"
                      ? "output-error"
                      : "output-available";
                  if (seenToolResults.has(res.toolCallId)) {
                    continue;
                  }
                  seenToolResults.add(res.toolCallId);
                  content.push({
                    type: "tool-result",
                    toolCallId: res.toolCallId,
                    toolName,
                    result: normalized.output,
                    status: normalized.status,
                    timestamp: new Date().toISOString(),
                    state,
                  });
                }
              }

              // Add text from this step (if any and non-empty)
              // Strip fake tool call JSON to prevent feedback loop
              if (step.text?.trim()) {
                const cleanedStepText = stripFakeToolCallJson(step.text);
                if (cleanedStepText.trim()) {
                  content.push({ type: "text", text: cleanedStepText });
                }
              }
            }
          }

          // Fallback: if no steps but we have final text, add it
          // (this handles simple responses without tool calls)
          if (content.length === 0 && text?.trim()) {
            const cleanedFallbackText = stripFakeToolCallJson(text);
            if (cleanedFallbackText.trim()) {
              content.push({ type: "text", text: cleanedFallbackText });
            }
          }

          // DEFENSIVE CHECK: Detect "fake tool calls" where model outputs tool syntax as text
          // This helps monitor for cases where the model attempts to call a tool but outputs
          // the invocation as plain text instead of using structured tool calls.
          // Pattern 1: toolName{"param": "value"} or toolName{ ... }
          // Pattern 2: {"type":"tool-call",...} or {"type":"tool-result",...} JSON protocol format
          const fakeToolCallPattern = /\b([a-zA-Z][a-zA-Z0-9]*)\s*\{[\s\S]*?"[^"]+"\s*:/;
          const fakeToolJsonPattern = /\{"type"\s*:\s*"tool-(call|result)"/;
          for (const step of steps || []) {
            if (step.text) {
              const hasFakeToolCall = fakeToolCallPattern.test(step.text);
              const hasFakeToolJson = fakeToolJsonPattern.test(step.text);
              if (hasFakeToolCall || hasFakeToolJson) {
                const format = hasFakeToolJson ? 'JSON protocol format' : 'toolName{} format';
                const textSnippet = step.text.substring(0, 200).replace(/\n/g, " ");
                console.warn(
                  `[CHAT API] FAKE TOOL CALL DETECTED (${format}): ` +
                  `Model output tool-like syntax as text. Text: "${textSnippet}..."`
                );
                console.warn(
                  `[CHAT API] Fake tool call context: ` +
                  `activeTools at start: ${initialActiveToolNames.length}, ` +
                  `discoveredTools: ${discoveredTools.size}, ` +
                  `previouslyDiscovered: ${previouslyDiscoveredTools.size}`
                );
              }
            }
          }

          let finalMessageId: string | undefined;
          // AI SDK v6: Cache metrics sources (in priority order):
          // 1. providerMetadata.anthropic.cacheCreationInputTokens (only creation, not read)
          // 2. providerMetadata.anthropic.usage (raw usage object with both fields)
          // 3. usage.raw (raw API response usage)
          // 4. usage.inputTokenDetails (SDK-parsed cache details)
          const anthropicMeta = (providerMetadata as any)?.anthropic || {};
          const rawUsage = anthropicMeta.usage || (usage as any)?.raw || {};
          const cacheCreation = useCaching ? (
            anthropicMeta.cacheCreationInputTokens ||
            rawUsage.cache_creation_input_tokens ||
            (usage as any)?.inputTokenDetails?.cacheWriteTokens ||
            0
          ) : 0;
          const cacheRead = useCaching ? (
            rawUsage.cache_read_input_tokens ||
            (usage as any)?.inputTokenDetails?.cacheReadTokens ||
            0
          ) : 0;
          const systemBlocksCached = useCaching && Array.isArray(systemPromptValue)
            ? systemPromptValue.filter((block) => block.providerOptions?.anthropic?.cacheControl).length
            : 0;
          const messagesCached = useCaching && cachedMessages.length > 0
            ? (() => {
              const cacheMarkerIndex = cachedMessages.findIndex(
                (msg) => (msg as any).providerOptions?.anthropic?.cacheControl
              );
              return cacheMarkerIndex > 0 ? cacheMarkerIndex : 0;
            })()
            : 0;
          const basePricePerToken = 3 / 1_000_000; // $3 per million for Sonnet 4.5 input tokens
          const estimatedSavingsUsd = cacheRead > 0 ? 0.9 * basePricePerToken * cacheRead : 0;
          const cacheMetrics = useCaching && usage
            ? {
              cacheReadTokens: cacheRead,
              cacheWriteTokens: cacheCreation,
              estimatedSavingsUsd,
              systemBlocksCached,
              messagesCached,
            }
            : undefined;
          const messageMetadata = usage
            ? {
              usage: {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
              },
              ...(cacheMetrics ? { cache: cacheMetrics } : {}),
            }
            : {};

          if (shouldEmitProgress && streamingState?.messageId) {
            const updated = await updateMessage(streamingState.messageId, {
              content,
              model: AI_CONFIG.model,
              tokenCount: usage?.totalTokens,
              metadata: messageMetadata,
            });
            finalMessageId = updated?.id ?? streamingState.messageId;
            console.log(
              `[CHAT API] Final message updated with ${content.filter(p => p.type === 'tool-call').length} tool calls, ` +
              `${content.filter(p => p.type === 'tool-result').length} tool results`
            );
          } else {
            // Allocate ordering index for final assistant message
            const assistantMessageIndex = await nextOrderingIndex(sessionId);

            const created = await createMessage({
              sessionId,
              role: "assistant",
              content: content,  // Always store as array for consistency
              orderingIndex: assistantMessageIndex,
              model: AI_CONFIG.model,
              tokenCount: usage?.totalTokens,
              metadata: messageMetadata,
            });
            finalMessageId = created?.id;
            console.log(
              `[CHAT API] Final message created with ${content.filter(p => p.type === 'tool-call').length} tool calls, ` +
              `${content.filter(p => p.type === 'tool-result').length} tool results`
            );
          }

          if (finalMessageId) {
            try {
              await deliverChannelReply({
                sessionId,
                messageId: finalMessageId,
                content: content as DBContentPart[],
                sessionMetadata,
              });
            } catch (error) {
              console.error("[CHAT API] Channel delivery error:", error);
            }
          }

          // Trigger memory extraction in background (only for character-specific chats)
          if (characterId) {
            triggerExtraction(characterId, sessionId).catch((err) => {
              console.error("[CHAT API] Memory extraction error:", err);
            });
          }

          // Complete the agent run with success
          if (agentRun) {
            await completeAgentRun(agentRun.id, "succeeded", {
              stepCount: steps?.length || 0,
              toolCallCount: steps?.reduce((acc, s) => acc + (s.toolCalls?.length || 0), 0) || 0,
              usage: usage ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
              } : undefined,
              ...(cacheMetrics ? { cache: cacheMetrics } : {}),
            });
            const registryTask = taskRegistry.get(agentRun.id);
            const registryDurationMs = registryTask
              ? Date.now() - new Date(registryTask.startedAt).getTime()
              : undefined;
            taskRegistry.updateStatus(agentRun.id, "succeeded", {
              durationMs: registryDurationMs,
            });
          }

          // Log cache performance metrics (if caching enabled)
          if (useCaching && usage) {
            if (cacheCreation > 0 || cacheRead > 0) {
              console.log(
                `[CACHE] Performance: ${cacheRead} tokens read (hits), ` +
                `${cacheCreation} tokens written (new cache), ` +
                `${systemBlocksCached} system blocks cached, ` +
                `${messagesCached} messages cached`
              );

              if (cacheRead > 0) {
                console.log(`[CACHE] Cost savings: ~$${estimatedSavingsUsd.toFixed(4)} (90% discount on ${cacheRead} tokens)`);
              }
            } else if (systemBlocksCached > 0 || messagesCached > 0) {
              // Cache markers were applied but no cache metrics returned - debug log
              console.log(
                `[CACHE] Debug: Cache markers applied (${systemBlocksCached} system blocks, ${messagesCached} messages) ` +
                `but no cache metrics returned. Provider metadata: ${JSON.stringify(anthropicMeta)}`
              );
            }
          }

          // Update context injection tracking in session metadata
          // If we injected context (system prompt + tools), reset the counters
          // Otherwise, increment them based on this request's usage
          const tokensUsedThisRequest = usage?.totalTokens || 0;
          let newTracking: ContextInjectionTrackingMetadata;

          if (injectContext) {
            // Reset counters after context injection
            newTracking = {
              tokensSinceLastInjection: tokensUsedThisRequest,
              messagesSinceLastInjection: 1, // Count this message
              lastInjectedAt: new Date().toISOString(),
              toolLoadingMode,
            };
          } else {
            // Increment existing counters
            const currentTracking = contextTracking || {
              tokensSinceLastInjection: 0,
              messagesSinceLastInjection: 0,
            };
            newTracking = {
              tokensSinceLastInjection: currentTracking.tokensSinceLastInjection + tokensUsedThisRequest,
              messagesSinceLastInjection: currentTracking.messagesSinceLastInjection + 1,
              lastInjectedAt: currentTracking.lastInjectedAt,
              toolLoadingMode: currentTracking.toolLoadingMode ?? toolLoadingMode,
            };
          }

          // Persist newly discovered tools to session metadata
          // This ensures tools discovered via searchTools remain active in subsequent requests
          let discoveredToolsMetadata: DiscoveredToolsMetadata | undefined;
          if (discoveredTools.size > 0) {
            discoveredToolsMetadata = {
              toolNames: [...discoveredTools],
              lastUpdatedAt: new Date().toISOString(),
            };
          }

          // Update session metadata with tracking and discovered tools
          const updatedSession = await updateSession(sessionId, {
            metadata: {
              ...sessionMetadata,
              contextInjectionTracking: newTracking,
              ...(discoveredToolsMetadata && { discoveredTools: discoveredToolsMetadata }),
            },
          });

          console.log(`[CHAT API] session metadata updated: ${!!updatedSession}`);
          if (updatedSession) {
            const updatedMeta = updatedSession.metadata as Record<string, any>;
            console.log(`[CHAT API] updated metadata keys: ${Object.keys(updatedMeta).join(", ")}`);
            console.log(`[CHAT API] updated discoveredTools: ${JSON.stringify(updatedMeta.discoveredTools)}`);
          }

        },
        onAbort: async ({ steps }) => {
          if (runFinalized) return;
          runFinalized = true;
          if (agentRun?.id) {
            removeChatAbortController(agentRun.id);
          }
          try {
            const interruptionTimestamp = new Date();
            if (streamingState && syncStreamingMessage) {
              await syncStreamingMessage(true);
            }

            // === SAVE PARTIAL ASSISTANT MESSAGE (FIX) ===
            // Build content from completed steps using the same logic as onFinish
            // This preserves the partial response so AI has context on subsequent messages
            const content: Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; args?: unknown; result?: unknown; status?: string; timestamp?: string; state?: string }> = [];
            const toolCallMetadata = new Map<string, { toolName: string; input?: unknown }>();
            // Separate dedup sets (same fix as onFinish path above)
            const seenPartialToolCalls = new Set<string>();
            const seenPartialToolResults = new Set<string>();

            if (steps && steps.length > 0) {
              for (const step of steps) {
                // Add tool calls from this step (if any)
                if (step.toolCalls) {
                  for (const call of step.toolCalls) {
                    if (seenPartialToolCalls.has(call.toolCallId)) {
                      continue;
                    }
                    seenPartialToolCalls.add(call.toolCallId);
                    content.push({
                      type: "tool-call",
                      toolCallId: call.toolCallId,
                      toolName: call.toolName,
                      args: call.input,
                    });
                    toolCallMetadata.set(call.toolCallId, {
                      toolName: call.toolName,
                      input: call.input,
                    });
                  }
                }

                // Add tool results from this step (if any)
                if (step.toolResults) {
                  for (const res of step.toolResults) {
                    if (seenPartialToolResults.has(res.toolCallId)) {
                      continue;
                    }
                    seenPartialToolResults.add(res.toolCallId);
                    const meta = toolCallMetadata.get(res.toolCallId);
                    const toolName = (res as { toolName?: string }).toolName || meta?.toolName || "tool";
                    const normalized = normalizeToolResultOutput(toolName, res.output, meta?.input);
                    const status = normalized.status.toLowerCase();
                    const state =
                      status === "error" || status === "failed"
                        ? "output-error"
                        : "output-available";
                    content.push({
                      type: "tool-result",
                      toolCallId: res.toolCallId,
                      toolName,
                      result: normalized.output,
                      status: normalized.status,
                      timestamp: new Date().toISOString(),
                      state,
                    });
                  }
                }

                // Add text from this step (if any and non-empty)
                // Strip fake tool call JSON to prevent feedback loop
                if (step.text?.trim()) {
                  const cleanedStepText = stripFakeToolCallJson(step.text);
                  if (cleanedStepText.trim()) {
                    content.push({ type: "text", text: cleanedStepText });
                  }
                }
              }
            }

            // Save partial assistant message IF there was any content generated
            if (content.length > 0) {
              if (shouldEmitProgress && streamingState?.messageId) {
                await updateMessage(streamingState.messageId, {
                  content,
                  metadata: { interrupted: true },
                });
              } else {
                // Allocate ordering index for partial assistant message
                const partialMessageIndex = await nextOrderingIndex(sessionId);

                await createMessage({
                  sessionId,
                  role: "assistant",
                  content: content,
                  orderingIndex: partialMessageIndex,
                  model: AI_CONFIG.model,
                  metadata: { interrupted: true }, // Mark as partial/interrupted response
                });
              }
              console.log(`[CHAT API] Saved partial assistant message (${content.length} parts) before interruption`);
            }
            // === END FIX ===

            // Save system interruption message (existing behavior)
            // Allocate ordering index for system interruption message
            const systemMessageIndex = await nextOrderingIndex(sessionId);

            await createMessage({
              sessionId,
              role: "system",
              content: [
                {
                  type: "text",
                  text: buildInterruptionMessage("chat", interruptionTimestamp),
                },
              ],
              orderingIndex: systemMessageIndex,
              metadata: buildInterruptionMetadata("chat", interruptionTimestamp),
            });

            if (agentRun) {
              await completeAgentRun(agentRun.id, "cancelled", {
                reason: "user_cancelled",
                stepCount: steps.length,
              });

              await appendRunEvent({
                runId: agentRun.id,
                eventType: "run_completed",
                level: "info",
                pipelineName: "chat",
                data: { status: "cancelled", reason: "user_cancelled", stepCount: steps.length },
              });
              const registryTask = taskRegistry.get(agentRun.id);
              const registryDurationMs = registryTask
                ? Date.now() - new Date(registryTask.startedAt).getTime()
                : undefined;
              taskRegistry.updateStatus(agentRun.id, "cancelled", {
                durationMs: registryDurationMs,
              });
            }
          } catch (error) {
            console.error("[CHAT API] Failed to record cancellation:", error);
          }
        },
        })
      );

    const STREAM_RECOVERY_MAX_ATTEMPTS = 3;
    let result: Awaited<ReturnType<typeof createStreamResult>>;
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await createStreamResult();
        if (attempt > 0) {
          await appendRunEvent({
            runId,
            eventType: "llm_request_completed",
            level: "info",
            pipelineName: "chat",
            data: {
              attempt,
              reason: "stream_recovered",
              outcome: "recovered",
            },
          });
        }
        break;
      } catch (error) {
        const classification = classifyRecoverability({
          provider,
          error,
          message: error instanceof Error ? error.message : String(error),
        });
        const retry = shouldRetry({
          classification,
          attempt,
          maxAttempts: STREAM_RECOVERY_MAX_ATTEMPTS,
          aborted: streamAbortSignal.aborted,
        });

        if (runId) {
          const delay = retry ? getBackoffDelayMs(attempt) : 0;
          await appendRunEvent({
            runId,
            eventType: "llm_request_failed",
            level: retry ? "info" : "warn",
            pipelineName: "chat",
            data: {
              attempt: attempt + 1,
              reason: classification.reason,
              recoverable: classification.recoverable,
              delayMs: delay,
              outcome: retry ? "retrying" : "exhausted",
            },
          });
        }

        if (!retry) {
          throw error;
        }

        const delay = getBackoffDelayMs(attempt);
        console.log("[CHAT API] Retrying stream creation", {
          attempt: attempt + 1,
          reason: classification.reason,
          delayMs: delay,
          provider,
        });
        await sleepWithAbort(delay, streamAbortSignal);
      }
    }

    // Return streaming response with session ID header
    // AI SDK v5: use toUIMessageStreamResponse for assistant-ui compatibility
    // messageMetadata extracts token usage from finish-step events to send to client
    const response = result.toUIMessageStreamResponse({
      consumeSseStream: ({ stream }) =>
        consumeStream({
          stream,
          onError: (error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorMessageLower = errorMessage.toLowerCase();
            const isCreditError =
              errorMessageLower.includes("insufficient") ||
              errorMessageLower.includes("quota") ||
              errorMessageLower.includes("credit") ||
              errorMessageLower.includes("429");
            void finalizeFailedRun(errorMessage, isCreditError);
          },
        }),
      onError: (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorMessageLower = errorMessage.toLowerCase();
        const isCreditError =
          errorMessageLower.includes("insufficient") ||
          errorMessageLower.includes("quota") ||
          errorMessageLower.includes("credit") ||
          errorMessageLower.includes("429");
        void finalizeFailedRun(errorMessage, isCreditError);
        return "Streaming interrupted. The run was marked accordingly.";
      },
      messageMetadata: ({ part }) => {
        // finish-step includes usage: LanguageModelUsage + providerMetadata
        if (part.type === 'finish-step' && part.usage) {
          // AI SDK v6: Cache metrics in providerMetadata.anthropic (camelCase)
          // Also check usage for snake_case fields as fallback
          const anthropicMeta = (part as any).providerMetadata?.anthropic || {};
          const cacheRead = anthropicMeta.cacheReadInputTokens ||
            (part.usage as any).cache_read_input_tokens || 0;
          const cacheWrite = anthropicMeta.cacheCreationInputTokens ||
            (part.usage as any).cache_creation_input_tokens || 0;
          const basePricePerToken = 3 / 1_000_000;
          const estimatedSavingsUsd = cacheRead > 0 ? 0.9 * basePricePerToken * cacheRead : 0;
          return {
            custom: {
              usage: {
                inputTokens: part.usage.inputTokens,
                outputTokens: part.usage.outputTokens,
                totalTokens: part.usage.totalTokens,
              },
              ...(cacheRead > 0 || cacheWrite > 0 ? {
                cache: {
                  cacheReadTokens: cacheRead,
                  cacheWriteTokens: cacheWrite,
                  estimatedSavingsUsd,
                },
              } : {}),
            },
          };
        }
        return undefined;
      },
    });
    response.headers.set("X-Session-Id", sessionId);
    return response;
  } catch (error) {
    console.error("Chat API error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorMessageLower = errorMessage.toLowerCase();
    const isCreditError =
      errorMessageLower.includes("insufficient") ||
      errorMessageLower.includes("quota") ||
      errorMessageLower.includes("credit") ||
      errorMessageLower.includes("429");

    // Mark the agent run as failed so the background processing banner clears
    if (chatTaskRegistered && agentRun?.id) {
      try {
        removeChatAbortController(agentRun.id);
        await completeAgentRun(agentRun.id, "failed", {
          error: isCreditError ? "Insufficient credits" : errorMessage,
        });
        const registryTask = taskRegistry.get(agentRun.id);
        const registryDurationMs = registryTask
          ? Date.now() - new Date(registryTask.startedAt).getTime()
          : undefined;
        taskRegistry.updateStatus(agentRun.id, "failed", {
          durationMs: registryDurationMs,
          error: isCreditError ? "Task interrupted - insufficient credits" : errorMessage,
        });
      } catch (e) {
        console.error("[CHAT API] Failed to mark agent run as failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        error: isCreditError
          ? "Insufficient credits. Please add credits to continue."
          : errorMessage,
      }),
      {
        status: isCreditError ? 402 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

function getPlainTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }

        return "";
      })
      .join(" ")
      .trim();
  }

  return "";
}
