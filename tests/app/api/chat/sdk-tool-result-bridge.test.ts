import { describe, expect, it } from "vitest";
import { createSdkToolResultBridge } from "@/app/api/chat/sdk-tool-result-bridge";

describe("createSdkToolResultBridge", () => {
  it("resolves immediately when result already published", async () => {
    const bridge = createSdkToolResultBridge();

    bridge.publish("tool-1", { ok: true }, "Task");
    const resolved = await bridge.waitFor("tool-1", { timeoutMs: 1000 });

    expect(resolved).toEqual({ output: { ok: true }, toolName: "Task" });
  });

  it("supports no-timeout wait until published", async () => {
    const bridge = createSdkToolResultBridge();

    const pending = bridge.waitFor("tool-2", { timeoutMs: null });

    setTimeout(() => {
      bridge.publish("tool-2", { done: true }, "Task");
    }, 20);

    await expect(pending).resolves.toEqual({ output: { done: true }, toolName: "Task" });
  });

  it("returns undefined when aborted before publish", async () => {
    const bridge = createSdkToolResultBridge();
    const controller = new AbortController();

    const pending = bridge.waitFor("tool-3", {
      timeoutMs: null,
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(pending).resolves.toBeUndefined();
  });

  it("returns undefined on timeout for finite waits", async () => {
    const bridge = createSdkToolResultBridge();

    const resolved = await bridge.waitFor("tool-4", { timeoutMs: 30 });

    expect(resolved).toBeUndefined();
  });

  it("dispose resolves pending waiters and clears state", async () => {
    const bridge = createSdkToolResultBridge();

    const pendingA = bridge.waitFor("tool-5", { timeoutMs: null });
    const pendingB = bridge.waitFor("tool-6", { timeoutMs: null });

    bridge.dispose?.();

    await expect(pendingA).resolves.toBeUndefined();
    await expect(pendingB).resolves.toBeUndefined();
  });
});
