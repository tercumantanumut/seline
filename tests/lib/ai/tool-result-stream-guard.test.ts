import { describe, expect, it } from "vitest";

import {
  MIN_STREAM_TOOL_RESULT_TOKENS,
  guardToolResultForStreaming,
} from "@/lib/ai/tool-result-stream-guard";

describe("guardToolResultForStreaming", () => {
  it("keeps small tool results unchanged", () => {
    const result = { status: "success", content: "ok" };

    const guarded = guardToolResultForStreaming("localGrep", result, {
      maxTokens: 2_000,
    });

    expect(guarded.blocked).toBe(false);
    expect(guarded.result).toEqual(result);
    expect(guarded.estimatedTokens).toBeLessThanOrEqual(2_000);
  });

  it("returns structured validation error for oversized output and preserves retrieval ids", () => {
    const huge = "x".repeat(140_000);
    const result = {
      status: "success",
      stdout: huge,
      stderr: "",
      exitCode: 0,
      executionTime: 42,
      logId: "log_huge",
      truncatedContentId: "trunc_abc123",
    };

    const guarded = guardToolResultForStreaming("executeCommand", result, {
      maxTokens: 3_000,
      metadata: { sourceFileName: "executor.ts" },
    });

    expect(guarded.blocked).toBe(true);
    const blocked = guarded.result as Record<string, unknown>;
    expect(blocked.status).toBe("error");
    expect(blocked.oversizedForStreaming).toBe(true);
    expect(blocked.tokenLimit).toBe(3_000);
    expect(blocked.logId).toBe("log_huge");
    expect(blocked.truncatedContentId).toBe("trunc_abc123");
    expect(String(blocked.error)).toContain("Streaming continued");
    expect(String(blocked.error)).toContain("readLog");
    expect(String(blocked.error)).toContain("retrieveFullContent");
  });

  it("normalizes very small maxTokens floor", () => {
    const result = { status: "success", content: "x".repeat(20_000) };

    const guarded = guardToolResultForStreaming("localGrep", result, {
      maxTokens: 1,
    });

    expect(guarded.blocked).toBe(true);
    const blocked = guarded.result as Record<string, unknown>;
    expect(blocked.tokenLimit).toBe(MIN_STREAM_TOOL_RESULT_TOKENS);
  });
});
