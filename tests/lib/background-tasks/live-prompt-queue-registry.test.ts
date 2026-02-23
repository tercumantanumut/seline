import { describe, it, expect, beforeEach } from "vitest";
import {
  createLivePromptQueue,
  appendToLivePromptQueue,
  appendToLivePromptQueueBySession,
  drainLivePromptQueue,
  hasLivePromptQueue,
  removeLivePromptQueue,
} from "@/lib/background-tasks/live-prompt-queue-registry";

const RUN_ID = "test-run-001";
const SESSION_ID = "test-session-001";

describe("live-prompt-queue-registry", () => {
  beforeEach(() => {
    removeLivePromptQueue(RUN_ID, SESSION_ID);
  });

  it("appendToLivePromptQueue returns false when no queue exists", () => {
    const result = appendToLivePromptQueue(RUN_ID, {
      id: "1",
      content: "hello",
      stopIntent: false,
    });
    expect(result).toBe(false);
  });

  it("hasLivePromptQueue returns false before creation", () => {
    expect(hasLivePromptQueue(RUN_ID)).toBe(false);
  });

  it("createLivePromptQueue initializes an empty queue", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    expect(hasLivePromptQueue(RUN_ID)).toBe(true);
    const drained = drainLivePromptQueue(RUN_ID);
    expect(drained).toHaveLength(0);
  });

  it("appendToLivePromptQueue returns true and enqueues after creation", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    const result = appendToLivePromptQueue(RUN_ID, {
      id: "1",
      content: "hello",
      stopIntent: false,
    });
    expect(result).toBe(true);
  });

  it("drainLivePromptQueue returns all entries and clears the queue atomically", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    appendToLivePromptQueue(RUN_ID, { id: "1", content: "msg1", stopIntent: false });
    appendToLivePromptQueue(RUN_ID, { id: "2", content: "msg2", stopIntent: true });

    const first = drainLivePromptQueue(RUN_ID);
    expect(first).toHaveLength(2);
    expect(first[0].content).toBe("msg1");
    expect(first[1].stopIntent).toBe(true);
    expect(first[0].timestamp).toBeTypeOf("number");

    // Second drain must be empty — atomic clear
    const second = drainLivePromptQueue(RUN_ID);
    expect(second).toHaveLength(0);
  });

  it("drainLivePromptQueue returns empty array for non-existent queue", () => {
    const drained = drainLivePromptQueue("nonexistent-run");
    expect(drained).toHaveLength(0);
  });

  it("removeLivePromptQueue cleans up and subsequent appends return false", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    removeLivePromptQueue(RUN_ID, SESSION_ID);
    expect(hasLivePromptQueue(RUN_ID)).toBe(false);
    const result = appendToLivePromptQueue(RUN_ID, {
      id: "1",
      content: "test",
      stopIntent: false,
    });
    expect(result).toBe(false);
  });

  it("entries are ordered by insertion (not sorted)", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    appendToLivePromptQueue(RUN_ID, { id: "a", content: "first", stopIntent: false });
    appendToLivePromptQueue(RUN_ID, { id: "b", content: "second", stopIntent: false });
    appendToLivePromptQueue(RUN_ID, { id: "c", content: "third", stopIntent: false });

    const drained = drainLivePromptQueue(RUN_ID);
    expect(drained.map(e => e.id)).toEqual(["a", "b", "c"]);
  });

  // --- appendToLivePromptQueueBySession tests ---

  it("appendToLivePromptQueueBySession returns false when no queue exists for session", () => {
    const result = appendToLivePromptQueueBySession(SESSION_ID, {
      id: "1",
      content: "hello",
      stopIntent: false,
    });
    expect(result).toBe(false);
  });

  it("appendToLivePromptQueueBySession returns true after createLivePromptQueue", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    const result = appendToLivePromptQueueBySession(SESSION_ID, {
      id: "1",
      content: "hello via session",
      stopIntent: false,
    });
    expect(result).toBe(true);
  });

  it("appendToLivePromptQueueBySession enqueued entry is visible via drainLivePromptQueue", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    appendToLivePromptQueueBySession(SESSION_ID, { id: "x", content: "session msg", stopIntent: true });

    const drained = drainLivePromptQueue(RUN_ID);
    expect(drained).toHaveLength(1);
    expect(drained[0].content).toBe("session msg");
    expect(drained[0].stopIntent).toBe(true);
    expect(drained[0].timestamp).toBeTypeOf("number");
  });

  it("appendToLivePromptQueueBySession returns false after removeLivePromptQueue", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    removeLivePromptQueue(RUN_ID, SESSION_ID);
    const result = appendToLivePromptQueueBySession(SESSION_ID, {
      id: "1",
      content: "test",
      stopIntent: false,
    });
    expect(result).toBe(false);
  });

  it("removeLivePromptQueue cleans up the session index", () => {
    createLivePromptQueue(RUN_ID, SESSION_ID);
    removeLivePromptQueue(RUN_ID, SESSION_ID);
    // Both runId-based and sessionId-based lookups should fail
    expect(hasLivePromptQueue(RUN_ID)).toBe(false);
    expect(appendToLivePromptQueueBySession(SESSION_ID, { id: "1", content: "x", stopIntent: false })).toBe(false);
  });

  it("different sessions map to different runs independently", () => {
    const RUN_B = "test-run-002";
    const SESSION_B = "test-session-002";

    createLivePromptQueue(RUN_ID, SESSION_ID);
    createLivePromptQueue(RUN_B, SESSION_B);

    appendToLivePromptQueueBySession(SESSION_ID, { id: "1", content: "for A", stopIntent: false });
    appendToLivePromptQueueBySession(SESSION_B, { id: "2", content: "for B", stopIntent: false });

    const drainedA = drainLivePromptQueue(RUN_ID);
    const drainedB = drainLivePromptQueue(RUN_B);

    expect(drainedA).toHaveLength(1);
    expect(drainedA[0].content).toBe("for A");
    expect(drainedB).toHaveLength(1);
    expect(drainedB[0].content).toBe("for B");

    // Cleanup
    removeLivePromptQueue(RUN_B, SESSION_B);
  });
});
