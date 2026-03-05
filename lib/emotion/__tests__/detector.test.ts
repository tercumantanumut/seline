import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getUtilityModel: vi.fn(() => "mock-utility-model"),
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai/providers", () => ({
  getUtilityModel: mocks.getUtilityModel,
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateObject: mocks.generateObject,
  };
});

// ── Import after mocks ──────────────────────────────────────────────────────

import { detectEmotion, _clearDetectionCache, _getDetectionCacheSize } from "../detector";
import type { EmotionResult } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockLLMResponse(result: Partial<EmotionResult>): void {
  mocks.generateObject.mockResolvedValueOnce({
    object: {
      emotion: "neutral",
      intensity: 0.5,
      mood: "calm",
      confidence: 0.8,
      ...result,
    },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("detectEmotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearDetectionCache();
  });

  afterEach(() => {
    _clearDetectionCache();
  });

  // ── Basic detection ─────────────────────────────────────────────────────

  it("returns the detected emotion for a happy message", async () => {
    mockLLMResponse({ emotion: "happy", intensity: 0.9, mood: "joyful", confidence: 0.95 });

    const result = await detectEmotion("I just got promoted! This is amazing!");

    expect(result).toEqual({
      emotion: "happy",
      intensity: 0.9,
      mood: "joyful",
      confidence: 0.95,
    });
  });

  it("returns neutral for an informational message", async () => {
    mockLLMResponse({ emotion: "neutral", intensity: 0.1, mood: "calm", confidence: 0.9 });

    const result = await detectEmotion("The meeting is at 3pm.");

    expect(result.emotion).toBe("neutral");
    expect(result.confidence).toBe(0.9);
  });

  it("detects frustration in an angry message", async () => {
    mockLLMResponse({ emotion: "frustrated", intensity: 0.8, mood: "irritated", confidence: 0.85 });

    const result = await detectEmotion("This is broken again! Nothing works!");

    expect(result.emotion).toBe("frustrated");
    expect(result.intensity).toBe(0.8);
  });

  it("detects sadness", async () => {
    mockLLMResponse({ emotion: "sad", intensity: 0.7, mood: "melancholic", confidence: 0.8 });

    const result = await detectEmotion("I feel really down today...");

    expect(result.emotion).toBe("sad");
    expect(result.mood).toBe("melancholic");
  });

  it("detects surprise", async () => {
    mockLLMResponse({ emotion: "surprised", intensity: 0.85, mood: "astonished", confidence: 0.9 });

    const result = await detectEmotion("Wait, what?! I had no idea!");

    expect(result.emotion).toBe("surprised");
  });

  it("detects thinking/contemplative state", async () => {
    mockLLMResponse({ emotion: "thinking", intensity: 0.5, mood: "contemplative", confidence: 0.75 });

    const result = await detectEmotion("Hmm, let me think about this for a moment...");

    expect(result.emotion).toBe("thinking");
  });

  it("detects confusion", async () => {
    mockLLMResponse({ emotion: "confused", intensity: 0.6, mood: "puzzled", confidence: 0.7 });

    const result = await detectEmotion("I don't understand what this means at all");

    expect(result.emotion).toBe("confused");
    expect(result.mood).toBe("puzzled");
  });

  it("detects excitement", async () => {
    mockLLMResponse({ emotion: "excited", intensity: 0.95, mood: "thrilled", confidence: 0.92 });

    const result = await detectEmotion("OMG this is incredible!! I can't wait!!");

    expect(result.emotion).toBe("excited");
    expect(result.intensity).toBe(0.95);
  });

  // ── Structured output & LLM call ───────────────────────────────────────

  it("calls generateObject with the utility model", async () => {
    mockLLMResponse({});

    await detectEmotion("hello");

    expect(mocks.generateObject).toHaveBeenCalledOnce();
    const callArg = mocks.generateObject.mock.calls[0][0];
    expect(callArg.model).toBe("mock-utility-model");
    expect(callArg.temperature).toBe(0.2);
    expect(callArg.maxOutputTokens).toBe(200);
  });

  it("includes the user message in the prompt", async () => {
    mockLLMResponse({});

    await detectEmotion("I love ice cream");

    const callArg = mocks.generateObject.mock.calls[0][0];
    expect(callArg.prompt).toContain("I love ice cream");
  });

  it("includes conversation context in the prompt when provided", async () => {
    mockLLMResponse({});

    await detectEmotion("Thanks!", ["How are you?", "I'm doing great"]);

    const callArg = mocks.generateObject.mock.calls[0][0];
    expect(callArg.prompt).toContain("How are you?");
    expect(callArg.prompt).toContain("I'm doing great");
    expect(callArg.prompt).toContain("Recent conversation context");
  });

  it("omits conversation context block when context is empty", async () => {
    mockLLMResponse({});

    await detectEmotion("Hello", []);

    const callArg = mocks.generateObject.mock.calls[0][0];
    expect(callArg.prompt).not.toContain("Recent conversation context");
  });

  it("passes a zod schema for structured output", async () => {
    mockLLMResponse({});

    await detectEmotion("test");

    const callArg = mocks.generateObject.mock.calls[0][0];
    expect(callArg.schema).toBeDefined();
  });

  // ── Value clamping ────────────────────────────────────────────────────

  it("clamps intensity to [0, 1]", async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: { emotion: "happy", intensity: 1.5, mood: "ecstatic", confidence: 0.9 },
    });

    const result = await detectEmotion("test");
    expect(result.intensity).toBe(1);
  });

  it("returns 0 for NaN intensity and confidence", async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: { emotion: "happy", intensity: NaN, mood: "cheerful", confidence: NaN },
    });

    const result = await detectEmotion("test");
    expect(result.intensity).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("clamps negative confidence to 0", async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: { emotion: "neutral", intensity: 0.5, mood: "calm", confidence: -0.2 },
    });

    const result = await detectEmotion("test");
    expect(result.confidence).toBe(0);
  });

  // ── Caching behavior ──────────────────────────────────────────────────

  it("returns cached result for same conversation within TTL", async () => {
    mockLLMResponse({ emotion: "happy", intensity: 0.9, mood: "joyful", confidence: 0.95 });

    const first = await detectEmotion("first msg", [], { conversationId: "conv-1" });
    const second = await detectEmotion("second msg", [], { conversationId: "conv-1" });

    // Only one LLM call should have been made
    expect(mocks.generateObject).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
  });

  it("makes a new LLM call for different conversation IDs", async () => {
    mockLLMResponse({ emotion: "happy", intensity: 0.9, mood: "joyful", confidence: 0.95 });
    mockLLMResponse({ emotion: "sad", intensity: 0.6, mood: "blue", confidence: 0.8 });

    const first = await detectEmotion("msg a", [], { conversationId: "conv-a" });
    const second = await detectEmotion("msg b", [], { conversationId: "conv-b" });

    expect(mocks.generateObject).toHaveBeenCalledTimes(2);
    expect(first.emotion).toBe("happy");
    expect(second.emotion).toBe("sad");
  });

  it("does not cache when no conversationId is provided", async () => {
    mockLLMResponse({ emotion: "happy", intensity: 0.5, mood: "pleased", confidence: 0.7 });
    mockLLMResponse({ emotion: "sad", intensity: 0.5, mood: "down", confidence: 0.7 });

    await detectEmotion("msg a");
    await detectEmotion("msg b");

    expect(mocks.generateObject).toHaveBeenCalledTimes(2);
  });

  it("makes a new LLM call after cache TTL expires", async () => {
    mockLLMResponse({ emotion: "happy", intensity: 0.9, mood: "joyful", confidence: 0.95 });
    mockLLMResponse({ emotion: "neutral", intensity: 0.1, mood: "calm", confidence: 0.9 });

    await detectEmotion("msg 1", [], { conversationId: "conv-ttl", cacheTtlMs: 0 });

    // With TTL of 0, next call should hit LLM again
    const second = await detectEmotion("msg 2", [], { conversationId: "conv-ttl", cacheTtlMs: 0 });

    expect(mocks.generateObject).toHaveBeenCalledTimes(2);
    expect(second.emotion).toBe("neutral");
  });

  it("cache size reflects stored conversations", async () => {
    mockLLMResponse({ emotion: "happy", intensity: 0.5, mood: "ok", confidence: 0.5 });
    mockLLMResponse({ emotion: "sad", intensity: 0.5, mood: "ok", confidence: 0.5 });

    expect(_getDetectionCacheSize()).toBe(0);

    await detectEmotion("a", [], { conversationId: "c1" });
    expect(_getDetectionCacheSize()).toBe(1);

    await detectEmotion("b", [], { conversationId: "c2" });
    expect(_getDetectionCacheSize()).toBe(2);

    _clearDetectionCache();
    expect(_getDetectionCacheSize()).toBe(0);
  });

  // ── Graceful failure ──────────────────────────────────────────────────

  it("returns neutral with confidence 0 when LLM call throws", async () => {
    mocks.generateObject.mockRejectedValueOnce(new Error("LLM service unavailable"));

    const result = await detectEmotion("This should not crash");

    expect(result).toEqual({
      emotion: "neutral",
      intensity: 0,
      mood: "calm",
      confidence: 0,
    });
  });

  it("returns neutral with confidence 0 on non-Error throw", async () => {
    mocks.generateObject.mockRejectedValueOnce("string error");

    const result = await detectEmotion("Handle weird errors");

    expect(result).toEqual({
      emotion: "neutral",
      intensity: 0,
      mood: "calm",
      confidence: 0,
    });
  });

  it("does not cache error results", async () => {
    mocks.generateObject.mockRejectedValueOnce(new Error("fail"));
    mockLLMResponse({ emotion: "happy", intensity: 0.8, mood: "glad", confidence: 0.9 });

    // First call fails
    const failed = await detectEmotion("test", [], { conversationId: "conv-err" });
    expect(failed.confidence).toBe(0);

    // Second call should hit LLM again (not return cached error)
    const success = await detectEmotion("test", [], { conversationId: "conv-err" });
    expect(success.emotion).toBe("happy");
    expect(mocks.generateObject).toHaveBeenCalledTimes(2);
  });
});
