/**
 * Web Content Synthesizer
 *
 * Secondary LLM session that synthesizes information from fetched web content.
 * Similar to prompt-enhancer pattern but specialized for web content analysis.
 *
 * Key features:
 * - Operates invisibly (no tool calls visible in UI)
 * - Receives full web content in context
 * - Returns consolidated, synthesized response
 * - Session-isolated from main conversation
 */

import { generateText } from "ai";
import { getSessionContent, getContentByUrls } from "./session-store";
import type { SynthesisRequest, SynthesisResult, WebContentEntry } from "./types";
import { logToolEvent } from "@/lib/ai/tool-registry/logging";
import {
  getSessionProviderTemperature,
  resolveSessionUtilityModel,
} from "@/lib/ai/session-model-resolver";

// ============================================================================
// Configuration
// ============================================================================

// Maximum content length to include in synthesis context (chars)
const MAX_CONTENT_LENGTH = 50000;

// Image listing limits for context
const DEFAULT_IMAGE_LIMIT = 10;
const MAX_IMAGE_LIMIT = 200;

// Timeout for synthesis (ms)
const SYNTHESIS_TIMEOUT_MS = 120000;

// ============================================================================
// System Prompt
// ============================================================================

const SYNTHESIS_SYSTEM_PROMPT = `You are a Web Content Synthesis Agent. Your role is to analyze fetched web content and provide concise, accurate answers to user queries.

## Your Role
Extract and synthesize relevant information from the provided web content to answer the user's question directly and comprehensively.

## Critical Rules
1. ONLY use information from the provided web content - do not add external knowledge
2. Be concise but thorough - cover all relevant points from the sources
3. Cite sources when possible (mention the page title or URL)
4. If the content doesn't contain the answer, say so clearly
5. Format your response with proper markdown for readability
6. Focus on answering the specific question asked

## CRITICAL: Product/Shopping Queries
When the query is about finding, recommending, or comparing products:
1. **Extract product details**: name, price, description
2. **Use the provided image URLs**: Each source includes an "Available Images" section - USE THESE URLS
3. **Format products clearly** with their image URLs and source URLs for purchase

For product queries, include this structured format for EACH product found:

**[Product Name]**
- Price: [extracted price]
- Image: [use URL from "Available Images" or "Hero Image" section - REQUIRED]
- Link: [source URL for purchase]
- Description: [brief description]

## Response Format
- Start with a direct answer to the question
- Provide supporting details and context
- Use bullet points or numbered lists for multiple items
- Include relevant quotes or data points when helpful
- End with source attribution if citing specific pages
- **For products: ALWAYS include image URLs from the "Available Images" section**`;

// ============================================================================
// Content Formatting
// ============================================================================

/**
 * Format web content entries for the LLM context
 */
function formatContentForContext(
  entries: WebContentEntry[],
  options: { includeAllImages: boolean }
): string {
  if (entries.length === 0) {
    return "No web content available.";
  }

  const parts: string[] = ["## Retrieved Web Content\n"];
  const imageLimit = options.includeAllImages ? MAX_IMAGE_LIMIT : DEFAULT_IMAGE_LIMIT;

  let totalLength = 0;
  for (const entry of entries) {
    // Truncate individual entries if needed
    let content = entry.content;
    const remainingBudget = MAX_CONTENT_LENGTH - totalLength;

    if (content.length > remainingBudget) {
      content = content.substring(0, remainingBudget) + "\n[...content truncated...]";
    }

    parts.push(`### ${entry.title}`);
    parts.push(`**Source:** ${entry.url}`);
    parts.push(`**Fetched:** ${entry.fetchedAt.toISOString()}`);

    // Include extracted images for product queries
    if (entry.ogImage) {
      parts.push(`**Hero Image (use this for products):** ${entry.ogImage}`);
    }
    if (entry.images && entry.images.length > 0) {
      const imagesToShow = entry.images.slice(0, imageLimit);
      parts.push(`**Available Images (${entry.images.length} total):**`);
      imagesToShow.forEach((img, i) => {
        parts.push(`  ${i + 1}. ${img}`);
      });
      if (entry.images.length > imagesToShow.length) {
        parts.push(`  ... and ${entry.images.length - imagesToShow.length} more images`);
      }
    }

    parts.push(""); // Empty line before content
    parts.push(content);
    parts.push("\n---\n");

    totalLength += content.length;
    if (totalLength >= MAX_CONTENT_LENGTH) {
      parts.push("*[Additional content truncated due to length limits]*");
      break;
    }
  }

  return parts.join("\n");
}

function wantsAllImages(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return (
    lowerQuery.includes("all images") ||
    lowerQuery.includes("every image") ||
    lowerQuery.includes("list images") ||
    lowerQuery.includes("extract images") ||
    lowerQuery.includes("image urls") ||
    lowerQuery.includes("image url") ||
    lowerQuery.includes("image links")
  );
}

// ============================================================================
// Shopping Intent Detection
// ============================================================================

// Keywords that indicate shopping/product query intent
const SHOPPING_KEYWORDS = [
  "buy", "purchase", "shop", "price", "cost", "product", "tile", "furniture",
  "floor", "sofa", "couch", "chair", "table", "lamp", "decor", "appliance",
  "clothing", "dress", "shirt", "shoes", "bag", "watch", "jewelry",
  "find me", "recommend", "best", "top", "affordable", "cheap", "expensive",
  "review", "compare", "vs", "options", "kitchen", "bathroom", "bedroom",
  "living room", "outdoor", "patio", "garden", "home depot", "lowe", "wayfair",
  "amazon", "target", "ikea", "pottery barn", "west elm", "crate", "barrel",
];

/**
 * Detect if a query has shopping/product intent
 */
function hasShoppingIntent(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return SHOPPING_KEYWORDS.some((keyword) => lowerQuery.includes(keyword));
}

/**
 * Enhance query with shopping requirements if shopping intent detected
 */
function enhanceQueryForShopping(query: string, hasImages: boolean): string {
  if (!hasShoppingIntent(query)) {
    return query;
  }

  // Append shopping extraction requirements
  const enhancements: string[] = [];

  if (hasImages) {
    enhancements.push(
      "IMPORTANT: Extract ALL products with their EXACT image URLs from the 'Available Images' or 'Hero Image' sections provided."
    );
  }

  enhancements.push(
    "For each product, you MUST include: product name, price, image URL (from Available Images), and source URL (the page URL for purchase).",
    "Format each product clearly so the information can be used to display a product gallery."
  );

  return `${query}\n\n${enhancements.join(" ")}`;
}

// ============================================================================
// Synthesis Function
// ============================================================================

/**
 * Synthesize an answer from session web content
 */
export async function synthesizeWebContent(
  request: SynthesisRequest
): Promise<SynthesisResult> {
  const { sessionId, query, urls, sessionMetadata, abortSignal } = request;
  const startTime = Date.now();

  // Log synthesis start
  logToolEvent({
    level: "info",
    toolName: "webBrowse.synthesize",
    sessionId,
    event: "start",
    args: { query: query.slice(0, 100), urlCount: urls?.length || 0 },
  });

  try {
    // Get content from session store
    const entries = urls && urls.length > 0
      ? await getContentByUrls(sessionId, urls)
      : await getSessionContent(sessionId);

    if (entries.length === 0) {
      logToolEvent({
        level: "warn",
        toolName: "webBrowse.synthesize",
        sessionId,
        event: "error",
        durationMs: Date.now() - startTime,
        error: "No web content found in session",
      });
      return {
        success: false,
        synthesis: "",
        sourcesUsed: [],
        error: "No web content found in session. Fetch some URLs first.",
      };
    }

    // Collect image statistics for observability
    const imageStats = entries.map((e) => ({
      url: e.url,
      imageCount: e.images?.length || 0,
      hasOgImage: !!e.ogImage,
    }));
    const totalImages = imageStats.reduce((sum, s) => sum + s.imageCount, 0);
    const entriesWithImages = imageStats.filter((s) => s.imageCount > 0 || s.hasOgImage).length;

    // Format content for context
    const includeAllImages = hasShoppingIntent(query) || wantsAllImages(query);
    const contentContext = formatContentForContext(entries, { includeAllImages });
    const sourcesUsed = entries.map((e) => e.url);

    // Check if any entries have images
    const hasImages = entries.some((e) => (e.images && e.images.length > 0) || e.ogImage);

    // Enhance query for shopping if needed
    const enhancedQuery = enhanceQueryForShopping(query, hasImages);
    const isShoppingQuery = enhancedQuery !== query;

    // Build the synthesis prompt
    const synthesisPrompt = `## User's Question
"${enhancedQuery}"

${contentContext}

Based on the web content above, provide a comprehensive answer to the user's question.${isShoppingQuery ? " Remember to include product image URLs and purchase links for each product." : ""}`;

    // Call the utility model with timeout
    const result = await Promise.race([
      generateText({
        model: resolveSessionUtilityModel(sessionMetadata),
        system: SYNTHESIS_SYSTEM_PROMPT,
        prompt: synthesisPrompt,
        maxOutputTokens: 2000,
        temperature: getSessionProviderTemperature(sessionMetadata, 0.3),
        abortSignal,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SYNTHESIS_TIMEOUT_MS)),
    ]);

    const durationMs = Date.now() - startTime;

    if (result === null) {
      logToolEvent({
        level: "error",
        toolName: "webBrowse.synthesize",
        sessionId,
        event: "error",
        durationMs,
        error: "Synthesis timed out",
        metadata: { timeoutMs: SYNTHESIS_TIMEOUT_MS },
      });
      return {
        success: false,
        synthesis: "",
        sourcesUsed,
        error: "Synthesis timed out. Try a more specific question.",
      };
    }

    // Log success with detailed metrics
    logToolEvent({
      level: "info",
      toolName: "webBrowse.synthesize",
      sessionId,
      event: "success",
      durationMs,
      result: {
        entriesProcessed: entries.length,
        totalImagesInContext: totalImages,
        entriesWithImages,
        isShoppingQuery,
        synthesisLength: result.text.length,
        tokenCount: result.usage?.totalTokens,
        contextLength: contentContext.length,
      },
    });

    return {
      success: true,
      synthesis: result.text,
      sourcesUsed,
      tokenCount: result.usage?.totalTokens,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown synthesis error";
    logToolEvent({
      level: "error",
      toolName: "webBrowse.synthesize",
      sessionId,
      event: "error",
      durationMs: Date.now() - startTime,
      error: errorMessage,
    });
    return {
      success: false,
      synthesis: "",
      sourcesUsed: [],
      error: errorMessage,
    };
  }
}

