/**
 * SSE heartbeat transform stream.
 *
 * When piped between an AI streaming response and the HTTP response,
 * this emits SSE comment lines (`: heartbeat\n\n`) during periods of
 * silence to keep the TCP connection alive.  SSE comments are ignored
 * by EventSource / AI SDK parsers on the client side.
 */

const HEARTBEAT_BYTES = new TextEncoder().encode(": heartbeat\n\n");

export function createHeartbeatStream(
  intervalMs = 30_000,
): TransformStream<Uint8Array, Uint8Array> {
  let timer: ReturnType<typeof setInterval> | null = null;

  return new TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
      timer = setInterval(() => {
        try {
          controller.enqueue(HEARTBEAT_BYTES);
        } catch {
          // Stream already closed — clear interval
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      }, intervalMs);
    },

    transform(chunk, controller) {
      controller.enqueue(chunk);
    },

    flush() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  });
}
