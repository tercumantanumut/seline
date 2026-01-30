type ProgressEvent = {
  type: string;
  data?: unknown;
};

const COMPLETE_EVENT_TYPES = new Set([
  "executed",
  "execution_error",
  "execution_interrupted",
  "execution_failed",
  "execution_success",
  "execution_complete",
]);

function buildWebSocketUrl(baseUrl: string, clientId: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.searchParams.set("clientId", clientId);
  return url.toString();
}

function shouldForwardEvent(event: ProgressEvent, promptId?: string): boolean {
  if (!promptId) return true;
  const data = event.data as { prompt_id?: string } | undefined;
  if (data?.prompt_id && data.prompt_id !== promptId) {
    return false;
  }
  return true;
}

export async function streamComfyUIProgress(params: {
  baseUrl: string;
  clientId: string;
  promptId?: string;
  onEvent: (event: ProgressEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  if (typeof WebSocket === "undefined") {
    throw new Error("WebSocket is not available in this runtime.");
  }

  const { baseUrl, clientId, promptId, onEvent, signal } = params;
  const wsUrl = buildWebSocketUrl(baseUrl, clientId);
  const ws = new WebSocket(wsUrl);

  const cleanup = () => {
    ws.removeEventListener("open", handleOpen);
    ws.removeEventListener("message", handleMessage);
    ws.removeEventListener("error", handleError);
    ws.removeEventListener("close", handleClose);
    if (signal) {
      signal.removeEventListener("abort", handleAbort);
    }
  };

  const handleOpen = () => {
    onEvent({ type: "open", data: { clientId } });
  };

  const handleMessage = (event: MessageEvent) => {
    if (!event.data) return;
    let payload: ProgressEvent | null = null;
    try {
      payload = JSON.parse(String(event.data)) as ProgressEvent;
    } catch {
      return;
    }
    if (!payload || !payload.type) return;
    if (!shouldForwardEvent(payload, promptId)) return;
    onEvent(payload);
    const data = payload.data as { prompt_id?: string } | undefined;
    if (promptId && data?.prompt_id === promptId && COMPLETE_EVENT_TYPES.has(payload.type)) {
      ws.close();
    }
  };

  const handleError = () => {
    onEvent({ type: "error", data: { message: "ComfyUI progress stream error" } });
  };

  const handleClose = () => {
    onEvent({ type: "close" });
    cleanup();
  };

  const handleAbort = () => {
    ws.close();
  };

  ws.addEventListener("open", handleOpen);
  ws.addEventListener("message", handleMessage);
  ws.addEventListener("error", handleError);
  ws.addEventListener("close", handleClose);
  if (signal) {
    signal.addEventListener("abort", handleAbort, { once: true });
  }
}
