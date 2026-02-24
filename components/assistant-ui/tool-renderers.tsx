"use client";

import type { FC } from "react";

import { ToolFallback } from "./tool-fallback";
import { VectorSearchToolUI } from "./vector-search-inline";
import { ProductGalleryToolUI } from "./product-gallery-inline";
import { ExecuteCommandToolUI } from "./execute-command-tool-ui";
import { EditFileToolUI } from "./edit-file-tool-ui";
import { PatchFileToolUI } from "./patch-file-tool-ui";
import { CalculatorToolUI } from "./calculator-tool-ui";
import { PlanToolUI } from "./plan-tool-ui";
import { SpeakAloudToolUI, TranscribeToolUI } from "./voice-tool-ui";
import { OpenJsonUIRenderer } from "./open-json-ui-renderer";
import { getGenerativeUISpecFromResult } from "@/lib/ai/generative-ui/payload";

import { WebBrowseInline } from "./web-browse-inline";

/**
 * Assistant-ui accepts heterogeneous per-tool component signatures.
 * Keep registry typing permissive so specialized components can be registered
 * without wrapper boilerplate.
 */
export type AnyToolRenderer = FC<any>;

interface WebBrowseResult {
  status?: "success" | "error" | "no_content" | "no_api_key";
  synthesis?: string;
  fetchedUrls?: string[];
  failedUrls?: string[];
  message?: string;
  error?: string;
}

interface WebBrowseArgs {
  query?: string;
  urls?: string[] | string;
}

function normalizeWebBrowseUrls(args?: WebBrowseArgs): string[] {
  if (!args?.urls) return [];
  if (Array.isArray(args.urls)) return args.urls;
  return args.urls
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Lightweight specialized renderer for webBrowse/webQuery output.
 * It reuses the compact progress component for final source listing and
 * shows synthesized answer text in a readable block.
 */
const WebBrowseToolUI: AnyToolRenderer = ({ args, result }: { args?: unknown; result?: unknown }) => {
  if (!result) {
    return (
      <WebBrowseInline
        phase="fetching"
        phaseMessage="Fetching pages"
        fetchedPages={[]}
        error={null}
      />
    );
  }

  const { spec, meta } = getGenerativeUISpecFromResult(result);
  if (spec) {
    return <OpenJsonUIRenderer toolName="webBrowse" spec={spec} meta={meta} />;
  }

  const typedResult = result as WebBrowseResult;
  const typedArgs = (args || {}) as WebBrowseArgs;

  if (typedResult.status === "error") {
    return (
      <WebBrowseInline
        phase="error"
        phaseMessage={typedResult.message || "Web browse failed"}
        fetchedPages={[]}
        error={typedResult.error || typedResult.message || "Unknown error"}
      />
    );
  }

  if (typedResult.status === "no_api_key" || typedResult.status === "no_content") {
    return (
      <div className="rounded bg-terminal-dark/5 p-2 text-xs text-terminal-muted font-mono [overflow-wrap:anywhere]">
        {typedResult.message || "Web browse is unavailable for this request."}
      </div>
    );
  }

  const fetchedUrls = typedResult.fetchedUrls || [];
  const fallbackUrls = normalizeWebBrowseUrls(typedArgs);
  const urls = fetchedUrls.length > 0 ? fetchedUrls : fallbackUrls;

  const fetchedPages = urls.map((url) => ({
    type: "content_fetched" as const,
    url,
    title: url,
    contentLength: 0,
    timestamp: new Date(0),
  }));

  return (
    <div className="space-y-2">
      <WebBrowseInline
        phase="complete"
        phaseMessage="Synthesis complete"
        fetchedPages={fetchedPages}
        error={null}
      />
      {typedResult.synthesis ? (
        <div className="rounded bg-terminal-dark/5 p-2 text-sm text-terminal-dark font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {typedResult.synthesis}
        </div>
      ) : null}
    </div>
  );
};

/**
 * Specialized wrapper for workspace status and metadata updates.
 * Falls back to the generic renderer for unsupported result payloads.
 */
const WorkspaceToolUI: AnyToolRenderer = ({ result }: { result?: unknown }) => {
  if (!result || typeof result !== "object") {
    return <ToolFallback toolName="workspace" result={result} />;
  }

  const { spec, meta } = getGenerativeUISpecFromResult(result);
  if (spec) {
    return <OpenJsonUIRenderer toolName="workspace" spec={spec} meta={meta} />;
  }

  const r = result as {
    status?: string;
    message?: string;
    error?: string;
    workspace?: {
      branch?: string;
      baseBranch?: string;
      worktreePath?: string;
      status?: string;
      changedFiles?: number;
      prUrl?: string;
      prNumber?: number;
    };
  };

  if (r.status === "error") {
    return (
      <div className="rounded bg-red-50 p-2 text-sm text-red-600 font-mono [overflow-wrap:anywhere]">
        {r.error || r.message || "Workspace operation failed."}
      </div>
    );
  }

  const ws = r.workspace;
  if (!ws) {
    return (
      <div className="rounded bg-terminal-dark/5 p-2 text-xs text-terminal-muted font-mono [overflow-wrap:anywhere]">
        {r.message || "Workspace operation completed."}
      </div>
    );
  }

  return (
    <div className="rounded border border-terminal-dark/10 bg-terminal-cream/60 p-3 font-mono text-xs space-y-1">
      <div className="text-terminal-dark">
        branch: <span className="font-semibold">{ws.branch || "(unknown)"}</span>
      </div>
      {ws.baseBranch ? (
        <div className="text-terminal-muted">base: {ws.baseBranch}</div>
      ) : null}
      {ws.worktreePath ? (
        <div className="text-terminal-muted truncate" title={ws.worktreePath}>
          path: {ws.worktreePath}
        </div>
      ) : null}
      {typeof ws.changedFiles === "number" ? (
        <div className="text-terminal-muted">changed files: {ws.changedFiles}</div>
      ) : null}
      {ws.prUrl ? (
        <a
          href={ws.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-terminal-green hover:underline"
        >
          PR #{ws.prNumber || "?"}
        </a>
      ) : null}
      {r.message ? <div className="text-terminal-muted">{r.message}</div> : null}
    </div>
  );
};

/**
 * Renderer map for all known tool names.
 *
 * We explicitly include every tool currently registered in the tool registry,
 * using specialized components where they add UX value and ToolFallback
 * for the rest to keep behavior consistent and scalable.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "[unserializable result]";
  }
}

function withGenerativeUi(toolName: string, Renderer: AnyToolRenderer): AnyToolRenderer {
  const Wrapped: AnyToolRenderer = (props: { result?: unknown }) => {
    const { spec, meta } = getGenerativeUISpecFromResult(props?.result);
    if (spec) {
      return (
        <div className="space-y-2">
          <OpenJsonUIRenderer toolName={toolName} spec={spec} meta={meta} />
          {props?.result ? (
            <details className="text-xs text-terminal-muted">
              <summary className="cursor-pointer hover:text-terminal-dark">View raw</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-terminal-dark/5 p-2 text-xs font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-terminal-dark">
                {safeStringify(props.result)}
              </pre>
            </details>
          ) : null}
        </div>
      );
    }
    return <Renderer {...props} />;
  };

  Wrapped.displayName = `WithGenerativeUi(${toolName})`;
  return Wrapped;
}

export const ASSISTANT_TOOL_RENDERERS_BY_NAME = {
  searchTools: ToolFallback,
  listAllTools: ToolFallback,
  retrieveFullContent: ToolFallback,
  compactSession: ToolFallback,
  docsSearch: ToolFallback,
  vectorSearch: withGenerativeUi("vectorSearch", VectorSearchToolUI),
  webSearch: withGenerativeUi("webSearch", ToolFallback),
  readFile: ToolFallback,
  localGrep: ToolFallback,
  executeCommand: withGenerativeUi("executeCommand", ExecuteCommandToolUI),
  editFile: withGenerativeUi("editFile", EditFileToolUI),
  writeFile: withGenerativeUi("writeFile", EditFileToolUI),
  patchFile: withGenerativeUi("patchFile", PatchFileToolUI),
  scheduleTask: ToolFallback,
  runSkill: ToolFallback,
  updateSkill: ToolFallback,
  memorize: ToolFallback,
  calculator: withGenerativeUi("calculator", CalculatorToolUI),
  updatePlan: withGenerativeUi("updatePlan", PlanToolUI),
  workspace: WorkspaceToolUI,
  speakAloud: SpeakAloudToolUI,
  transcribe: TranscribeToolUI,
  sendMessageToChannel: ToolFallback,
  delegateToSubagent: ToolFallback,
  describeImage: ToolFallback,
  firecrawlCrawl: ToolFallback,
  webBrowse: WebBrowseToolUI,
  webQuery: WebBrowseToolUI,
  generateImageZImage: ToolFallback,
  generateImageFlux2Klein4B: ToolFallback,
  editImageFlux2Klein4B: ToolFallback,
  referenceImageFlux2Klein4B: ToolFallback,
  generateImageFlux2Klein9B: ToolFallback,
  editImageFlux2Klein9B: ToolFallback,
  referenceImageFlux2Klein9B: ToolFallback,
  editImage: ToolFallback,
  generateImageFlux2: ToolFallback,
  generateImageWan22: ToolFallback,
  generateVideoWan22: ToolFallback,
  generatePixelVideoWan22: ToolFallback,
  generateImageFlux2Flex: ToolFallback,
  editImageFlux2Flex: ToolFallback,
  referenceImageFlux2Flex: ToolFallback,
  generateImageGpt5Mini: ToolFallback,
  editImageGpt5Mini: ToolFallback,
  referenceImageGpt5Mini: ToolFallback,
  generateImageGpt5: ToolFallback,
  editImageGpt5: ToolFallback,
  referenceImageGpt5: ToolFallback,
  generateImageGemini25Flash: ToolFallback,
  editImageGemini25Flash: ToolFallback,
  referenceImageGemini25Flash: ToolFallback,
  generateImageGemini3Pro: ToolFallback,
  editImageGemini3Pro: ToolFallback,
  referenceImageGemini3Pro: ToolFallback,
  assembleVideo: ToolFallback,
  showProductImages: ProductGalleryToolUI,
} satisfies Record<string, AnyToolRenderer>;
