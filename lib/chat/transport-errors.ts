export interface ChatTransportErrorPayload {
  httpStatus?: number;
  status?: string;
  message: string;
  details?: string;
  recovery?: { action?: string; message?: string };
  compactionResult?: {
    success?: boolean;
    tokensFreed?: number;
    messagesCompacted?: number;
  };
}

export async function parseTransportErrorResponse(
  response: Response,
): Promise<ChatTransportErrorPayload> {
  let payload: Record<string, unknown> | null = null;

  try {
    payload = (await response.clone().json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  const fallbackMessage = `${response.status} ${response.statusText}`.trim() || "Request failed";

  return {
    httpStatus: response.status,
    status: typeof payload?.status === "string" ? payload.status : undefined,
    message: typeof payload?.error === "string" ? payload.error : fallbackMessage,
    details: typeof payload?.details === "string" ? payload.details : undefined,
    recovery:
      payload?.recovery && typeof payload.recovery === "object"
        ? {
            action:
              typeof (payload.recovery as Record<string, unknown>).action === "string"
                ? ((payload.recovery as Record<string, unknown>).action as string)
                : undefined,
            message:
              typeof (payload.recovery as Record<string, unknown>).message === "string"
                ? ((payload.recovery as Record<string, unknown>).message as string)
                : undefined,
          }
        : undefined,
    compactionResult:
      payload?.compactionResult && typeof payload.compactionResult === "object"
        ? {
            success:
              typeof (payload.compactionResult as Record<string, unknown>).success === "boolean"
                ? ((payload.compactionResult as Record<string, unknown>).success as boolean)
                : undefined,
            tokensFreed:
              typeof (payload.compactionResult as Record<string, unknown>).tokensFreed === "number"
                ? ((payload.compactionResult as Record<string, unknown>).tokensFreed as number)
                : undefined,
            messagesCompacted:
              typeof (payload.compactionResult as Record<string, unknown>).messagesCompacted === "number"
                ? ((payload.compactionResult as Record<string, unknown>).messagesCompacted as number)
                : undefined,
          }
        : undefined,
  };
}

export function toBlockedPayload(error: ChatTransportErrorPayload | null) {
  if (!error || error.httpStatus !== 413) return null;

  return {
    message: error.message,
    details: error.details,
    status: error.status,
    recovery: error.recovery,
    compactionResult: error.compactionResult,
  };
}

export function shouldIgnoreUseChatError(error: Error, chatStatus: string): boolean {
  if (error.name === "AbortError") return true;

  const message = error.message || "";
  if (message.includes("aborted")) return true;

  const requestFailedBeforeStream = chatStatus === "submitted";
  const isFetchError = message.includes("Failed to fetch") || message.includes("Load failed");
  const isNetworkTypeError = message.includes("network") && error instanceof TypeError;

  if ((isFetchError || isNetworkTypeError) && !requestFailedBeforeStream) {
    return true;
  }

  return false;
}
