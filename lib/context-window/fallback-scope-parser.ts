import type { Message } from "@/lib/db/schema";

import { isDelegatedToolName } from "./claudecode-scope-classifier";
import type { ContextScope } from "./scoped-counting-contract";

export interface LegacyScopeInference {
  scope: ContextScope;
  confidence: number;
  reason: string;
}

interface ToolCallLike {
  type?: string;
  toolCallId?: string;
  toolName?: string;
}

function asToolCallLike(part: unknown): ToolCallLike {
  if (!part || typeof part !== "object" || Array.isArray(part)) return {};
  return part as ToolCallLike;
}

export class LegacyScopeHeuristic {
  private readonly activeDelegatedToolCalls = new Set<string>();

  constructor(private readonly sessionMetadata?: Record<string, unknown> | null) {}

  inferMessage(message: Message): LegacyScopeInference {
    if (this.sessionMetadata?.isDelegation === true) {
      return {
        scope: "delegated",
        confidence: 0.99,
        reason: "session_metadata.isDelegation",
      };
    }

    if (this.activeDelegatedToolCalls.size > 0 && message.role === "assistant") {
      return {
        scope: "delegated",
        confidence: 0.7,
        reason: "assistant_with_active_delegated_tool_calls",
      };
    }

    return {
      scope: "main",
      confidence: 0.55,
      reason: "legacy_default_main",
    };
  }

  inferPart(part: unknown): LegacyScopeInference {
    const candidate = asToolCallLike(part);

    if (candidate.type === "tool-call" && isDelegatedToolName(candidate.toolName)) {
      if (candidate.toolCallId) {
        this.activeDelegatedToolCalls.add(candidate.toolCallId);
      }
      return {
        scope: "delegated",
        confidence: 0.98,
        reason: "delegated_tool_call_name",
      };
    }

    if (
      candidate.type === "tool-result" &&
      typeof candidate.toolCallId === "string" &&
      this.activeDelegatedToolCalls.has(candidate.toolCallId)
    ) {
      this.activeDelegatedToolCalls.delete(candidate.toolCallId);
      return {
        scope: "delegated",
        confidence: 0.95,
        reason: "tool_result_for_active_delegated_call",
      };
    }

    if (this.activeDelegatedToolCalls.size > 0 && candidate.type === "text") {
      return {
        scope: "delegated",
        confidence: 0.68,
        reason: "text_while_delegated_tool_call_active",
      };
    }

    return {
      scope: "main",
      confidence: 0.55,
      reason: "legacy_part_default_main",
    };
  }
}
