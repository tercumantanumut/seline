import { normalizeCodexModel } from "@/lib/auth/codex-models";
import {
  filterCodexInput,
  normalizeOrphanedToolOutputs,
  type CodexInputItem,
} from "@/lib/auth/codex-input-utils";

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "minimal";
type ReasoningSummary = "auto" | "concise" | "detailed";

const REASONING_SUFFIXES = ["none", "low", "medium", "high", "xhigh", "minimal"] as const;

function extractEffortFromModelId(modelId?: string): ReasoningEffort | undefined {
  if (!modelId) return undefined;
  const lower = modelId.toLowerCase();
  for (const suffix of REASONING_SUFFIXES) {
    if (lower.endsWith(`-${suffix}`)) {
      return suffix;
    }
  }
  return undefined;
}

function getReasoningConfig(
  modelName: string | undefined,
  requestedEffort?: ReasoningEffort,
  requestedSummary?: ReasoningSummary,
): { effort: "none" | "low" | "medium" | "high" | "xhigh"; summary: ReasoningSummary } {
  const normalizedName = modelName?.toLowerCase() ?? "";

  const isGpt52Codex =
    normalizedName.includes("gpt-5.2-codex") || normalizedName.includes("gpt 5.2 codex");
  const isGpt53Codex =
    normalizedName.includes("gpt-5.3-codex") || normalizedName.includes("gpt 5.3 codex");
  const isGpt52General =
    (normalizedName.includes("gpt-5.2") || normalizedName.includes("gpt 5.2")) && !isGpt52Codex;
  const isGpt53General =
    (normalizedName.includes("gpt-5.3") || normalizedName.includes("gpt 5.3")) && !isGpt53Codex;
  const isCodexMax =
    normalizedName.includes("codex-max") || normalizedName.includes("codex max");
  const isCodexMini =
    normalizedName.includes("codex-mini") ||
    normalizedName.includes("codex mini") ||
    normalizedName.includes("codex_mini") ||
    normalizedName.includes("codex-mini-latest");
  const isCodex = normalizedName.includes("codex") && !isCodexMini;
  const isLightweight =
    !isCodexMini && (normalizedName.includes("nano") || normalizedName.includes("mini"));
  const prefersMediumDefault = isGpt53Codex;

  const isGpt51General =
    (normalizedName.includes("gpt-5.1") || normalizedName.includes("gpt 5.1")) &&
    !isCodex &&
    !isCodexMax &&
    !isCodexMini;

  const supportsXhigh = isGpt53General || isGpt53Codex || isGpt52General || isGpt52Codex || isCodexMax;
  const supportsNone = isGpt53General || isGpt52General || isGpt51General;

  const defaultEffort: ReasoningEffort = isCodexMini
    ? "medium"
    : prefersMediumDefault
      ? "medium"
    : supportsXhigh
      ? "high"
      : isLightweight
        ? "minimal"
        : "medium";

  let effort = requestedEffort || defaultEffort;

  if (isCodexMini) {
    if (effort === "minimal" || effort === "low" || effort === "none") {
      effort = "medium";
    }
    if (effort === "xhigh") {
      effort = "high";
    }
    if (effort !== "high" && effort !== "medium") {
      effort = "medium";
    }
  }

  if (!supportsXhigh && effort === "xhigh") {
    effort = "high";
  }

  if (!supportsNone && effort === "none") {
    effort = "low";
  }

  if (effort === "minimal") {
    effort = "low";
  }

  return {
    effort,
    summary: requestedSummary || "auto",
  };
}

function resolveTextVerbosity(body: Record<string, any>): "low" | "medium" | "high" {
  const providerOpenAI = body.providerOptions?.openai;
  return (
    body.text?.verbosity ||
    providerOpenAI?.textVerbosity ||
    "medium"
  );
}

function resolveInclude(body: Record<string, any>): string[] {
  const providerOpenAI = body.providerOptions?.openai;
  const base = body.include || providerOpenAI?.include || ["reasoning.encrypted_content"];
  const include = Array.from(new Set(base.filter(Boolean))) as string[];
  if (!include.includes("reasoning.encrypted_content")) {
    include.push("reasoning.encrypted_content");
  }
  return include;
}

export async function transformCodexRequest(
  body: Record<string, any>,
  codexInstructions: string,
): Promise<Record<string, any>> {
  const originalModel = body.model as string | undefined;
  const normalizedModel = normalizeCodexModel(originalModel);

  body.model = normalizedModel;
  body.store = false;
  body.stream = true;
  if (codexInstructions) {
    body.instructions = codexInstructions;
  }

  if (Array.isArray(body.input)) {
    const filtered = filterCodexInput(body.input as CodexInputItem[]) || [];
    body.input = normalizeOrphanedToolOutputs(filtered);
  }

  const requestedEffort =
    body.reasoning?.effort ||
    body.providerOptions?.openai?.reasoningEffort ||
    extractEffortFromModelId(originalModel);
  const requestedSummary =
    body.reasoning?.summary ||
    body.providerOptions?.openai?.reasoningSummary;

  const reasoningConfig = getReasoningConfig(originalModel || normalizedModel, requestedEffort, requestedSummary);

  body.reasoning = {
    ...body.reasoning,
    ...reasoningConfig,
  };

  body.text = {
    ...body.text,
    verbosity: resolveTextVerbosity(body),
  };

  body.include = resolveInclude(body);

  delete body.temperature;
  delete body.max_output_tokens;
  delete body.max_completion_tokens;

  return body;
}
