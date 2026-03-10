import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const interactiveBridgeMocks = vi.hoisted(() => ({
  registerInteractiveWait: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  withToolLogging: vi.fn(
    (
      _toolName: string,
      _sessionId: string | undefined,
      executeFn: (args: unknown, options?: unknown) => Promise<unknown>,
    ) =>
      (args: unknown, options?: unknown) => executeFn(args, options),
  ),
}));

vi.mock("@/lib/interactive-tool-bridge", () => ({
  registerInteractiveWait: interactiveBridgeMocks.registerInteractiveWait,
}));

vi.mock("@/lib/ai/tool-registry/logging", () => ({
  withToolLogging: loggingMocks.withToolLogging,
}));

import { createAskUserQuestionTool } from "@/lib/ai/tools/ask-user-question-tool";

const sampleArgs = {
  questions: [
    {
      question: "Which style do you prefer?",
      header: "Style",
      options: [
        { label: "Modern", description: "Clean and minimal" },
        { label: "Classic", description: "Traditional and timeless" },
      ],
      multiSelect: false,
    },
  ],
};

function buildToolCallOptions(
  overrides: Partial<ToolExecutionOptions> = {},
): ToolExecutionOptions {
  return {
    toolCallId: "tool-call-1",
    messages: [],
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

describe("askUserQuestion tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers interactive wait and returns user answers", async () => {
    interactiveBridgeMocks.registerInteractiveWait.mockResolvedValue({
      kind: "submitted",
      answers: {
        "Which style do you prefer?": "Modern",
      },
    });

    const tool = createAskUserQuestionTool({ sessionId: "sess-1" });

    const result = await tool.execute(
      sampleArgs,
      buildToolCallOptions({ toolCallId: "tool-call-1" }),
    ) as { answers: Record<string, string>; timedOut?: boolean };

    expect(interactiveBridgeMocks.registerInteractiveWait).toHaveBeenCalledWith(
      "sess-1",
      "tool-call-1",
      sampleArgs.questions,
      { abortSignal: expect.any(AbortSignal) },
    );
    expect(result).toEqual({
      answers: {
        "Which style do you prefer?": "Modern",
      },
    });
  });

  it("passes the tool abort signal through to the interactive wait", async () => {
    interactiveBridgeMocks.registerInteractiveWait.mockResolvedValue({
      kind: "submitted",
      answers: {
        "Which style do you prefer?": "Modern",
      },
    });

    const tool = createAskUserQuestionTool({ sessionId: "sess-1" });
    const controller = new AbortController();

    await tool.execute(
      sampleArgs,
      buildToolCallOptions({
        toolCallId: "tool-call-signal",
        abortSignal: controller.signal,
      }),
    );

    expect(interactiveBridgeMocks.registerInteractiveWait).toHaveBeenLastCalledWith(
      "sess-1",
      "tool-call-signal",
      sampleArgs.questions,
      { abortSignal: controller.signal },
    );
  });

  it("returns timeout shape when toolCallId is missing", async () => {
    const tool = createAskUserQuestionTool({ sessionId: "sess-1" });

    const result = await tool.execute(
      sampleArgs,
      {
        messages: [],
        abortSignal: new AbortController().signal,
      } as ToolExecutionOptions,
    ) as { answers: Record<string, string>; timedOut?: boolean };

    expect(interactiveBridgeMocks.registerInteractiveWait).not.toHaveBeenCalled();
    expect(result).toEqual({ answers: {}, timedOut: true });
  });

  it("returns timeout shape for UNSCOPED session", async () => {
    const tool = createAskUserQuestionTool({ sessionId: "UNSCOPED" });

    const result = await tool.execute(
      sampleArgs,
      buildToolCallOptions({ toolCallId: "tool-call-2" }),
    ) as { answers: Record<string, string>; timedOut?: boolean };

    expect(interactiveBridgeMocks.registerInteractiveWait).not.toHaveBeenCalled();
    expect(result).toEqual({ answers: {}, timedOut: true });
  });

  it("returns timeout shape when interactive wait is interrupted", async () => {
    interactiveBridgeMocks.registerInteractiveWait.mockResolvedValue({
      kind: "interrupted",
      reason: "aborted",
    });

    const tool = createAskUserQuestionTool({ sessionId: "sess-1" });

    const result = await tool.execute(
      sampleArgs,
      buildToolCallOptions({ toolCallId: "tool-call-3" }),
    ) as { answers: Record<string, string>; timedOut?: boolean };

    expect(interactiveBridgeMocks.registerInteractiveWait).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ answers: {}, timedOut: true });
  });
});
