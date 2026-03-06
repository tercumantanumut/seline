import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateEmotionContext,
  getEmotionContext,
  clearEmotionContext,
  cleanupStaleContexts,
  setMaxAge,
  _getContextStoreSize,
  _resetContextStore,
} from "../context";
import type { EmotionResult } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(overrides?: Partial<EmotionResult>): EmotionResult {
  return {
    emotion: "neutral",
    intensity: 0.5,
    mood: "calm",
    confidence: 0.8,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Emotion Context Store", () => {
  beforeEach(() => {
    _resetContextStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetContextStore();
    vi.useRealTimers();
  });

  // ── Basic storage and retrieval ───────────────────────────────────────

  describe("updateEmotionContext / getEmotionContext", () => {
    it("stores and retrieves emotion context for a conversation", () => {
      const result = makeResult({ emotion: "happy", mood: "joyful" });
      updateEmotionContext("conv-1", result);

      const ctx = getEmotionContext("conv-1");

      expect(ctx).not.toBeNull();
      expect(ctx!.current).toEqual(result);
      expect(ctx!.conversationId).toBe("conv-1");
      expect(typeof ctx!.updatedAt).toBe("number");
    });

    it("stores contexts for multiple conversations independently", () => {
      const happy = makeResult({ emotion: "happy" });
      const sad = makeResult({ emotion: "sad" });

      updateEmotionContext("conv-a", happy);
      updateEmotionContext("conv-b", sad);

      expect(getEmotionContext("conv-a")!.current.emotion).toBe("happy");
      expect(getEmotionContext("conv-b")!.current.emotion).toBe("sad");
      expect(_getContextStoreSize()).toBe(2);
    });

    it("overwrites previous context on update", () => {
      updateEmotionContext("conv-1", makeResult({ emotion: "happy" }));
      updateEmotionContext("conv-1", makeResult({ emotion: "sad" }));

      const ctx = getEmotionContext("conv-1");
      expect(ctx!.current.emotion).toBe("sad");
      expect(_getContextStoreSize()).toBe(1);
    });

    it("updates the timestamp on each update", () => {
      updateEmotionContext("conv-1", makeResult());
      const firstTimestamp = getEmotionContext("conv-1")!.updatedAt;

      vi.advanceTimersByTime(5000);
      updateEmotionContext("conv-1", makeResult({ emotion: "excited" }));
      const secondTimestamp = getEmotionContext("conv-1")!.updatedAt;

      expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
    });
  });

  // ── Null returns ──────────────────────────────────────────────────────

  describe("getEmotionContext for unknown conversations", () => {
    it("returns null for a conversation that was never tracked", () => {
      expect(getEmotionContext("non-existent")).toBeNull();
    });

    it("returns null after the context has been cleared", () => {
      updateEmotionContext("conv-1", makeResult());
      clearEmotionContext("conv-1");

      expect(getEmotionContext("conv-1")).toBeNull();
    });
  });

  // ── clearEmotionContext ───────────────────────────────────────────────

  describe("clearEmotionContext", () => {
    it("removes a specific conversation context", () => {
      updateEmotionContext("conv-a", makeResult());
      updateEmotionContext("conv-b", makeResult());

      clearEmotionContext("conv-a");

      expect(getEmotionContext("conv-a")).toBeNull();
      expect(getEmotionContext("conv-b")).not.toBeNull();
      expect(_getContextStoreSize()).toBe(1);
    });

    it("is a no-op for non-existent conversation", () => {
      clearEmotionContext("does-not-exist");
      expect(_getContextStoreSize()).toBe(0);
    });
  });

  // ── Auto-cleanup of stale contexts ────────────────────────────────────

  describe("cleanupStaleContexts", () => {
    it("removes contexts older than the specified max age", () => {
      updateEmotionContext("old-conv", makeResult());

      // Advance time past the max age but NOT past the cleanup interval (5 min)
      // so the automatic cleanup doesn't run first.
      // Use setSystemTime to shift "now" without triggering intervals.
      const now = Date.now();
      vi.setSystemTime(now + 2 * 60 * 60 * 1000); // 2 hours later

      const removed = cleanupStaleContexts();

      expect(removed).toBe(1);
      expect(getEmotionContext("old-conv")).toBeNull();
      expect(_getContextStoreSize()).toBe(0);
    });

    it("keeps contexts within the max age", () => {
      updateEmotionContext("recent-conv", makeResult());

      // Advance time, but within the 1-hour default max age
      vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes

      const removed = cleanupStaleContexts();

      expect(removed).toBe(0);
      expect(getEmotionContext("recent-conv")).not.toBeNull();
    });

    it("removes only stale contexts when mixed ages exist", () => {
      updateEmotionContext("old-conv", makeResult());

      // Shift system time forward without triggering intervals
      const now = Date.now();
      vi.setSystemTime(now + 90 * 60 * 1000); // 90 minutes later

      updateEmotionContext("new-conv", makeResult());

      const removed = cleanupStaleContexts();

      expect(removed).toBe(1);
      expect(getEmotionContext("old-conv")).toBeNull();
      expect(getEmotionContext("new-conv")).not.toBeNull();
      expect(_getContextStoreSize()).toBe(1);
    });

    it("accepts a custom max age parameter", () => {
      updateEmotionContext("conv-1", makeResult());

      vi.advanceTimersByTime(5000); // 5 seconds

      // With a very short max age, the context should be removed
      const removed = cleanupStaleContexts(1000);

      expect(removed).toBe(1);
      expect(getEmotionContext("conv-1")).toBeNull();
    });

    it("returns 0 when store is empty", () => {
      const removed = cleanupStaleContexts();
      expect(removed).toBe(0);
    });
  });

  // ── setMaxAge ─────────────────────────────────────────────────────────

  describe("setMaxAge", () => {
    it("changes the default max age for cleanup", () => {
      setMaxAge(10_000); // 10 seconds

      updateEmotionContext("conv-1", makeResult());

      vi.advanceTimersByTime(15_000); // 15 seconds

      const removed = cleanupStaleContexts();
      expect(removed).toBe(1);
    });

    it("respects new max age that would keep contexts alive", () => {
      setMaxAge(60 * 60 * 1000); // 1 hour (default)

      updateEmotionContext("conv-1", makeResult());

      vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes

      const removed = cleanupStaleContexts();
      expect(removed).toBe(0);
    });
  });

  // ── Automatic cleanup via interval ────────────────────────────────────

  describe("automatic cleanup interval", () => {
    it("automatically cleans up stale contexts on interval tick", () => {
      setMaxAge(10_000); // 10 seconds

      updateEmotionContext("conv-1", makeResult());

      // Advance past max age AND past cleanup interval (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

      // The interval should have triggered cleanup
      expect(getEmotionContext("conv-1")).toBeNull();
      expect(_getContextStoreSize()).toBe(0);
    });
  });

  // ── _resetContextStore ────────────────────────────────────────────────

  describe("_resetContextStore", () => {
    it("clears all contexts", () => {
      updateEmotionContext("conv-1", makeResult());
      updateEmotionContext("conv-2", makeResult());

      _resetContextStore();

      expect(_getContextStoreSize()).toBe(0);
      expect(getEmotionContext("conv-1")).toBeNull();
      expect(getEmotionContext("conv-2")).toBeNull();
    });
  });
});
