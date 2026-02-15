import { getMessages } from "../db/sqlite-queries";

export interface SkillExtractionResult {
  toolHints: string[];
  warnings: string[];
  confidence: "high" | "medium" | "low";
}

interface ParsedToolCall {
  toolName: string;
}

function safeParseContent(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractToolCallsFromMessageContent(content: string): ParsedToolCall[] {
  const parsed = safeParseContent(content);
  if (!Array.isArray(parsed)) return [];

  const calls: ParsedToolCall[] = [];
  for (const part of parsed) {
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    const partType = typeof record.type === "string" ? record.type : "";

    if (partType === "tool-call" || partType === "dynamic-tool") {
      const toolName =
        typeof record.toolName === "string"
          ? record.toolName
          : typeof record.name === "string"
            ? record.name
            : "";
      if (toolName.trim().length > 0) {
        calls.push({ toolName: toolName.trim() });
      }
      continue;
    }

    if (partType.startsWith("tool-") && partType !== "tool-result") {
      const toolName = partType.replace("tool-", "").trim();
      if (toolName.length > 0) {
        calls.push({ toolName });
      }
    }
  }

  return calls;
}

export async function inferSkillToolHintsFromSession(
  sessionId: string,
  maxMessages = 24
): Promise<SkillExtractionResult> {
  const messages = await getMessages(sessionId);
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      toolHints: [],
      warnings: ["No recent session messages were available for skill extraction."],
      confidence: "low",
    };
  }

  const recent = messages.slice(-maxMessages);
  const hints: string[] = [];

  for (const msg of recent) {
    if (!msg || typeof msg.content !== "string") continue;
    const calls = extractToolCallsFromMessageContent(msg.content);
    for (const call of calls) {
      hints.push(call.toolName);
    }
  }

  const orderedUniqueHints = Array.from(new Set(hints)).slice(0, 20);

  if (orderedUniqueHints.length === 0) {
    return {
      toolHints: [],
      warnings: [
        "No structured tool calls were found in recent messages. Skill was created without inferred tool hints.",
      ],
      confidence: "low",
    };
  }

  return {
    toolHints: orderedUniqueHints,
    warnings:
      orderedUniqueHints.length >= 20
        ? ["Inferred tool hints were truncated to 20 entries."]
        : [],
    confidence: orderedUniqueHints.length >= 3 ? "high" : "medium",
  };
}
