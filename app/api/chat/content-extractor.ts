import fs from "fs/promises";
import path from "path";
import { normalizeToolResultOutput } from "@/lib/ai/tool-result-utils";
import {
  sanitizeTextContent,
  stripFakeToolCallJson,
  extractPasteBlocks,
  reinsertPasteBlocks,
} from "./content-sanitizer";
import { reconcileToolCallPairs, toModelToolResultOutput, normalizeToolCallInput } from "./tool-call-utils";

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

// Helper to extract content from assistant-ui message format
// assistant-ui sends messages with `parts` array, but AI SDK expects `content`
// Also handles `experimental_attachments` from AI SDK format
// includeUrlHelpers: when true, adds [Image URL: ...] text for AI context (not for DB storage)
// convertUserImagesToBase64: when true, converts USER-uploaded image URLs to base64 (not tool-generated images)
// sessionId: when provided, enables smart truncation with full content retrieval
export async function extractContent(
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
    // Extract paste blocks before sanitization so they bypass the truncation limit.
    // sanitizeTextContent only sees the user's short query; paste content is reinserted after.
    const { cleanedText, pasteBlocks } = extractPasteBlocks(msg.content);
    // Strip fake tool call JSON that may have been saved from previous model outputs
    const stripped = stripFakeToolCallJson(cleanedText);
    if (!stripped.trim() && pasteBlocks.length === 0) return "";
    const sanitized = sanitizeTextContent(stripped, "string content", sessionId);
    return reinsertPasteBlocks(sanitized, pasteBlocks);
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
        // Extract paste blocks before sanitization — paste content must not be truncated.
        // sanitizeTextContent only sees the user's short query text; blocks are reinserted after.
        const { cleanedText, pasteBlocks } = extractPasteBlocks(part.text);
        // Strip fake tool call JSON that the model may have output as text in previous turns
        const strippedText = stripFakeToolCallJson(cleanedText);
        if (!strippedText.trim() && pasteBlocks.length === 0) continue; // Skip entirely empty parts
        // Sanitize text to prevent base64 leakage (with smart truncation if sessionId provided)
        const sanitizedText = sanitizeTextContent(strippedText, `text part in ${msg.role} message`, sessionId);
        const finalText = reinsertPasteBlocks(sanitizedText, pasteBlocks);
        if (finalText.trim()) contentParts.push({ type: "text", text: finalText });
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
          const normalizedOutput = normalizeToolResultOutput(
            toolName,
            output,
            normalizedInput,
            { mode: "projection" }
          ).output;
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
          const normalizedOutput = normalizeToolResultOutput(
            part.toolName,
            rawOutput,
            normalizedInput,
            { mode: "projection" }
          ).output;
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
        const normalizedOutput = normalizeToolResultOutput(
          part.toolName,
          rawOutput,
          normalizedInput,
          { mode: "projection" }
        ).output;
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
          const normalizedOutput = normalizeToolResultOutput(
            toolName,
            toolOutput,
            normalizedInput,
            { mode: "projection" }
          ).output;
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

    const normalizedParts = reconcileToolCallPairs(contentParts);

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
