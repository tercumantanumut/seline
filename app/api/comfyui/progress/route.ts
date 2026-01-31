import { NextRequest } from "next/server";
import { resolveCustomComfyUIBaseUrl } from "@/lib/comfyui/custom/client";
import { streamComfyUIProgress } from "@/lib/comfyui/custom/progress";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const promptId = searchParams.get("promptId") || undefined;
    const comfyuiBaseUrl = searchParams.get("comfyuiBaseUrl") || undefined;
    const comfyuiHost = searchParams.get("comfyuiHost") || undefined;
    const comfyuiPort = searchParams.get("comfyuiPort");

    if (!clientId) {
      return new Response(JSON.stringify({ error: "Missing clientId." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const resolved = await resolveCustomComfyUIBaseUrl({
      comfyuiBaseUrl: comfyuiBaseUrl || undefined,
      comfyuiHost: comfyuiHost || undefined,
      comfyuiPort: comfyuiPort ? Number(comfyuiPort) : undefined,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        sendEvent("connected", { status: "ok" });

        streamComfyUIProgress({
          baseUrl: resolved.baseUrl,
          clientId,
          promptId,
          onEvent: (event) => sendEvent(event.type, event.data ?? {}),
          signal: request.signal,
        }).catch((error) => {
          sendEvent("error", { message: error instanceof Error ? error.message : "Progress stream failed" });
          controller.close();
        });
      },
      cancel() {
        // Abort handled by request.signal.
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Progress stream failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
