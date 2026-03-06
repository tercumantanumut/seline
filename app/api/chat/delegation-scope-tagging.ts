import type { DBContentPart } from "@/lib/messages/converter";
import { isDelegatedSubagentIntermediateResult } from "@/lib/context-window/claudecode-scope-classifier";
import type { StreamingMessageState } from "./streaming-state";

function isToolCallPart(part: DBContentPart): part is Extract<DBContentPart, { type: "tool-call" }> {
  return part.type === "tool-call";
}

function isToolResultPart(part: DBContentPart): part is Extract<DBContentPart, { type: "tool-result" }> {
  return part.type === "tool-result";
}

export function tagIntermediateDelegationParts(
  state: StreamingMessageState,
  toolCallId: string
): boolean {
  if (!toolCallId) return false;

  const toolResultPart = state.parts.find(
    (part): part is Extract<DBContentPart, { type: "tool-result" }> =>
      isToolResultPart(part) && part.toolCallId === toolCallId
  );

  if (!toolResultPart || !isDelegatedSubagentIntermediateResult(toolResultPart)) {
    return false;
  }

  const nextScope = {
    contextScope: "delegated" as const,
    provenanceVersion: 1 as const,
  };

  Object.assign(toolResultPart, nextScope);

  const toolCallPart = state.parts.find(
    (part): part is Extract<DBContentPart, { type: "tool-call" }> =>
      isToolCallPart(part) && part.toolCallId === toolCallId
  );
  if (toolCallPart) {
    Object.assign(toolCallPart, nextScope);
  }

  return true;
}
