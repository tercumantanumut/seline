"use client";

import { memo, useEffect, useMemo, useState, type FC } from "react";
import { Loader2Icon, CheckCircleIcon, XCircleIcon, ImageIcon, VideoIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { resilientFetch } from "@/lib/utils/resilient-fetch";

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
  status: "completed" | "processing" | "error" | "success" | "no_results" | "no_api_key" | "no_paths" | "disabled";
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

// Memoized Icon Component
const ToolIcon: FC<{
  toolName: string;
  isRunning: boolean;
  result?: ToolResult;
}> = memo(({ toolName, isRunning, result }) => {
  const iconClass = "size-4 transition-all duration-150";

  if (isRunning) {
    return <Loader2Icon className={`${iconClass} animate-spin text-terminal-green`} />;
  }

  if (result?.status === "error") {
    return <XCircleIcon className={`${iconClass} text-red-600`} />;
  }

  if (toolName === "searchTools" || toolName === "listAllTools" || toolName === "webSearch") {
    return <SearchIcon className={`${iconClass} text-terminal-green`} />;
  }

  if (toolName.includes("Video") || toolName.includes("video")) {
    return <VideoIcon className={`${iconClass} text-terminal-green`} />;
  }

  if (toolName.includes("Image") || toolName.includes("image")) {
    return <ImageIcon className={`${iconClass} text-terminal-green`} />;
  }

  return <CheckCircleIcon className={`${iconClass} text-terminal-green`} />;
});
ToolIcon.displayName = "ToolIcon";

// Memoized Status Component
const ToolStatus: FC<{ isRunning: boolean; result?: ToolResult }> = memo(({
  isRunning,
  result,
}) => {
  if (isRunning) {
    return (
      <span className="text-xs text-terminal-muted font-mono transition-opacity duration-150">Processing...</span>
    );
  }

  if (result?.status === "error") {
    return <span className="text-xs text-red-600 font-mono transition-opacity duration-150">Failed</span>;
  }

  if (result?.status === "processing") {
    return <span className="text-xs text-terminal-amber font-mono transition-opacity duration-150">Queued</span>;
  }

  return <span className="text-xs text-terminal-green font-mono transition-opacity duration-150">Completed</span>;
});
ToolStatus.displayName = "ToolStatus";

// Memoized Result Display Component
const ToolResultDisplay: FC<{ toolName: string; result: ToolResult }> = memo(({ toolName, result }) => {
  if (result.status === "error") {
    return (
      <div className="text-sm text-red-600 bg-red-50 rounded p-2 font-mono transition-all duration-150">
        {result.error || "An error occurred"}
      </div>
    );
  }

  if (result.status === "processing") {
    return (
      <div className="text-sm text-terminal-muted font-mono transition-all duration-150">
        Generation has been queued. Job ID: {result.jobId}
      </div>
    );
  }

  // Handle searchTools results
  if (toolName === "searchTools") {
    const rawResults = (result as { results?: unknown }).results;
    const searchResults = Array.isArray(rawResults) ? rawResults as Array<{
      name?: string;
      displayName?: string;
      category?: string;
      description?: string;
      isAvailable?: boolean;
    }> : undefined;

    if (rawResults !== undefined && !Array.isArray(rawResults)) {
      return (
        <div className="text-sm text-terminal-muted font-mono transition-opacity duration-150">
          Unexpected tool search results format.
          <pre className="mt-2 overflow-x-auto max-h-64 rounded bg-terminal-dark/5 p-2 text-xs whitespace-pre-wrap break-words text-terminal-dark">
            {formatResultValue(rawResults)}
          </pre>
        </div>
      );
    }

    if (result.status === "no_results" || !searchResults || searchResults.length === 0) {
      return (
        <div className="text-sm text-terminal-muted font-mono transition-opacity duration-150">
          No tools found matching &quot;{result.query}&quot;
        </div>
      );
    }

    const toolNames = searchResults.map(t => t.displayName || t.name).filter(Boolean);
    return (
      <div className="text-sm font-mono transition-opacity duration-150">
        <p className="text-terminal-dark mb-2">
          Found {searchResults.length} tool{searchResults.length !== 1 ? "s" : ""}: {toolNames.join(", ")}
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
  if (toolName === "listAllTools") {
    return (
      <div className="text-sm text-terminal-dark font-mono transition-opacity duration-150">
        {result.message || "Tools listed successfully"}
      </div>
    );
  }

  // Handle webSearch results
  if (toolName === "webSearch") {
    // Handle error/no_api_key states
    if (result.status === "no_api_key" || result.message) {
      return (
        <div className="text-sm text-terminal-muted font-mono transition-opacity duration-150">
          {result.message || "Web search unavailable"}
        </div>
      );
    }

    // Display search results with links
    const sources = result.sources || [];
    if (sources.length === 0) {
      return (
        <div className="text-sm text-terminal-muted font-mono transition-opacity duration-150">
          No results found for &quot;{result.query}&quot;
        </div>
      );
    }

    return (
      <div className="text-sm font-mono space-y-3 transition-opacity duration-150">
        {/* Summary/Answer */}
        {result.answer && (
          <div className="text-terminal-dark bg-terminal-dark/5 rounded p-2">
            <span className="font-medium">Summary:</span> {result.answer}
          </div>
        )}

        {/* Sources with clickable links */}
        <div className="space-y-2">
          <span className="text-terminal-muted text-xs">
            {sources.length} source{sources.length !== 1 ? "s" : ""} found:
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

  // Handle localGrep results
  if (toolName === "localGrep") {
    const grepResult = result as ToolResult & {
      matchCount?: number;
      pattern?: string;
      results?: string;
      matches?: Array<{ file: string; line: number; text: string }>;
      searchedPaths?: string[];
    };

    // Handle no_paths or disabled status
    if (grepResult.status === "no_paths" || grepResult.status === "disabled") {
      return (
        <div className="text-sm text-terminal-muted font-mono transition-opacity duration-150">
          {grepResult.message || "No paths to search"}
        </div>
      );
    }

    // Handle success with results
    if (grepResult.matchCount !== undefined) {
      return (
        <div className="text-sm font-mono transition-opacity duration-150">
          <p className="text-terminal-dark mb-2">
            Found {grepResult.matchCount} match{grepResult.matchCount !== 1 ? "es" : ""} for &quot;{grepResult.pattern}&quot;
          </p>
          {grepResult.results && (
            <pre className="mt-2 overflow-x-auto max-h-64 rounded bg-terminal-dark/5 p-2 text-xs whitespace-pre-wrap break-words text-terminal-dark">
              {grepResult.results}
            </pre>
          )}
        </div>
      );
    }

    // Fallback for other localGrep statuses
    return (
      <div className="text-sm text-terminal-muted font-mono transition-opacity duration-150">
        {grepResult.message || "Search completed"}
      </div>
    );
  }

  // Show generated videos
  if (result.videos && result.videos.length > 0) {
    return (
      <div className="mt-2 animate-in fade-in zoom-in-95 duration-200">
        <div className="space-y-4">
          {result.videos.map((video, idx) => (
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
        {result.timeTaken && (
          <p className="mt-2 text-xs text-terminal-muted font-mono">
            Generated in {result.timeTaken.toFixed(1)}s
          </p>
        )}
      </div>
    );
  }

  // Show generated images
  if (result.images && result.images.length > 0) {
    return (
      <div className="mt-2 animate-in fade-in zoom-in-95 duration-200">
        <div className="image-grid">
          {result.images.map((img, idx) => (
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
        {result.text && (
          <p className="mt-2 text-sm text-terminal-muted font-mono">{result.text}</p>
        )}
      </div>
    );
  }

  if (typeof result.stdout === "string" || typeof result.stderr === "string") {
    return (
      <div className="mt-2 space-y-2 transition-opacity duration-150">
        {result.stdout && (
          <pre className="overflow-x-auto max-h-64 rounded bg-terminal-dark/5 p-2 text-xs whitespace-pre-wrap break-words text-terminal-dark">
            {result.stdout}
          </pre>
        )}
        {result.stderr && (
          <pre className="overflow-x-auto max-h-64 rounded bg-red-50 p-2 text-xs whitespace-pre-wrap break-words text-red-600">
            {result.stderr}
          </pre>
        )}
      </div>
    );
  }

  // Show batch results
  if (Array.isArray(result.results) && result.results.length > 0) {
    return (
      <div className="mt-2 space-y-4 transition-opacity duration-150">
        {result.results.map((item, idx) => (
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

  if (result.results && !Array.isArray(result.results)) {
    return (
      <div className="mt-2 text-sm text-terminal-muted font-mono transition-opacity duration-150">
        <pre className="overflow-x-auto max-h-64 rounded bg-terminal-dark/5 p-2 text-xs whitespace-pre-wrap break-words text-terminal-dark">
          {formatResultValue(result.results)}
        </pre>
      </div>
    );
  }

  // Fallback for generic text/content results (e.g., MCP tools like take_snapshot)
  const textContent = result.text || (result as { content?: string }).content;
  if (textContent && typeof textContent === "string") {
    // Truncate very long results for display (full result is still available to AI)
    const displayText = textContent.length > 2000
      ? textContent.substring(0, 2000) + `\n\n... [${textContent.length - 2000} more characters]`
      : textContent;
    return (
      <div className="mt-2 text-sm text-terminal-muted font-mono transition-opacity duration-150">
        <pre className="overflow-x-auto max-h-64 rounded bg-terminal-dark/5 p-2 text-xs whitespace-pre-wrap break-words text-terminal-dark">
          {displayText}
        </pre>
      </div>
    );
  }

  return null;
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
      "my-2 rounded-lg bg-terminal-cream/80 shadow-sm p-4 font-mono transition-all duration-150 ease-in-out [contain:layout_style]",
      isRunning && "min-h-[60px]"
    )}>
      <div className="flex items-center gap-2 mb-2 transition-opacity duration-150">
        <ToolIcon toolName={toolName} isRunning={isRunning} result={parsedResult} />
        <span className="font-medium text-sm text-terminal-dark">
          {displayName}
        </span>
        <ToolStatus isRunning={isRunning} result={parsedResult} />
      </div>

      {/* Show args summary */}
      {formattedArgs && (
        <details className="text-xs text-terminal-muted mb-2">
          <summary className="cursor-pointer hover:text-terminal-dark">
            View parameters
          </summary>
          <pre className="mt-2 overflow-y-auto max-h-48 rounded bg-terminal-dark/5 p-2 text-xs whitespace-pre-wrap break-words text-terminal-dark">
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
