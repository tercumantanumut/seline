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

describe("askUserQuestion tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers interactive wait and returns user answers", async () => {
    interactiveBridgeMocks.registerInteractiveWait.mockResolvedValue({
      "Which style do you prefer?": "Modern",
    });

    const tool = createAskUserQuestionTool({ sessionId: "sess-1" });

    const result = await tool.execute(
      sampleArgs,
      {
        toolCallId: "tool-call-1",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    ) as { answers: Record<string, string>; timedOut?: boolean };

    expect(interactiveBridgeMocks.registerInteractiveWait).toHaveBeenCalledWith(
      "sess-1",
      "tool-call-1",
      sampleArgs.questions,
    );
    expect(result).toEqual({
      answers: {
        "Which style do you prefer?": "Modern",
      },
    });
  });

  it("returns timeout shape when toolCallId is missing", async () => {
    const tool = createAskUserQuestionTool({ sessionId: "sess-1" });

    const result = await tool.execute(
      sampleArgs,
      {
        messages: [],
        abortSignal: new AbortController().signal,
      } as any,
    ) as { answers: Record<string, string>; timedOut?: boolean };

    expect(interactiveBridgeMocks.registerInteractiveWait).not.toHaveBeenCalled();
    expect(result).toEqual({ answers: {}, timedOut: true });
  });

  it("returns timeout shape for UNSCOPED session", async () => {
    const tool = createAskUserQuestionTool({ sessionId: "UNSCOPED" });

    const result = await tool.execute(
      sampleArgs,
      {
        toolCallId: "tool-call-2",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    ) as { answers: Record<string, string>; timedOut?: boolean };

    expect(interactiveBridgeMocks.registerInteractiveWait).not.toHaveBeenCalled();
    expect(result).toEqual({ answers: {}, timedOut: true });
  });

  it("returns timeout shape when interactive wait rejects", async () => {
    interactiveBridgeMocks.registerInteractiveWait.mockRejectedValue(new Error("bridge failed"));

    const tool = createAskUserQuestionTool({ sessionId: "sess-1" });

    const result = await tool.execute(
      sampleArgs,
      {
        toolCallId: "tool-call-3",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    ) as { answers: Record<string, string>; timedOut?: boolean };

    expect(interactiveBridgeMocks.registerInteractiveWait).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ answers: {}, timedOut: true });
  });
});
