type ToolResultNormalization = {
  output: Record<string, unknown>;
  summary: string;
  status: string;
  error?: string;
};

const MAX_TOOL_SUMMARY_LENGTH = 280;

function truncateSummary(text: string, maxLength: number = MAX_TOOL_SUMMARY_LENGTH): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 3) + "...";
}

function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function summarizeToolKeys(result: Record<string, unknown>): string {
  const keys = Object.keys(result)
    .filter((key) => !["content", "summary", "error", "status", "metadata"].includes(key))
    .sort()
    .slice(0, 4);
  if (keys.length === 0) return "";
  return ` keys=${keys.join(", ")}`;
}

export function buildToolSummary(toolName: string, input?: unknown, output?: unknown): string {
  const safeName = toolName || "tool";

  if (output === null || output === undefined) {
    return `${safeName}: no output returned`;
  }

  if (typeof output !== "object" || Array.isArray(output)) {
    return `${safeName}: returned ${typeof output}`;
  }

  const result = output as Record<string, unknown>;
  const inputObj = getRecord(input);
  const status = getString(result.status);
  const error = getString(result.error) || getString(result.message);

  if (error) {
    const statusTag = status ? ` (${status})` : "";
    return `${safeName}${statusTag} failed: ${error}`;
  }

  switch (safeName) {
    case "readFile": {
      const filePath = getString(result.filePath) || getString(result.path) || "file";
      const lineRange = getString(result.lineRange) || "?";
      const totalLines = getNumber(result.totalLines);
      const truncated = Boolean(result.truncated);
      const totalText = totalLines ? ` of ${totalLines}` : "";
      const truncatedText = truncated ? " (truncated)" : "";
      return `Read ${filePath}: lines ${lineRange}${totalText}${truncatedText}`;
    }
    case "localGrep": {
      const pattern =
        getString(result.pattern) ||
        getString(inputObj?.pattern) ||
        getString(inputObj?.query) ||
        "pattern";
      const matchCount =
        getNumber(result.matchCount) ||
        (Array.isArray(result.matches) ? result.matches.length : undefined) ||
        0;
      const totalMatchCount = getNumber(result.totalMatchCount);
      const wasTruncated = Boolean(result.wasTruncated);
      const fileCount = Array.isArray(result.matches)
        ? new Set(result.matches.map((m) => getRecord(m)?.file).filter(Boolean)).size
        : undefined;
      const totalText =
        totalMatchCount && totalMatchCount !== matchCount
          ? ` (${totalMatchCount} total)`
          : "";
      const fileText = fileCount ? ` in ${fileCount} files` : "";
      const truncatedText = wasTruncated ? " (truncated)" : "";
      return `Grep "${pattern}": ${matchCount} matches${totalText}${fileText}${truncatedText}`;
    }
    case "vectorSearch": {
      const summary = getString(result.summary);
      if (summary) return summary;
      const findings = Array.isArray(result.findings) ? result.findings.length : 0;
      return `Vector search: ${findings} findings`;
    }
    case "docsSearch": {
      const query = getString(result.query) || getString(inputObj?.query) || "query";
      const hitCount =
        getNumber(result.hitCount) ||
        (Array.isArray(result.hits) ? result.hits.length : 0);
      return `Docs search "${query}": ${hitCount} hits`;
    }
    case "webSearch": {
      const query = getString(result.query) || getString(inputObj?.query) || "query";
      const sources = Array.isArray(result.sources) ? result.sources.length : 0;
      const answer = getString(result.answer);
      const answerText = answer ? `; answer: ${truncateSummary(answer, 120)}` : "";
      return `Web search "${query}": ${sources} sources${answerText}`;
    }
    case "webBrowse":
    case "webQuery": {
      const fetched =
        (Array.isArray(result.fetchedUrls) ? result.fetchedUrls.length : 0) ||
        (Array.isArray(result.sourcesUsed) ? result.sourcesUsed.length : 0);
      const synthesis = getString(result.synthesis);
      const synthesisText = synthesis ? `; synthesis: ${truncateSummary(synthesis, 120)}` : "";
      return `${safeName}: fetched ${fetched} URL${fetched === 1 ? "" : "s"}${synthesisText}`;
    }
    case "executeCommand": {
      const command = getString(inputObj?.command) || getString(result.command) || "command";
      const exitCode = getNumber(result.exitCode);
      const stdoutLen = getString(result.stdout)?.length || 0;
      const stderrLen = getString(result.stderr)?.length || 0;
      const statusTag = status ? ` ${status}` : "";
      const exitText = exitCode !== undefined ? ` (exit ${exitCode})` : "";
      return `Command "${command}":${statusTag}${exitText}, stdout ${stdoutLen} chars, stderr ${stderrLen} chars`;
    }
    case "searchTools": {
      const query = getString(result.query) || getString(inputObj?.query) || "query";
      const results = Array.isArray(result.results) ? result.results.length : 0;
      return `Tool search "${query}": ${results} result${results === 1 ? "" : "s"}`;
    }
    case "listAllTools": {
      const results = Array.isArray(result.results) ? result.results.length : undefined;
      return results !== undefined
        ? `Tool list: ${results} tool${results === 1 ? "" : "s"}`
        : "Tool list returned";
    }
    case "retrieveFullContent": {
      const contentId = getString(result.contentId) || getString(inputObj?.contentId);
      return contentId ? `Retrieved full content (${contentId})` : "Retrieved full content";
    }
    default: {
      const statusTag = status ? ` (${status})` : "";
      const keys = summarizeToolKeys(result);
      return `${safeName}${statusTag}:${keys || " completed"}`;
    }
  }
}

export function getToolSummaryFromOutput(toolName: string, output?: unknown, input?: unknown): string {
  const resultObj = getRecord(output);
  const summary = getString(resultObj?.summary);
  if (summary) {
    return truncateSummary(summary);
  }
  return truncateSummary(buildToolSummary(toolName, input, output));
}

export function normalizeToolResultOutput(
  toolName: string,
  output: unknown,
  input?: unknown
): ToolResultNormalization {
  if (output === null || output === undefined) {
    const error = "Tool returned no output.";
    const summary = truncateSummary(buildToolSummary(toolName, input, { status: "error", error }));
    return {
      output: { status: "error", error, summary },
      summary,
      status: "error",
      error,
    };
  }

  if (typeof output !== "object" || Array.isArray(output)) {
    const summary = truncateSummary(buildToolSummary(toolName, input, output));
    return {
      output: { status: "success", content: output, summary },
      summary,
      status: "success",
    };
  }

  const result = { ...(output as Record<string, unknown>) };
  const error = getString(result.error);
  let summary = getString(result.summary);
  if (!summary) {
    summary = truncateSummary(buildToolSummary(toolName, input, result));
    result.summary = summary;
  }
  if (!("content" in result) && !("summary" in result) && !("error" in result)) {
    result.summary = summary;
  }
  if (!("status" in result)) {
    result.status = error ? "error" : "success";
  }

  return {
    output: result,
    summary,
    status: String(result.status ?? (error ? "error" : "success")),
    error,
  };
}

export function isMissingToolResult(output: unknown): boolean {
  return output === null || output === undefined;
}
