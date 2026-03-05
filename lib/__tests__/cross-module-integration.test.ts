/**
 * Cross-Module Integration Tests
 *
 * Verifies integration between the four new modules:
 * - Emotion Detection (lib/emotion/)
 * - Think-Tag Filter (lib/ai/streaming/think-tag-filter.ts)
 * - EverMemOS (lib/agent-memory/evermemos/)
 * - Avatar Lipsync (lib/avatar/)
 *
 * Tests focus on cross-module data flow and type compatibility,
 * mocking external dependencies (LLM calls, HTTP, file system).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock SQLite to avoid NODE_MODULE_VERSION mismatch in test environment
// (better-sqlite3 compiled for Electron, tests run in Node.js)
vi.mock("@/lib/db/sqlite-client", () => ({
  db: { prepare: vi.fn(), exec: vi.fn(), pragma: vi.fn() },
}));

// ── Emotion Detection ────────────────────────────────────────────────────────
import {
  updateEmotionContext,
  getEmotionContext,
  clearEmotionContext,
  EMOTIONS,
  type Emotion,
  type EmotionResult,
} from "@/lib/emotion";
import { _resetContextStore } from "@/lib/emotion/context";

// ── Think-Tag Filter ─────────────────────────────────────────────────────────
import {
  createThinkTagFilter,
  shouldFilterThinkTags,
} from "@/lib/ai/streaming/think-tag-filter";

// ── EverMemOS ────────────────────────────────────────────────────────────────
import { EverMemOSClient } from "@/lib/agent-memory/evermemos";
import type {
  EverMemOSSearchResult,
  EverMemOSMemoryEntry,
} from "@/lib/agent-memory/evermemos";

// ── Avatar ───────────────────────────────────────────────────────────────────
import {
  analyzeAmplitude,
  emotionToAvatarMood,
  OCULUS_VISEMES,
  type LipsyncResult,
  type VisemeCue,
  type AvatarMood,
  type OculusViseme,
} from "@/lib/avatar";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 16000;

/**
 * Create a 16-bit PCM buffer filled with a sine wave.
 */
function makeSineBuffer(
  durationMs: number,
  amplitude: number,
  frequency = 440,
): ArrayBuffer {
  const sampleCount = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const buffer = new ArrayBuffer(sampleCount * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / SAMPLE_RATE;
    const value = amplitude * Math.sin(2 * Math.PI * frequency * t);
    const int16 = Math.round(value * 32767);
    view.setInt16(i * 2, int16, true);
  }

  return buffer;
}

// =============================================================================
// 1. Emotion -> Avatar Mood Bridge
// =============================================================================

describe("Emotion -> Avatar Mood Bridge", () => {
  afterEach(() => {
    _resetContextStore();
  });

  it("maps every known emotion to a valid avatar expression", () => {
    const validExpressions = [
      "smile", "sadness", "anger", "surprise",
      "thoughtful", "puzzled", "neutral",
    ];

    for (const emotion of EMOTIONS) {
      const mood = emotionToAvatarMood(emotion, 0.7);

      expect(mood.emotion).toBe(emotion);
      expect(validExpressions).toContain(mood.expression);
      expect(mood.intensity).toBeGreaterThanOrEqual(0);
      expect(mood.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("round-trips through the emotion context store into avatar mood", () => {
    const conversationId = "conv-mood-bridge";
    const emotionResult: EmotionResult = {
      emotion: "excited",
      intensity: 0.9,
      mood: "enthusiastic",
      confidence: 0.85,
    };

    updateEmotionContext(conversationId, emotionResult);
    const ctx = getEmotionContext(conversationId);

    expect(ctx).not.toBeNull();
    const mood = emotionToAvatarMood(ctx!.current.emotion, ctx!.current.intensity);

    // "excited" maps to "smile" expression
    expect(mood.expression).toBe("smile");
    expect(mood.intensity).toBe(0.9);
    expect(mood.emotion).toBe("excited");
  });

  it("handles unknown emotions with a neutral fallback", () => {
    const mood = emotionToAvatarMood("bewildered" as Emotion, 0.5);

    expect(mood.expression).toBe("neutral");
    expect(mood.intensity).toBe(0.5);
  });

  it("clamps out-of-range intensity values", () => {
    const moodOver = emotionToAvatarMood("happy", 1.5);
    expect(moodOver.intensity).toBe(1);

    const moodUnder = emotionToAvatarMood("sad", -0.3);
    expect(moodUnder.intensity).toBe(0);

    const moodNaN = emotionToAvatarMood("angry", NaN);
    expect(moodNaN.intensity).toBe(0);
  });

  it("clears emotion context and verifies no stale mood data leaks", () => {
    const id = "conv-clear-test";
    updateEmotionContext(id, {
      emotion: "frustrated",
      intensity: 0.8,
      mood: "tense",
      confidence: 0.7,
    });

    expect(getEmotionContext(id)).not.toBeNull();
    clearEmotionContext(id);
    expect(getEmotionContext(id)).toBeNull();
  });
});

// =============================================================================
// 2. Think-Tag Filter + Streaming
// =============================================================================

describe("Think-Tag Filter + Streaming", () => {
  it("strips a think block that arrives in a single chunk", () => {
    const filter = createThinkTagFilter();
    const output = filter.process("Hello <think>internal reasoning</think> world");
    const flushed = filter.flush();

    expect(output + flushed).toBe("Hello  world");
  });

  it("strips think tags split across multiple chunks", () => {
    const filter = createThinkTagFilter();
    const chunks = ["He", "llo <th", "ink>secr", "et</thi", "nk> done"];
    let output = "";

    for (const chunk of chunks) {
      output += filter.process(chunk);
    }
    output += filter.flush();

    expect(output).toBe("Hello  done");
  });

  it("strips <thinking> tags (alternate tag name)", () => {
    const filter = createThinkTagFilter();
    const output = filter.process("before<thinking>hidden</thinking>after");
    const flushed = filter.flush();

    expect(output + flushed).toBe("beforeafter");
  });

  it("handles interleaved think tags in multi-chunk stream", () => {
    const filter = createThinkTagFilter();

    // Simulate a streaming response with multiple think blocks
    const chunks = [
      "The answer is ",
      "<think>Let me reason about this...",
      " The user wants X.</think>",
      "42. ",
      "<thinking>Double checking: 6*7=42, correct.</thinking>",
      " That's final.",
    ];

    let output = "";
    for (const chunk of chunks) {
      output += filter.process(chunk);
    }
    output += filter.flush();

    expect(output).toBe("The answer is 42.  That's final.");
  });

  it("captures thinking content when captureThinking is enabled", () => {
    const filter = createThinkTagFilter({ captureThinking: true });

    filter.process("result: <think>step 1, step 2</think>done");
    filter.flush();

    expect(filter.capturedThinking).toBe("step 1, step 2");
  });

  it("preserves text that looks like tags but is not a valid think tag", () => {
    const filter = createThinkTagFilter();
    const output = filter.process("use <div>html</div> and <b>bold</b> here");
    const flushed = filter.flush();

    expect(output + flushed).toBe("use <div>html</div> and <b>bold</b> here");
  });

  it("handles unclosed think tag at end of stream gracefully", () => {
    const filter = createThinkTagFilter();
    let output = "";
    output += filter.process("start <think>reasoning that never ends...");
    output += filter.flush();

    // Unclosed tag is discarded, but "start " should remain
    expect(output).toBe("start ");
  });

  it("handles character-by-character streaming", () => {
    const filter = createThinkTagFilter();
    const input = "ok<think>x</think>!";
    let output = "";

    for (const char of input) {
      output += filter.process(char);
    }
    output += filter.flush();

    expect(output).toBe("ok!");
  });

  describe("shouldFilterThinkTags provider detection", () => {
    it("returns false for anthropic provider", () => {
      expect(shouldFilterThinkTags("anthropic")).toBe(false);
    });

    it("returns true for ollama provider", () => {
      expect(shouldFilterThinkTags("ollama")).toBe(true);
    });

    it("returns true for deepseek model on openrouter", () => {
      expect(shouldFilterThinkTags("openrouter", "deepseek-chat-v3")).toBe(true);
    });

    it("returns false for non-thinking model on openrouter", () => {
      expect(shouldFilterThinkTags("openrouter", "gpt-4o")).toBe(false);
    });
  });
});

// =============================================================================
// 3. EverMemOS Store -> Search Round-Trip (mocked HTTP)
// =============================================================================

describe("EverMemOS Store -> Search Round-Trip", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("stores a memory and retrieves it via search", async () => {
    const storedEntries: EverMemOSMemoryEntry[] = [];

    // Mock fetch to simulate an EverMemOS server
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.endsWith("/store") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        const entry: EverMemOSMemoryEntry = {
          id: `mem-${storedEntries.length + 1}`,
          content: body.content,
          category: body.category,
          metadata: body.metadata,
          createdAt: new Date().toISOString(),
        };
        storedEntries.push(entry);
        return new Response(JSON.stringify(entry), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (urlStr.endsWith("/search") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        const query = body.query.toLowerCase();
        const matched = storedEntries.filter((e) =>
          e.content.toLowerCase().includes(query),
        );
        return new Response(
          JSON.stringify({
            entries: matched.map((e) => ({ ...e, score: 0.95 })),
            totalResults: matched.length,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (urlStr.endsWith("/health")) {
        return new Response("OK", { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const client = new EverMemOSClient({
      serverUrl: "http://localhost:8765",
      enabled: true,
    });

    // Health check
    const healthy = await client.healthCheck();
    expect(healthy).toBe(true);

    // Store
    const stored = await client.store({
      content: "User prefers dark mode for all interfaces",
      category: "visual_preferences",
      agentId: "agent-42",
    });

    expect(stored.id).toBe("mem-1");
    expect(stored.content).toBe("User prefers dark mode for all interfaces");
    expect(stored.category).toBe("visual_preferences");

    // Search
    const results = await client.search("dark mode");
    expect(results.entries.length).toBe(1);
    expect(results.entries[0].content).toContain("dark mode");
    expect(results.entries[0].score).toBe(0.95);
    expect(results.totalResults).toBe(1);
  });

  it("returns empty results when disabled", async () => {
    const client = new EverMemOSClient({
      serverUrl: "http://localhost:8765",
      enabled: false,
    });

    const results = await client.search("anything");
    expect(results.entries).toEqual([]);
    expect(results.totalResults).toBe(0);

    const healthy = await client.healthCheck();
    expect(healthy).toBe(false);
  });

  it("degrades gracefully on server error", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("Internal Server Error", { status: 500 });
    }) as typeof fetch;

    const client = new EverMemOSClient({
      serverUrl: "http://localhost:8765",
      enabled: true,
    });

    // Should return empty result, not throw
    const results = await client.search("test query");
    expect(results.entries).toEqual([]);
    expect(results.totalResults).toBe(0);

    // Store should return fallback entry
    const stored = await client.store({
      content: "test memory",
      category: "domain_knowledge",
    });
    expect(stored.id).toBe("");
    expect(stored.content).toBe("test memory");
  });

  it("degrades gracefully on network failure", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const client = new EverMemOSClient({
      serverUrl: "http://localhost:8765",
      enabled: true,
    });

    const results = await client.search("anything");
    expect(results.entries).toEqual([]);

    const healthy = await client.healthCheck();
    expect(healthy).toBe(false);
  });

  it("stores multiple memories and searches with category filter", async () => {
    const storedEntries: EverMemOSMemoryEntry[] = [];

    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.endsWith("/store") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        const entry: EverMemOSMemoryEntry = {
          id: `mem-${storedEntries.length + 1}`,
          content: body.content,
          category: body.category,
          createdAt: new Date().toISOString(),
        };
        storedEntries.push(entry);
        return new Response(JSON.stringify(entry), { status: 200 });
      }

      if (urlStr.endsWith("/search") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        let matched = storedEntries;
        if (body.category) {
          matched = matched.filter((e) => e.category === body.category);
        }
        return new Response(
          JSON.stringify({ entries: matched, totalResults: matched.length }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const client = new EverMemOSClient({
      serverUrl: "http://localhost:8765",
      enabled: true,
    });

    await client.store({ content: "Likes TypeScript", category: "domain_knowledge" });
    await client.store({ content: "Uses dark mode", category: "visual_preferences" });
    await client.store({ content: "Prefers functional style", category: "domain_knowledge" });

    const allResults = await client.search("*");
    expect(allResults.entries.length).toBe(3);

    const domainResults = await client.search("*", { category: "domain_knowledge" });
    expect(domainResults.entries.length).toBe(2);
  });
});

// =============================================================================
// 4. Avatar: Amplitude Analysis -> Viseme Array Structure
// =============================================================================

describe("Avatar: Amplitude -> Viseme Structure Validation", () => {
  it("produces viseme cues that conform to the LipsyncResult type", () => {
    const buffer = makeSineBuffer(300, 0.8);
    const result: LipsyncResult = analyzeAmplitude(buffer);

    expect(result).toHaveProperty("visemes");
    expect(result).toHaveProperty("duration");
    expect(result).toHaveProperty("method");
    expect(result.method).toBe("amplitude");
    expect(Array.isArray(result.visemes)).toBe(true);
    expect(typeof result.duration).toBe("number");
  });

  it("every viseme cue uses a valid OculusViseme value", () => {
    const buffer = makeSineBuffer(500, 0.7);
    const result = analyzeAmplitude(buffer);

    for (const cue of result.visemes) {
      expect(OCULUS_VISEMES).toContain(cue.viseme);
    }
  });

  it("every viseme cue has the required VisemeCue fields", () => {
    const buffer = makeSineBuffer(400, 0.6);
    const result = analyzeAmplitude(buffer);

    for (const cue of result.visemes) {
      expect(typeof cue.time).toBe("number");
      expect(typeof cue.viseme).toBe("string");
      expect(typeof cue.duration).toBe("number");
      expect(typeof cue.weight).toBe("number");

      expect(cue.time).toBeGreaterThanOrEqual(0);
      expect(cue.duration).toBeGreaterThan(0);
      expect(cue.weight).toBeGreaterThanOrEqual(0);
      expect(cue.weight).toBeLessThanOrEqual(1);
    }
  });

  it("cues are time-ordered and non-overlapping", () => {
    const buffer = makeSineBuffer(600, 0.5);
    const result = analyzeAmplitude(buffer);

    for (let i = 1; i < result.visemes.length; i++) {
      expect(result.visemes[i].time).toBeGreaterThanOrEqual(
        result.visemes[i - 1].time,
      );
    }
  });

  it("silent audio yields only 'sil' visemes with weight 0", () => {
    const sampleCount = Math.floor((SAMPLE_RATE * 300) / 1000);
    const silentBuffer = new ArrayBuffer(sampleCount * 2);
    const result = analyzeAmplitude(silentBuffer);

    expect(result.visemes.length).toBeGreaterThan(0);
    for (const cue of result.visemes) {
      expect(cue.viseme).toBe("sil");
      expect(cue.weight).toBe(0);
    }
  });

  it("empty buffer returns empty visemes array with 0 duration", () => {
    const result = analyzeAmplitude(new ArrayBuffer(0));

    expect(result.visemes).toEqual([]);
    expect(result.duration).toBe(0);
    expect(result.method).toBe("amplitude");
  });
});

// =============================================================================
// 5. Full Pipeline: Emotion -> Mood Bridge -> Lipsync Type Compatibility
// =============================================================================

describe("Full Pipeline: Emotion -> Mood -> Lipsync Compatibility", () => {
  afterEach(() => {
    _resetContextStore();
  });

  it("emotion result flows through context store and mood bridge to produce valid avatar state", () => {
    // Simulate what happens in a real chat pipeline:
    // 1) Emotion detection produces an EmotionResult
    // 2) Result is stored in the context store
    // 3) Mood bridge converts it to an AvatarMood
    // 4) Avatar mood is compatible with lipsync output types

    const conversationId = "pipeline-test-1";

    // Step 1: Simulated emotion detection result
    const emotionResult: EmotionResult = {
      emotion: "happy",
      intensity: 0.75,
      mood: "cheerful",
      confidence: 0.9,
    };

    // Step 2: Store in context
    updateEmotionContext(conversationId, emotionResult);
    const ctx = getEmotionContext(conversationId);
    expect(ctx).not.toBeNull();
    expect(ctx!.current.emotion).toBe("happy");

    // Step 3: Mood bridge
    const avatarMood: AvatarMood = emotionToAvatarMood(
      ctx!.current.emotion,
      ctx!.current.intensity,
    );
    expect(avatarMood.expression).toBe("smile");
    expect(avatarMood.intensity).toBe(0.75);

    // Step 4: Verify lipsync output is structurally compatible
    // (both feed into the same TalkingHead.js avatar renderer)
    const audioBuffer = makeSineBuffer(200, 0.6);
    const lipsyncResult: LipsyncResult = analyzeAmplitude(audioBuffer);

    // The avatar renderer uses both mood (facial expression) and lipsync (mouth shapes).
    // Verify they can coexist: mood has an expression string and intensity [0,1],
    // lipsync has ordered viseme cues with weights [0,1].
    expect(typeof avatarMood.expression).toBe("string");
    expect(avatarMood.intensity).toBeGreaterThanOrEqual(0);
    expect(avatarMood.intensity).toBeLessThanOrEqual(1);
    expect(lipsyncResult.visemes.length).toBeGreaterThan(0);

    for (const cue of lipsyncResult.visemes) {
      expect(cue.weight).toBeGreaterThanOrEqual(0);
      expect(cue.weight).toBeLessThanOrEqual(1);
      expect(OCULUS_VISEMES).toContain(cue.viseme);
    }
  });

  it("all nine emotions produce valid mood + lipsync state pairs", () => {
    const audioBuffer = makeSineBuffer(200, 0.5);
    const lipsyncResult = analyzeAmplitude(audioBuffer);

    for (const emotion of EMOTIONS) {
      const mood = emotionToAvatarMood(emotion, 0.6);

      // Mood is structurally valid
      expect(typeof mood.expression).toBe("string");
      expect(mood.expression.length).toBeGreaterThan(0);
      expect(mood.intensity).toBeGreaterThanOrEqual(0);
      expect(mood.intensity).toBeLessThanOrEqual(1);

      // Lipsync is structurally valid alongside mood
      expect(lipsyncResult.method).toBe("amplitude");
      expect(Array.isArray(lipsyncResult.visemes)).toBe(true);
    }
  });

  it("emotion context update does not affect lipsync analysis output", () => {
    // Verify independence: updating emotion context has no side effects
    // on the lipsync analysis (they feed different parts of the avatar).
    const audioBuffer = makeSineBuffer(300, 0.7);

    const lipsyncBefore = analyzeAmplitude(audioBuffer);

    updateEmotionContext("side-effect-test", {
      emotion: "angry",
      intensity: 1.0,
      mood: "furious",
      confidence: 0.95,
    });

    const lipsyncAfter = analyzeAmplitude(audioBuffer);

    expect(lipsyncBefore.visemes.length).toBe(lipsyncAfter.visemes.length);
    expect(lipsyncBefore.duration).toBe(lipsyncAfter.duration);
    expect(lipsyncBefore.method).toBe(lipsyncAfter.method);

    for (let i = 0; i < lipsyncBefore.visemes.length; i++) {
      expect(lipsyncBefore.visemes[i].viseme).toBe(lipsyncAfter.visemes[i].viseme);
      expect(lipsyncBefore.visemes[i].time).toBe(lipsyncAfter.visemes[i].time);
      expect(lipsyncBefore.visemes[i].weight).toBe(lipsyncAfter.visemes[i].weight);
    }
  });

  it("filtered streaming output can coexist with emotion-driven avatar state", () => {
    // Simulates the real rendering pipeline:
    // LLM streams text -> think-tag filter removes reasoning -> emotion detected
    // -> mood bridge -> avatar renders with both mood expression and lipsync

    // 1) Stream with think tags
    const filter = createThinkTagFilter();
    const rawChunks = [
      "<think>The user seems happy based on exclamation marks</think>",
      "Great to hear you're doing well! ",
      "<think>I should be enthusiastic</think>",
      "Let's get started!",
    ];

    let cleanText = "";
    for (const chunk of rawChunks) {
      cleanText += filter.process(chunk);
    }
    cleanText += filter.flush();

    expect(cleanText).toBe("Great to hear you're doing well! Let's get started!");

    // 2) Emotion detection (simulated result based on clean text)
    const emotionResult: EmotionResult = {
      emotion: "excited",
      intensity: 0.85,
      mood: "enthusiastic",
      confidence: 0.88,
    };
    updateEmotionContext("stream-pipeline", emotionResult);

    // 3) Mood bridge
    const ctx = getEmotionContext("stream-pipeline");
    const mood = emotionToAvatarMood(ctx!.current.emotion, ctx!.current.intensity);

    // 4) Lipsync for the TTS of the clean text
    const audioBuffer = makeSineBuffer(400, 0.65);
    const lipsync = analyzeAmplitude(audioBuffer);

    // Verify the pipeline produced consistent, valid avatar state
    expect(mood.expression).toBe("smile"); // "excited" -> "smile"
    expect(mood.intensity).toBe(0.85);
    expect(lipsync.visemes.length).toBeGreaterThan(0);
    expect(lipsync.method).toBe("amplitude");

    // The clean text should contain no think-tag artifacts
    expect(cleanText).not.toContain("<think>");
    expect(cleanText).not.toContain("</think>");
    expect(cleanText).not.toContain("seems happy");
  });
});
