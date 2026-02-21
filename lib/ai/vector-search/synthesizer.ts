/**
 * Vector Search Synthesizer
 *
 * Secondary LLM session that intelligently synthesizes vector search results.
 * Analyzes raw search results and produces organized, explained findings
 * with confidence scores and suggested refinements.
 *
 * Key features:
 * - Operates invisibly (no tool calls visible in UI)
 * - Understands code context and patterns
 * - Groups findings by file with explanations
 * - Inline readFile tool for following code relationships
 */

import { generateText, tool, jsonSchema } from "ai";
import { readFile } from "fs/promises";
import type {
  SynthesisRequest,
  SynthesisResult,
  SearchFinding,
  SearchStrategy,
  RawSearchResult,
} from "./types";
import {
  getSessionProviderTemperature,
  resolveSessionUtilityModel,
} from "@/lib/ai/session-model-resolver";
import { extname, basename, join, resolve, relative } from "path";

// ============================================================================
// Configuration
// ============================================================================

// Maximum content length to include in synthesis context (chars)
const MAX_CONTENT_LENGTH = 60000;

// Timeout for synthesis (ms)
const SYNTHESIS_TIMEOUT_MS = 45000;

// File read limits
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB
const MAX_LINE_COUNT = 5000;
const MAX_TOOL_STEPS = 10; // Limit tool calls to prevent loops

// ============================================================================
// System Prompt
// ============================================================================

const SYNTHESIS_SYSTEM_PROMPT = `You are an intelligent code search assistant that helps developers find and understand code in their codebase.

## Your Role
Analyze raw vector search results and synthesize them into organized, actionable findings that directly answer the user's query.

## Available Tools

You have access to a \`readFile\` tool to read full file contents when needed.

**When to use readFile:**
- When a snippet references imports you need to understand
- When you need to see the full function/class, not just a fragment
- When following code relationships between files
- Limit to 3-5 file reads max to stay efficient

**When NOT to use readFile:**
- If the snippet already provides enough context to answer the query
- For files not mentioned in the search results

## Critical Rules
1. Use the provided search results as your primary source, enhance with readFile when needed
2. Explain WHAT the code does and WHY it's relevant to the query
3. Group related findings logically (by file, by concept, by functionality)
4. Provide confidence scores (0-1) based on how well each result matches the query
5. Never mention "chunks", "embeddings", "vectors", or search mechanics

## Response Format

You MUST respond with valid JSON in exactly this format:
\`\`\`json
{
  "strategy": "semantic",
  "reasoning": "Brief explanation of why this search approach was appropriate",
  "findings": [
    {
      "filePath": "path/to/file.ts",
      "lineRange": "10-25",
      "snippet": "relevant code snippet (show 15-20 lines for good context)",
      "explanation": "What this code does and why it matches the query",
      "confidence": 0.95
    }
  ],
  "summary": "Overall summary of findings (2-3 sentences)",
  "suggestedRefinements": ["try searching for X", "check Y files"]
}
\`\`\`

## Strategy Selection

Based on the query and results, classify the strategy used:
- **semantic**: Conceptual/functionality-based search worked well
- **keyword**: Exact identifier/name matching was key
- **hybrid**: Both approaches contributed to results
- **contextual**: Results built on previous search context
- **exploratory**: Broad discovery across multiple areas

## Confidence Scoring Guidelines

- **0.9-1.0**: Direct answer, exact match to query intent
- **0.7-0.89**: Strongly relevant, addresses main query aspect
- **0.5-0.69**: Moderately relevant, related but not central
- **0.3-0.49**: Tangentially related, might be useful context
- **Below 0.3**: Weakly relevant, only include if nothing better

## Code Explanation Guidelines

When explaining code findings:
- Describe the PURPOSE of the code, not just its syntax
- Explain how it relates to the user's query
- Mention any patterns, dependencies, or connections to other files
- Highlight important aspects (exports, entry points, key functions)

## Query Refinement Suggestions

Suggest refinements when:
- Results are too broad or too narrow
- Related concepts weren't covered
- Specific files or patterns should be explored
- The query could be more specific for better results`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get code language for syntax highlighting
 */
function getCodeLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    md: "markdown",
    json: "json",
    html: "html",
    css: "css",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bash: "bash",
  };
  return langMap[ext] || ext || "text";
}

/**
 * Format raw results for synthesis context
 */
function formatResultsForContext(
  query: string,
  results: RawSearchResult[],
  searchHistorySummary: string,
  fileTreeSummary?: string | null
): string {
  const parts: string[] = [];

  parts.push(`## Search Query\n"${query}"\n`);

  if (searchHistorySummary) {
    parts.push(`## Recent Search Context\n${searchHistorySummary}\n`);
  }

  if (fileTreeSummary) {
    parts.push(`## Workspace Structure\n${fileTreeSummary}\n`);
  }

  parts.push(`## Raw Search Results (${results.length} chunks)\n`);

  let totalLength = 0;
  const groupedByFile = new Map<string, RawSearchResult[]>();

  // Group results by file
  for (const result of results) {
    const existing = groupedByFile.get(result.relativePath) || [];
    existing.push(result);
    groupedByFile.set(result.relativePath, existing);
  }

  // Format each file group
  for (const [filePath, fileResults] of groupedByFile) {
    const lang = getCodeLanguage(filePath);
    const fileName = basename(filePath);

    parts.push(`### ${fileName}`);
    parts.push(`*Path: \`${filePath}\`*\n`);

    // Sort by chunk index and format
    fileResults.sort((a, b) => a.chunkIndex - b.chunkIndex);

    for (const result of fileResults) {
      const remainingBudget = MAX_CONTENT_LENGTH - totalLength;
      let content = result.text.trim();

      if (content.length > remainingBudget) {
        content = content.substring(0, remainingBudget) + "\n[...truncated...]";
      }

      parts.push(`**Chunk ${result.chunkIndex}** (score: ${result.score.toFixed(3)})`);
      parts.push("```" + lang);
      parts.push(content);
      parts.push("```\n");

      totalLength += content.length;
      if (totalLength >= MAX_CONTENT_LENGTH) {
        parts.push("*[Additional results truncated due to length limits]*");
        break;
      }
    }

    if (totalLength >= MAX_CONTENT_LENGTH) break;
  }

  parts.push(`\n## Task\nAnalyze these results and provide organized findings that answer the query. Return ONLY valid JSON.`);

  return parts.join("\n");
}

/**
 * Try to extract JSON from a response using multiple strategies
 */
function tryExtractJson(response: string): unknown | null {
  // Strategy 1: Extract from markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 2: Direct JSON parse (response is pure JSON)
  try {
    return JSON.parse(response.trim());
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: Find first { to last } (handles leading/trailing text)
  const firstBrace = response.indexOf("{");
  const lastBrace = response.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(response.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 4: Find JSON object with "findings" key (most reliable indicator)
  const findingsMatch = response.match(/\{[\s\S]*"findings"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (findingsMatch) {
    try {
      return JSON.parse(findingsMatch[0]);
    } catch {
      // All strategies failed
    }
  }

  return null;
}

/**
 * Parse the LLM response into structured findings
 */
function parseSynthesisResponse(
  response: string,
  rawResults: RawSearchResult[]
): Omit<SynthesisResult, "success" | "error"> {
  const parsed = tryExtractJson(response);

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // Validate and sanitize findings
    const rawFindings = Array.isArray(obj.findings) ? obj.findings : [];
    const findings: SearchFinding[] = rawFindings.map((f: unknown) => {
      const finding = f as Record<string, unknown>;
      return {
        filePath: String(finding.filePath || ""),
        lineRange: finding.lineRange ? String(finding.lineRange) : undefined,
        snippet: String(finding.snippet || ""),
        explanation: String(finding.explanation || ""),
        confidence: Math.min(1, Math.max(0, Number(finding.confidence) || 0.5)),
      };
    });

    return {
      strategy: (obj.strategy as SearchStrategy) || "semantic",
      reasoning: String(obj.reasoning || "Analysis complete"),
      findings,
      summary: String(obj.summary || "Search results processed"),
      suggestedRefinements: Array.isArray(obj.suggestedRefinements)
        ? obj.suggestedRefinements.map(String)
        : [],
    };
  }

  // Log failure with response preview for debugging
  const preview = response.length > 200 ? response.slice(0, 200) + "..." : response;
  console.warn(
    `[VectorSearchSynthesizer] Failed to parse JSON response. Preview: ${preview}`
  );

  // Fallback: map raw results to findings so the user sees something
  // Only take top 5 to avoid overwhelming if synthesis failed
  const fallbackFindings: SearchFinding[] = rawResults.slice(0, 5).map((r) => ({
    filePath: r.relativePath,
    lineRange: r.startLine ? `${r.startLine}-${r.endLine}` : undefined,
    snippet: r.text,
    explanation: "Raw search result (synthesis failed)",
    confidence: r.score,
  }));

  return {
    strategy: "semantic",
    reasoning: "Synthesis failed, showing raw results.",
    findings: fallbackFindings,
    summary: "Could not generate a synthesized summary. Showing raw search matches.",
    suggestedRefinements: [],
  };
}

// ============================================================================
// Read File Tool
// ============================================================================

/**
 * Validate that a file path is within allowed folders (security check)
 *
 * Handles both:
 * 1. Absolute paths - checks if within any allowed folder
 * 2. Relative paths - tries resolving relative to each allowed folder
 */
function isPathAllowed(filePath: string, allowedFolderPaths: string[]): string | null {
  const { isAbsolute, join, normalize, sep } = require("path");

  // Case 1: Path is already absolute
  if (isAbsolute(filePath)) {
    const normalizedPath = normalize(filePath);
    for (const allowedPath of allowedFolderPaths) {
      const resolvedAllowed = resolve(allowedPath);
      // Use platform-specific path separator for Windows compatibility
      if (normalizedPath.startsWith(resolvedAllowed + sep) || normalizedPath === resolvedAllowed) {
        return normalizedPath;
      }
    }
    return null;
  }

  // Case 2: Relative path - try resolving relative to each allowed folder
  for (const allowedPath of allowedFolderPaths) {
    const resolvedAllowed = resolve(allowedPath);
    const candidatePath = normalize(join(resolvedAllowed, filePath));

    // Security: Ensure the resolved path is still within the allowed folder
    // (prevents path traversal attacks like "../../../etc/passwd")
    // Use platform-specific path separator for Windows compatibility
    if (candidatePath.startsWith(resolvedAllowed + sep) || candidatePath === resolvedAllowed) {
      return candidatePath;
    }
  }

  return null;
}

// Schema for readFile tool
const readFileSchema = jsonSchema<{
  filePath: string;
  startLine?: number;
  endLine?: number;
}>({
  type: "object",
  title: "ReadFileInput",
  description: "Input schema for reading files during synthesis",
  properties: {
    filePath: {
      type: "string",
      description: "File path from the search results",
    },
    startLine: {
      type: "number",
      description: "Start line (1-indexed, optional)",
    },
    endLine: {
      type: "number",
      description: "End line (1-indexed, optional)",
    },
  },
  required: ["filePath"],
  additionalProperties: false,
});

/**
 * Create the readFile tool for the synthesizer
 */
function createReadFileTool(allowedFolderPaths: string[]) {
  return tool({
    description: `Read full file content or a specific line range. Use when you need more context than the snippet provides.

Parameters:
- filePath: The file path from the search results (relative or absolute)
- startLine (optional): Start line number (1-indexed)
- endLine (optional): End line number (1-indexed)

Returns the file content with line numbers.`,
    inputSchema: readFileSchema,
    execute: async ({ filePath, startLine, endLine }) => {
      try {
        // Security: Check if path is allowed
        const validPath = isPathAllowed(filePath, allowedFolderPaths);
        if (!validPath) {
          return { error: `File path not allowed: ${filePath}` };
        }

        // Read file
        const content = await readFile(validPath, "utf-8");
        const lines = content.split("\n");

        // Check file size
        if (content.length > MAX_FILE_SIZE_BYTES) {
          return {
            error: `File too large (${Math.round(content.length / 1024)}KB). Max: ${MAX_FILE_SIZE_BYTES / 1024}KB`,
            suggestion: "Try reading a specific line range instead"
          };
        }

        // Apply line range if specified
        let selectedLines = lines;
        let actualStartLine = 1;
        let actualEndLine = lines.length;

        if (startLine !== undefined || endLine !== undefined) {
          actualStartLine = Math.max(1, startLine ?? 1);
          actualEndLine = Math.min(lines.length, endLine ?? lines.length);

          // Enforce max line count
          if (actualEndLine - actualStartLine + 1 > MAX_LINE_COUNT) {
            actualEndLine = actualStartLine + MAX_LINE_COUNT - 1;
          }

          selectedLines = lines.slice(actualStartLine - 1, actualEndLine);
        } else if (lines.length > MAX_LINE_COUNT) {
          // Full file requested but too many lines - truncate
          selectedLines = lines.slice(0, MAX_LINE_COUNT);
          actualEndLine = MAX_LINE_COUNT;
        }

        // Format with line numbers
        const lang = getCodeLanguage(filePath);
        const formattedContent = selectedLines
          .map((line, idx) => `${String(actualStartLine + idx).padStart(4, " ")} | ${line}`)
          .join("\n");

        const truncated = selectedLines.length < lines.length;

        return {
          filePath,
          language: lang,
          lineRange: `${actualStartLine}-${actualEndLine}`,
          totalLines: lines.length,
          content: formattedContent,
          truncated,
          truncatedMessage: truncated ? `Showing lines ${actualStartLine}-${actualEndLine} of ${lines.length}` : undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[ReadFileTool] Error reading ${filePath}:`, message);
        return { error: `Failed to read file: ${message}` };
      }
    },
  });
}

// ============================================================================
// Synthesis Function
// ============================================================================

/**
 * Synthesize search results into organized findings
 */
export async function synthesizeSearchResults(
  request: SynthesisRequest
): Promise<SynthesisResult> {
  const {
    query,
    rawResults,
    searchHistory,
    sessionMetadata,
    allowedFolderPaths,
    fileTreeSummary,
  } = request;

  try {
    if (rawResults.length === 0) {
      return {
        success: false,
        strategy: "semantic",
        reasoning: "",
        findings: [],
        summary: "",
        error: "No results to synthesize",
      };
    }

    // Format search history for context
    const searchHistorySummary = searchHistory.length > 0
      ? searchHistory.slice(-3).map(h =>
        `- "${h.query}" (${h.strategy}, ${h.resultsCount} results)`
      ).join("\n")
      : "";

    // Format results for the LLM
    const contextPrompt = formatResultsForContext(
      query,
      rawResults,
      searchHistorySummary,
      fileTreeSummary
    );

    const synthesisStartTime = Date.now();
    console.log(
      `[VectorSearchSynthesizer] Starting synthesis: query="${query.slice(0, 50)}...", ` +
      `chunks=${rawResults.length}, folders=${allowedFolderPaths.length}`
    );

    // Create the readFile tool if we have allowed paths
    const tools = allowedFolderPaths.length > 0
      ? { readFile: createReadFileTool(allowedFolderPaths) }
      : undefined;

    // Call the utility model with tools and timeout
    // Note: maxSteps enables multi-step tool calling in AI SDK 5.0+
    const generateOptions = {
      model: resolveSessionUtilityModel(sessionMetadata),
      system: SYNTHESIS_SYSTEM_PROMPT,
      prompt: contextPrompt,
      tools,
      maxSteps: tools ? MAX_TOOL_STEPS : 1, // Only allow multi-step if tools are available
      maxOutputTokens: 4000,
      temperature: getSessionProviderTemperature(sessionMetadata, 0.2),
    };

    const result = await Promise.race([
      generateText(generateOptions as Parameters<typeof generateText>[0]),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SYNTHESIS_TIMEOUT_MS)
      ),
    ]);

    if (result === null) {
      console.warn(`[VectorSearchSynthesizer] Synthesis timed out after ${SYNTHESIS_TIMEOUT_MS}ms`);
      return {
        success: false,
        strategy: "semantic",
        reasoning: "",
        findings: [],
        summary: "",
        error: "Synthesis timed out. Try a more specific query.",
      };
    }

    // Log tool usage stats
    const toolCalls = result.steps?.reduce((acc, step) => acc + (step.toolCalls?.length || 0), 0) || 0;
    if (toolCalls > 0) {
      console.log(`[VectorSearchSynthesizer] Used readFile tool ${toolCalls} times`);
    }

    const synthesisEndTime = Date.now();

    // Extract final text - may be in result.text or in the last step's text
    // When multi-step tool calling is used, final text might be in the last non-tool step
    let finalText = result.text || "";

    // If result.text is empty but we have steps, check for text in steps
    if (!finalText && result.steps && result.steps.length > 0) {
      // Look for text in steps (usually the last step has the final response)
      for (let i = result.steps.length - 1; i >= 0; i--) {
        const step = result.steps[i];
        if (step.text && step.text.trim()) {
          finalText = step.text;
          console.log(`[VectorSearchSynthesizer] Extracted text from step ${i}: ${finalText.length} chars`);
          break;
        }
      }
    }

    console.log(
      `[VectorSearchSynthesizer] Synthesis complete: duration=${synthesisEndTime - synthesisStartTime}ms, ` +
      `responseChars=${finalText.length}, toolCalls=${toolCalls}`
    );

    // If still no text after tool calls, force a follow-up without tools
    if (!finalText && toolCalls > 0) {
      console.warn(`[VectorSearchSynthesizer] No text after ${toolCalls} tool calls, requesting final response`);
      try {
        const followUp = await generateText({
          model: resolveSessionUtilityModel(sessionMetadata),
          system: SYNTHESIS_SYSTEM_PROMPT,
          prompt: contextPrompt + "\n\n## IMPORTANT\nYou have already read the relevant files. Now provide your JSON response with findings.",
          maxOutputTokens: 4000,
          temperature: getSessionProviderTemperature(sessionMetadata, 0.2),
        });
        finalText = followUp.text || "";
        console.log(`[VectorSearchSynthesizer] Follow-up response: ${finalText.length} chars`);
      } catch (e) {
        console.error(`[VectorSearchSynthesizer] Follow-up request failed:`, e);
      }
    }

    const parsed = parseSynthesisResponse(finalText, rawResults);

    return {
      success: true,
      ...parsed,
    };
  } catch (error) {
    console.error("[VectorSearchSynthesizer] Error:", error);
    return {
      success: false,
      strategy: "semantic",
      reasoning: "",
      findings: [],
      summary: "",
      error: error instanceof Error ? error.message : "Unknown synthesis error",
    };
  }
}
