import type { GenerativeUISpec, GenerativeUINode } from "./spec";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function makeSpec(title: string, description: string | undefined, root: GenerativeUINode): GenerativeUISpec {
  return {
    version: "open-json-ui/v1",
    title,
    ...(description ? { description } : {}),
    root,
  };
}

function buildWebSearchSpec(result: Record<string, unknown>): GenerativeUISpec | undefined {
  const sources = asArray<Record<string, unknown>>(result.sources);
  if (sources.length === 0) return undefined;

  const rows = sources.slice(0, 8).map((source) => {
    const title = asString(source.title) || "Untitled";
    const url = asString(source.url) || "";
    const relevance = asNumber(source.relevanceScore);
    return [title, url, relevance ?? null];
  });

  const answer = asString(result.answer);
  const query = asString(result.query);

  const children: GenerativeUINode[] = [
    {
      type: "card",
      title: "Sources",
      subtitle: `${sources.length} results`,
      children: [
        {
          type: "table",
          columns: ["Title", "URL", "Relevance"],
          rows,
        },
      ],
    },
  ];

  if (answer) {
    children.unshift({
      type: "card",
      title: "Summary",
      tone: "info",
      children: [{ type: "text", text: answer, variant: "body" }],
    });
  }

  return makeSpec("Web Search Results", query, { type: "stack", gap: "md", children });
}

function buildWebBrowseSpec(result: Record<string, unknown>): GenerativeUISpec | undefined {
  const synthesis = asString(result.synthesis);
  const fetchedUrls = asArray<string>(result.fetchedUrls).filter((url) => typeof url === "string");

  if (!synthesis && fetchedUrls.length === 0) return undefined;

  const children: GenerativeUINode[] = [];

  if (synthesis) {
    children.push({
      type: "card",
      title: "Synthesis",
      children: [{ type: "text", text: synthesis, variant: "body" }],
    });
  }

  if (fetchedUrls.length > 0) {
    children.push({
      type: "card",
      title: "Fetched URLs",
      subtitle: `${fetchedUrls.length} pages`,
      children: [{ type: "list", items: fetchedUrls.slice(0, 10) }],
    });
  }

  return makeSpec("Web Browse Result", undefined, { type: "stack", gap: "md", children });
}

function buildVectorSearchSpec(result: Record<string, unknown>): GenerativeUISpec | undefined {
  const findings = asArray<Record<string, unknown>>(result.findings);
  if (findings.length === 0) return undefined;

  const rows = findings.slice(0, 10).map((finding) => {
    const filePath = asString(finding.filePath) || "unknown";
    const explanation = asString(finding.explanation) || "";
    const confidence = asNumber(finding.confidence);
    return [filePath, explanation, confidence ?? null];
  });

  const summary = asString(result.summary);

  const children: GenerativeUINode[] = [
    {
      type: "card",
      title: "Findings",
      subtitle: `${findings.length} entries`,
      children: [
        {
          type: "table",
          columns: ["File", "Explanation", "Confidence"],
          rows,
        },
      ],
    },
  ];

  if (summary) {
    children.unshift({
      type: "card",
      title: "Summary",
      tone: "info",
      children: [{ type: "text", text: summary }],
    });
  }

  return makeSpec("Vector Search Analysis", undefined, { type: "stack", gap: "md", children });
}

function buildExecuteCommandSpec(result: Record<string, unknown>): GenerativeUISpec | undefined {
  const stdout = asString(result.stdout);
  const stderr = asString(result.stderr);
  const exitCode = asNumber(result.exitCode);
  const status = asString(result.status) || "success";

  if (!stdout && !stderr && exitCode === undefined) return undefined;

  const tone = status === "error" || (typeof exitCode === "number" && exitCode !== 0) ? "danger" : "success";
  const kvItems = [
    { label: "Status", value: status },
    { label: "Exit Code", value: exitCode ?? null },
    { label: "Duration (ms)", value: asNumber(result.executionTime) ?? null },
  ];

  const children: GenerativeUINode[] = [
    {
      type: "card",
      title: "Execution",
      tone,
      children: [{ type: "kv", items: kvItems }],
    },
  ];

  if (stdout) {
    children.push({ type: "card", title: "Stdout", children: [{ type: "text", text: stdout, variant: "code" }] });
  }

  if (stderr) {
    children.push({ type: "card", title: "Stderr", tone: "danger", children: [{ type: "text", text: stderr, variant: "code" }] });
  }

  return makeSpec("Command Result", undefined, { type: "stack", gap: "md", children });
}

function buildPatchLikeSpec(toolName: string, output: Record<string, unknown>): GenerativeUISpec | undefined {
  const content = asString(output.content);
  const summary = asString(output.summary);
  const status = asString(output.status) || "success";

  if (!content && !summary) return undefined;

  const children: GenerativeUINode[] = [
    {
      type: "card",
      title: `${toolName} result`,
      tone: status === "error" ? "danger" : "success",
      children: [
        {
          type: "text",
          text: summary || "Operation completed",
          variant: "body",
        },
      ],
    },
  ];

  if (content) {
    children.push({
      type: "card",
      title: "Content",
      children: [{ type: "text", text: content, variant: "code" }],
    });
  }

  return makeSpec(`${toolName} output`, undefined, { type: "stack", gap: "md", children });
}

function buildPlanSpec(output: Record<string, unknown>): GenerativeUISpec | undefined {
  const steps = asArray<Record<string, unknown>>(output.steps);
  if (steps.length === 0) return undefined;

  const rows = steps.map((step) => [
    asString(step.id) || "-",
    asString(step.text) || "",
    asString(step.status) || "pending",
  ]);

  return makeSpec("Plan", asString(output.explanation), {
    type: "stack",
    gap: "md",
    children: [
      {
        type: "card",
        title: "Workflow steps",
        subtitle: `${steps.length} steps`,
        children: [
          {
            type: "table",
            columns: ["ID", "Step", "Status"],
            rows,
          },
        ],
      },
    ],
  });
}

function buildCalculatorSpec(output: Record<string, unknown>): GenerativeUISpec | undefined {
  const resultValue = output.result;
  const expression = asString(output.expression);
  if (resultValue === undefined) return undefined;

  return makeSpec("Calculation", expression, {
    type: "stack",
    gap: "sm",
    children: [
      {
        type: "card",
        tone: "info",
        children: [
          {
            type: "kv",
            items: [
              { label: "Expression", value: expression || "-" },
              { label: "Result", value: typeof resultValue === "number" ? resultValue : asString(resultValue) || "-" },
            ],
          },
        ],
      },
    ],
  });
}

export function buildAutoGenerativeUISpec(toolName: string, output: unknown): GenerativeUISpec | undefined {
  if (!isRecord(output)) return undefined;

  switch (toolName) {
    case "webSearch":
      return buildWebSearchSpec(output);
    case "webBrowse":
    case "webQuery":
      return buildWebBrowseSpec(output);
    case "vectorSearch":
      return buildVectorSearchSpec(output);
    case "executeCommand":
      return buildExecuteCommandSpec(output);
    case "editFile":
    case "writeFile":
    case "patchFile":
      return buildPatchLikeSpec(toolName, output);
    case "updatePlan":
      return buildPlanSpec(output);
    case "calculator":
      return buildCalculatorSpec(output);
    default:
      return undefined;
  }
}
