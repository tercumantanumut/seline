import { describe, expect, it } from "vitest";

import {
  MAX_STREAM_TOOL_RESULT_TOKENS,
  guardToolResultForStreaming,
} from "@/lib/ai/tool-result-stream-guard";

describe("guardToolResultForStreaming", () => {
  it("keeps small tool results unchanged", () => {
    const result = { status: "success", content: "ok" };

    const guarded = guardToolResultForStreaming("localGrep", result);

    expect(guarded.blocked).toBe(false);
    expect(guarded.result).toEqual(result);
    expect(guarded.estimatedTokens).toBeLessThanOrEqual(MAX_STREAM_TOOL_RESULT_TOKENS);
  });

  it("returns structured error for oversized executeCommand output", () => {
    const huge = "x".repeat(140_000);
    const result = {
      status: "success",
      stdout: huge,
      stderr: "",
      exitCode: 0,
      executionTime: 42,
    };

    const guarded = guardToolResultForStreaming("executeCommand", result);

    expect(guarded.blocked).toBe(true);
    const blocked = guarded.result as Record<string, unknown>;
    expect(blocked.status).toBe("error");
    expect(blocked.oversizedForStreaming).toBe(true);
    expect(blocked.tokenLimit).toBe(MAX_STREAM_TOOL_RESULT_TOKENS);
    expect(String(blocked.error)).toContain("too large");
    expect(String(blocked.error)).toContain("Use a narrower command");
  });
});
