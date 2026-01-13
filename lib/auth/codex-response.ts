type CodexSseEvent = {
  type?: string;
  response?: unknown;
};

function parseSseStream(sseText: string): unknown | null {
  const lines = sseText.split("\n");

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6);
    if (!payload) continue;

    try {
      const data = JSON.parse(payload) as CodexSseEvent;
      if (data.type === "response.done" || data.type === "response.completed") {
        return data.response ?? null;
      }
    } catch {
      // Ignore malformed JSON.
    }
  }

  return null;
}

export async function convertSseToJson(response: Response, headers: Headers): Promise<Response> {
  if (!response.body) {
    throw new Error("[CodexResponse] Response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
  }

  const finalResponse = parseSseStream(fullText);
  if (!finalResponse) {
    return new Response(fullText, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const jsonHeaders = new Headers(headers);
  jsonHeaders.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(finalResponse), {
    status: response.status,
    statusText: response.statusText,
    headers: jsonHeaders,
  });
}

export function ensureContentType(headers: Headers): Headers {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "text/event-stream; charset=utf-8");
  }
  return responseHeaders;
}
