import type { ChatTransportErrorPayload } from "@/lib/chat/transport-errors";

export interface ChatPreflightSuccess {
  ok: true;
  status?: string;
  compactionResult?: ChatTransportErrorPayload["compactionResult"];
  compactionDurationMs?: number;
}

export interface ChatPreflightBlocked {
  ok: false;
  httpStatus: number;
  error: string;
  details?: string;
  status?: string;
  recovery?: ChatTransportErrorPayload["recovery"];
  compactionResult?: ChatTransportErrorPayload["compactionResult"];
  compactionDurationMs?: number;
}

export type ChatPreflightResult = ChatPreflightSuccess | ChatPreflightBlocked;

export function parseLastSseDataBlock(text: string): string | null {
  const matches = text.match(/^data:\s?(.*)$/gm);
  if (!matches || matches.length === 0) return null;
  const lastMatch = matches[matches.length - 1];
  return lastMatch.replace(/^data:\s?/, "").trim() || null;
}

export function parseChatPreflightResponse(text: string): ChatPreflightResult {
  const payload = parseLastSseDataBlock(text);
  if (!payload) {
    return { ok: true };
  }

  const parsed = JSON.parse(payload) as ChatPreflightResult;
  return parsed;
}
