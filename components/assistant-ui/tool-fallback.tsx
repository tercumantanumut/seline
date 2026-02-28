"use client";

import { memo, useEffect, useMemo, useState, type FC } from "react";
import { CircleNotch, CheckCircle, XCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { resilientFetch } from "@/lib/utils/resilient-fetch";
import { getToolIcon } from "@/components/ui/tool-icon-map";
// Define the tool call component type manually since it's no longer exported
type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: unknown;
  result?: unknown;
}>;

interface ImageResult {
  url: string;
  width?: number;
  height?: number;
  format?: string;
}

interface VideoResult {
  url: string;
  width?: number;
  height?: number;
  format?: string;
  fps?: number;
  duration?: number;
}

// Web search source type
interface WebSearchSource {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
}

interface ToolResult {
  status: "completed" | "processing" | "error" | "success" | "no_results" | "no_api_key" | "no_paths" | "disabled" | "no_provider";
  images?: ImageResult[];
  videos?: VideoResult[];
  results?: Array<{
    prompt?: string;
    status?: string;
    images?: ImageResult[];
    error?: string;
    // searchTools result fields
    name?: string;
    displayName?: string;
    category?: string;
    description?: string;
    isAvailable?: boolean;
  }>;
  error?: string;
  text?: string;
  jobId?: string;
  timeTaken?: number;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  executionTime?: number;
  // searchTools specific fields
  query?: string;
  message?: string;
  // webSearch specific fields
  sources?: WebSearchSource[];
  answer?: string;
  formattedResults?: string;
  iterationPerformed?: boolean;
}

function getCanonicalToolName(toolName: string): string {
  const match = /^mcp__.+?__(.+)$/.exec(toolName);
  return match?.[1] || toolName;
}

function parseNestedJsonValue(text: string, maxDepth: number = 3): unknown | undefined {
  let current: unknown = text;
  for (let i = 0; i < maxDepth; i += 1) {
    if (typeof current !== "string") return current;
    const trimmed = current.trim();
    if (!trimmed) return undefined;
    try {
      current = JSON.parse(trimmed);
    } catch {
      return i === 0 ? undefined : current;
    }
  }
  return current;
}

function unwrapMcpTextWrappedResult(result: ToolResult | string): ToolResult {
  if (typeof result === "string") {
    const parsed = parseNestedJsonValue(result);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ToolResult;
    }
    return {
      status: "success",
      text: typeof parsed === "string" ? parsed : result,
    };
  }

  const content = (result as ToolResult & { content?: unknown }).content;
  if (typeof content === "string") {
    const parsed = parseNestedJsonValue(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const parsedObj = parsed as Record<string, unknown>;
      return {
        ...result,
        ...parsedObj,
        status: typeof parsedObj.status === "string" ? (parsedObj.status as ToolResult["status"]) : result.status,
      };
    }
    if (typeof parsed === "string" && parsed.trim().length > 0) {
      return {
        ...result,
        text: parsed,
      };
    }
    return result;
  }

  if (!Array.isArray(content)) return result;

  const textItem = content.find(
    (item): item is { type?: string; text?: string } =>
      !!item &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "text" &&
      typeof (item as { text?: unknown }).text === "string"
  );

  if (!textItem?.text) return result;
  const parsed = parseNestedJsonValue(textItem.text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const parsedObj = parsed as Record<string, unknown>;
    return {
      ...result,
      ...parsedObj,
      status: typeof parsedObj.status === "string" ? (parsedObj.status as ToolResult["status"]) : result.status,
    };
  }

  if (typeof parsed === "string" && parsed.trim().length > 0) {
    return {
      ...result,
      text: parsed,
    };
  }

  return result;
}

function hasVisualMedia(result?: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.images) && (r.images as Array<Record<string, unknown>>).length) return true;
  if (Array.isArray(r.videos) && (r.videos as Array<Record<string, unknown>>).length) return true;
  if (Array.isArray(r.results)) {
    return r.results.some((item) => hasVisualMedia(item));
  }
  return false;
}

const TOOL_RESULT_TEXT_CLASS = "text-sm text-terminal-muted font-mono transition-opacity duration-150 [overflow-wrap:anywhere]";
const TOOL_RESULT_PRE_CLASS = "overflow-x-auto rounded bg-terminal-dark/5 p-2 text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-terminal-dark";
const TOOL_RESULT_ERROR_PRE_CLASS = "overflow-x-auto rounded bg-red-50 p-2 text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-red-600";

// Memoized Icon Component with Phosphor Icons
const ToolIcon: FC<{
  toolName: string;
  isRunning: boolean;
  result?: ToolResult;
}> = memo(({ toolName, isRunning, result }) => {
  const iconClass = "size-4 transition-all duration-200";
  
  // Status-based icons (highest priority)
  if (isRunning) {
    return <CircleNotch className={`${iconClass} animate-spin text-terminal-green`} weight="bold" />;
  }

  if (result?.status === "error") {
    return <XCircle className={`${iconClass} text-red-600`} weight="fill" />;
  }

  // Tool-specific icons from the icon map
  const iconConfig = getToolIcon(toolName);
  const Icon = iconConfig.icon;
  // Weight is already handled by the icon config
  const weight = iconConfig.weight;

  return <Icon className={`${iconClass} text-terminal-green`} weight={weight} />;
});
ToolIcon.displayName = "ToolIcon";

// Memoized Status Component
const ToolStatus: FC<{ isRunning: boolean; result?: ToolResult }> = memo(({
  isRunning,
  result,
}) => {
  const t = useTranslations("assistantUi.toolStatus");
  if (isRunning) {
    return (
      <span className="text-xs text-terminal-muted font-mono transition-opacity duration-150">{t("processing")}</span>
    );
  }

  if (result?.status === "error") {
    return <span className="text-xs text-red-600 font-mono transition-opacity duration-150">{t("failed")}</span>;
  }

  if (result?.status === "processing") {
    return <span className="text-xs text-terminal-amber font-mono transition-opacity duration-150">{t("queued")}</span>;
  }

  return <span className="text-xs text-terminal-green font-mono transition-opacity duration-150">{t("completed")}</span>;
});
ToolStatus.displayName = "ToolStatus";

// Memoized Result Display Component
const ToolResultDisplay: FC<{ toolName: string; result: ToolResult }> = memo(({ toolName, result }) => {
  const tResults = useTranslations("assistantUi.toolResults");
  const canonicalToolName = getCanonicalToolName(toolName);
  const normalizedResult = unwrapMcpTextWrappedResult(result);

  if (normalizedResult.status === "error") {
    return (
      <div className="rounded bg-red-50 p-2 font-mono text-sm text-red-600 transition-all duration-150 [overflow-wrap:anywhere]">
        {normalizedResult.error || tResults("errorOccurred")}
      </div>
    );
  }

  if (normalizedResult.status === "processing") {
    return (
      <div className={cn("transition-all duration-150", TOOL_RESULT_TEXT_CLASS)}>
        {tResults("generationQueued", { jobId: normalizedResult.jobId ?? "" })}
      </div>
    );
  }

  // Handle searchTools results
  if (canonicalToolName === "searchTools") {
    const rawResults = (normalizedResult as { results?: unknown }).results;
    const searchResults = Array.isArray(rawResults) ? rawResults as Array<{
      name?: string;
      displayName?: string;
      category?: string;
      description?: string;
      isAvailable?: boolean;
    }> : undefined;

    if (rawResults !== undefined && !Array.isArray(rawResults)) {
      return (
        <div className={TOOL_RESULT_TEXT_CLASS}>
          {tResults("unexpectedFormat")}
          <pre className={cn("mt-2 max-h-64", TOOL_RESULT_PRE_CLASS)}>
            {formatResultValue(rawResults)}
          </pre>
        </div>
      );
    }

    if (normalizedResult.status === "no_results" || !searchResults || searchResults.length === 0) {
      return (
        <div className={TOOL_RESULT_TEXT_CLASS}>
          {tResults("noToolsFound", { query: normalizedResult.query ?? "" })}
        </div>
      );
    }

    const toolNames = searchResults.map(t => t.displayName || t.name).filter(Boolean);
    return (
      <div className="text-sm font-mono transition-opacity duration-150">
        <p className="text-terminal-dark mb-2">
          {tResults("toolsFound", { count: searchResults.length, names: toolNames.join(", ") })}
        </p>
        <div className="space-y-1">
          {searchResults.map((tool, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className={tool.isAvailable ? "text-terminal-green" : "text-terminal-muted"}>
                {tool.isAvailable ? "●" : "○"}
              </span>
              <span className="text-terminal-dark font-medium">{tool.displayName || tool.name}</span>
              {tool.category && (
                <span className="text-terminal-muted">({tool.category})</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Handle listAllTools results
  if (canonicalToolName === "listAllTools") {
    return (
      <div className={TOOL_RESULT_TEXT_CLASS}>
        {normalizedResult.message || tResults("toolsListedSuccessfully")}
      </div>
    );
  }

  // Handle webSearch results
  if (canonicalToolName === "webSearch") {
    const action = typeof (normalizedResult as { action?: unknown }).action === "string"
      ? ((normalizedResult as { action?: string }).action ?? "search")
      : "search";

    // Handle provider/configuration errors
    if (normalizedResult.status === "no_provider" || normalizedResult.status === "no_api_key") {
      return (
        <div className={TOOL_RESULT_TEXT_CLASS}>
          {normalizedResult.message || tResults("webSearchUnavailable")}
        </div>
      );
    }

    // Handle browse action with full-page payloads
    if (action === "browse") {
      const pages = Array.isArray((normalizedResult as { pages?: unknown[] }).pages)
        ? ((normalizedResult as { pages?: Array<{ title?: string; url?: string; contentLength?: number }> }).pages ?? [])
        : [];

      if (pages.length === 0) {
        return (
          <div className={TOOL_RESULT_TEXT_CLASS}>
            {normalizedResult.message || tResults("noWebResults", { query: normalizedResult.query ?? "" })}
          </div>
        );
      }

      return (
        <div className={cn("space-y-3", TOOL_RESULT_TEXT_CLASS)}>
          {normalizedResult.message && (
            <div className="rounded bg-terminal-dark/5 p-2 text-terminal-dark [overflow-wrap:anywhere]">
              {normalizedResult.message}
            </div>
          )}
          <div className="space-y-2">
            <span className="text-terminal-muted text-xs">
              {tResults("sourcesFound", { count: pages.length })}
            </span>
            {pages.map((page, idx) => (
              <div key={idx} className="pl-2 border-l-2 border-terminal-green/30">
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-terminal-green hover:underline font-medium block"
                >
                  {idx + 1}. {page.title || page.url}
                </a>
                {typeof page.contentLength === "number" && (
                  <p className="text-xs text-terminal-muted mt-0.5">
                    {Math.round(page.contentLength / 1024)}KB fetched
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // For disabled/no_paths statuses, show message when no sources available
    if (normalizedResult.status === "disabled" || normalizedResult.status === "no_paths") {
      const hasSources = Array.isArray(normalizedResult.sources) && normalizedResult.sources.length > 0;
      if (!hasSources) {
        return (
          <div className={TOOL_RESULT_TEXT_CLASS}>
            {normalizedResult.message || tResults("webSearchUnavailable")}
          </div>
        );
      }
    }

    // Display search-style sources with links
    const sources = normalizedResult.sources || [];
    if (sources.length === 0) {
      return (
        <div className={TOOL_RESULT_TEXT_CLASS}>
          {normalizedResult.message || tResults("noWebResults", { query: normalizedResult.query ?? "" })}
        </div>
      );
    }

    return (
      <div className={cn("space-y-3", TOOL_RESULT_TEXT_CLASS)}>
        {/* Summary/Answer */}
        {normalizedResult.answer && (
          <div className="rounded bg-terminal-dark/5 p-2 text-terminal-dark [overflow-wrap:anywhere]">
            <span className="font-medium">{tResults("webSearchSummary")}:</span> {normalizedResult.answer}
          </div>
        )}

        {normalizedResult.message && (
          <div className="rounded bg-terminal-dark/5 p-2 text-terminal-dark [overflow-wrap:anywhere]">
            {normalizedResult.message}
          </div>
        )}

        {/* Sources with clickable links */}
        <div className="space-y-2">
          <span className="text-terminal-muted text-xs">
            {tResults("sourcesFound", { count: sources.length })}
          </span>
          {sources.map((source, idx) => (
            <div key={idx} className="pl-2 border-l-2 border-terminal-green/30">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-terminal-green hover:underline font-medium block"
              >
                {idx + 1}. {source.title}
              </a>
              <p className="text-xs text-terminal-muted mt-0.5 line-clamp-2">
                {source.snippet}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Handle readFile results
  if (canonicalToolName === "readFile") {
    const readResult = normalizedResult as ToolResult & {
      filePath?: string;
      language?: string;
      lineRange?: string;
      totalLines?: number;
      content?: string;
      truncated?: boolean;
      source?: string;
      documentTitle?: string;
    };

    // Handle error status
    if (readResult.status === "error") {
      return (
        <div className="rounded bg-red-50 p-2 font-mono text-sm text-red-600 transition-all duration-150 [overflow-wrap:anywhere]">
          {readResult.error || tResults("readFileFailed")}
        </div>
      );
    }

    const fileName = readResult.filePath
      ? readResult.filePath.split("/").pop() || readResult.filePath
      : "file";
    const sourceLabel = readResult.source === "knowledge_base"
      ? ` (Knowledge Base${readResult.documentTitle ? `: ${readResult.documentTitle}` : ""})`
      : "";
    const lineInfo = readResult.lineRange
      ? `Lines ${readResult.lineRange}${readResult.totalLines ? ` of ${readResult.totalLines}` : ""}`
      : readResult.totalLines
        ? `${readResult.totalLines} lines`
        : "";
    const truncatedLabel = readResult.truncated ? " (truncated)" : "";

    // For readFile, allow a much larger display limit since users explicitly requested this content
    const content = readResult.content || "";
    const READ_FILE_DISPLAY_LIMIT = 20_000;
    const displayContent = content.length > READ_FILE_DISPLAY_LIMIT
      ? content.substring(0, READ_FILE_DISPLAY_LIMIT) + `\n\n... [${(content.length - READ_FILE_DISPLAY_LIMIT).toLocaleString()} more characters — full content available to AI]`
      : content;

    return (
      <div className={cn("font-mono", TOOL_RESULT_TEXT_CLASS)}>
        <div className="flex items-center gap-2 mb-2 text-terminal-dark">
          <span className="font-medium">{fileName}</span>
          {readResult.language && (
            <span className="text-xs text-terminal-muted">({readResult.language})</span>
          )}
          {sourceLabel && (
            <span className="text-xs text-terminal-muted">{sourceLabel}</span>
          )}
        </div>
        {lineInfo && (
          <p className="text-xs text-terminal-muted mb-2">
            {lineInfo}{truncatedLabel}
          </p>
        )}
        {displayContent && (
          <pre className={cn("mt-1 max-h-96 overflow-y-auto", TOOL_RESULT_PRE_CLASS)}>
            {displayContent}
          </pre>
        )}
      </div>
    );
  }

  // Handle localGrep results
  if (canonicalToolName === "localGrep") {
    const grepResult = normalizedResult as ToolResult & {
      matchCount?: number;
      pattern?: string;
      results?: string;
      matches?: Array<{ file: string; line: number; text: string }>;
      searchedPaths?: string[];
    };

    if (grepResult.status === "error") {
      return (
        <div className={cn("font-mono", TOOL_RESULT_TEXT_CLASS)}>
          <p className="mb-2 text-red-600">{tResults("searchFailed")}</p>
          <pre className={TOOL_RESULT_ERROR_PRE_CLASS}>
            {grepResult.error || "Unknown localGrep error"}
          </pre>
        </div>
      );
    }

    // Handle no_paths or disabled status
    if (grepResult.status === "no_paths" || grepResult.status === "disabled") {
      return (
        <div className={TOOL_RESULT_TEXT_CLASS}>
          {grepResult.message || tResults("noPathsToSearch")}
        </div>
      );
    }

    // Handle success with results
    if (grepResult.matchCount !== undefined) {
      return (
        <div className={cn("font-mono", TOOL_RESULT_TEXT_CLASS)}>
          <p className="text-terminal-dark mb-2">
            {tResults("matchesFound", { count: grepResult.matchCount ?? 0, pattern: grepResult.pattern ?? "" })}
          </p>
          {grepResult.results && (
            <pre className={cn("mt-2 max-h-64", TOOL_RESULT_PRE_CLASS)}>
              {grepResult.results}
            </pre>
          )}
        </div>
      );
    }

    // Fallback for other localGrep statuses
    return (
      <div className={TOOL_RESULT_TEXT_CLASS}>
        {grepResult.message || tResults("searchCompleted")}
      </div>
    );
  }

  // Show generated videos
  if (normalizedResult.videos && normalizedResult.videos.length > 0) {
    return (
      <div className="mt-2 animate-in fade-in zoom-in-95 duration-200">
        <div className="space-y-4">
          {normalizedResult.videos.map((video, idx) => (
            <div key={idx} className="relative">
              <video
                src={video.url}
                controls
                width={video.width || undefined}
                height={video.height || undefined}
                className="w-full max-w-lg h-auto rounded-lg shadow-sm"
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
              <div className="mt-1 flex items-center gap-2 text-xs text-terminal-muted font-mono">
                {video.duration && <span>{video.duration}s</span>}
                {video.fps && <span>• {video.fps} fps</span>}
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto hover:text-terminal-green"
                >
                  Open in new tab ↗
                </a>
              </div>
            </div>
          ))}
        </div>
        {normalizedResult.timeTaken && (
          <p className="mt-2 text-xs text-terminal-muted font-mono">
            Generated in {normalizedResult.timeTaken.toFixed(1)}s
          </p>
        )}
      </div>
    );
  }

  // Show generated images
  if (normalizedResult.images && normalizedResult.images.length > 0) {
    return (
      <div className="mt-2 animate-in fade-in zoom-in-95 duration-200">
        <div className="image-grid">
          {normalizedResult.images.map((img, idx) => (
            <a
              key={idx}
              href={img.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={img.url}
                alt={`Generated image ${idx + 1}`}
                width={img.width || undefined}
                height={img.height || undefined}
                className="w-full h-auto rounded-lg shadow-sm hover:shadow-md transition-shadow"
                loading="eager"
              />
            </a>
          ))}
        </div>
        {normalizedResult.text && (
          <p className={cn("mt-2", TOOL_RESULT_TEXT_CLASS)}>{normalizedResult.text}</p>
        )}
      </div>
    );
  }

  if (typeof normalizedResult.stdout === "string" || typeof normalizedResult.stderr === "string") {
    return (
      <div className="mt-2 space-y-2 transition-opacity duration-150">
        {normalizedResult.stdout && (
          <pre className={cn("max-h-64", TOOL_RESULT_PRE_CLASS)}>
            {normalizedResult.stdout}
          </pre>
        )}
        {normalizedResult.stderr && (
          <pre className={cn("max-h-64", TOOL_RESULT_ERROR_PRE_CLASS)}>
            {normalizedResult.stderr}
          </pre>
        )}
      </div>
    );
  }

  // Show batch results
  if (Array.isArray(normalizedResult.results) && normalizedResult.results.length > 0) {
    return (
      <div className="mt-2 space-y-4 transition-opacity duration-150">
        {normalizedResult.results.map((item, idx) => (
          <div key={idx} className="pt-4 first:pt-0">
            {item.prompt && (
              <p className="text-xs text-terminal-muted mb-2 font-mono">
                Variation {idx + 1}: {item.prompt.slice(0, 50)}...
              </p>
            )}
            {!item.prompt && (
              <p className="text-xs text-terminal-muted mb-2 font-mono">
                Variation {idx + 1}
              </p>
            )}
            {item.status === "completed" && item.images && (
              <div className="image-grid">
                {item.images.map((img, imgIdx) => (
                  <a
                    key={imgIdx}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={img.url}
                      alt={`Variation ${idx + 1} - ${imgIdx + 1}`}
                      width={img.width || undefined}
                      height={img.height || undefined}
                      className="w-full h-auto rounded-lg shadow-sm hover:shadow-md transition-shadow"
                      loading="eager"
                    />
                  </a>
                ))}
              </div>
            )}
            {item.status === "error" && (
              <p className="text-sm text-red-600 font-mono">{item.error}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (normalizedResult.results && !Array.isArray(normalizedResult.results)) {
    return (
      <div className={cn("mt-2", TOOL_RESULT_TEXT_CLASS)}>
        <pre className={cn("max-h-64", TOOL_RESULT_PRE_CLASS)}>
          {formatResultValue(normalizedResult.results)}
        </pre>
      </div>
    );
  }

  // Fallback for generic text/content results (e.g., MCP tools like take_snapshot)
  const textContent = normalizedResult.text || (normalizedResult as { content?: string }).content;
  if (textContent && typeof textContent === "string") {
    // Truncate very long results for display (full result is still available to AI)
    const displayText = textContent.length > 2000
      ? textContent.substring(0, 2000) + `\n\n... [${textContent.length - 2000} more characters]`
      : textContent;
    return (
      <div className={cn("mt-2", TOOL_RESULT_TEXT_CLASS)}>
        <pre className={cn("max-h-64", TOOL_RESULT_PRE_CLASS)}>
          {displayText}
        </pre>
      </div>
    );
  }

  // Final defensive fallback: render unknown object-shaped outputs so the UI
  // never appears empty when a tool completed but returned an unrecognized schema.
  const genericSummary =
    typeof (normalizedResult as { summary?: unknown }).summary === "string"
      ? ((normalizedResult as { summary?: string }).summary ?? "")
      : "";
  if (genericSummary.trim().length > 0) {
    return (
      <div className={cn("mt-2", TOOL_RESULT_TEXT_CLASS)}>
        <pre className={cn("max-h-64", TOOL_RESULT_PRE_CLASS)}>
        {genericSummary}
      </pre>
    </div>
  );
}

return (
  <div className={cn("mt-2", TOOL_RESULT_TEXT_CLASS)}>
    <pre className={cn("max-h-64", TOOL_RESULT_PRE_CLASS)}>
      {formatResultValue(normalizedResult)}
    </pre>
  </div>
);
});
ToolResultDisplay.displayName = "ToolResultDisplay";

let toolNameCache: Record<string, string> | null = null;
let toolNameCachePromise: Promise<Record<string, string>> | null = null;

async function loadToolNameCache(): Promise<Record<string, string>> {
  if (toolNameCache) return toolNameCache;
  if (toolNameCachePromise) return toolNameCachePromise;

  toolNameCachePromise = resilientFetch<{
    tools?: Array<{ id: string; displayName: string }>;
  }>("/api/tools?includeDisabled=true&includeAlwaysLoad=true")
    .then(({ data }) => {
      const map: Record<string, string> = {};
      (data?.tools || []).forEach((tool) => {
        if (tool.id && tool.displayName) {
          map[tool.id] = tool.displayName;
        }
      });
      toolNameCache = map;
      return map;
    })
    .catch(() => {
      toolNameCache = {};
      return toolNameCache;
    });

  return toolNameCachePromise;
}

// Main component with memo
export const ToolFallback: ToolCallContentPartComponent = memo(({
  toolName,
  argsText,
  result,
}) => {
  const t = useTranslations("assistantUi.tools");
  const isRunning = result === undefined;
  const parsedResult = result as ToolResult | undefined;
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  // Memoize the display name lookup
  const displayName = useMemo(() => {
    return t.has(toolName) ? t(toolName) : (resolvedName || toolName);
  }, [t, toolName, resolvedName]);

  useEffect(() => {
    let cancelled = false;
    if (t.has(toolName)) {
      setResolvedName(null);
      return;
    }
    loadToolNameCache().then((cache) => {
      if (cancelled) return;
      setResolvedName(cache[toolName] || null);
    });
    return () => {
      cancelled = true;
    };
  }, [toolName, t]);

  // Memoize formatted args
  const formattedArgs = useMemo(() => {
    if (!argsText) return null;
    return formatArgs(argsText);
  }, [argsText]);

  return (
    <div className={cn(
      "my-2 min-w-0 rounded-lg bg-terminal-cream/80 p-4 font-mono shadow-sm transition-all duration-150 ease-in-out [contain:layout_style]",
      isRunning && "min-h-[60px]"
    )}>
      <div className="mb-2 flex min-w-0 items-center gap-2 transition-opacity duration-150">
        <ToolIcon toolName={toolName} isRunning={isRunning} result={parsedResult} />
        <span className="min-w-0 truncate font-medium text-sm text-terminal-dark">
          {displayName}
        </span>
        <ToolStatus isRunning={isRunning} result={parsedResult} />
      </div>

      {/* Show args summary */}
      {formattedArgs && (
        <details className="mb-2 text-xs text-terminal-muted">
          <summary className="cursor-pointer hover:text-terminal-dark">
            View parameters
          </summary>
          <pre className={cn("mt-2 max-h-48 overflow-y-auto", TOOL_RESULT_PRE_CLASS)}>
            {formattedArgs}
          </pre>
        </details>
      )}

      {/* Show result in collapsible section */}
      {parsedResult && (
        hasVisualMedia(parsedResult) ? (
          <ToolResultDisplay toolName={toolName} result={parsedResult} />
        ) : (
          <details className="text-xs text-terminal-muted">
            <summary className="cursor-pointer hover:text-terminal-dark">
              View output
            </summary>
            <ToolResultDisplay toolName={toolName} result={parsedResult} />
          </details>
        )
      )}
    </div>
  );
});
ToolFallback.displayName = "ToolFallback";

function formatArgs(argsText: string): string {
  try {
    const parsed = JSON.parse(argsText);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return argsText;
  }
}

function formatResultValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
