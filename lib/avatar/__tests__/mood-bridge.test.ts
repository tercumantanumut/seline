import { describe, expect, it } from "vitest";
import { emotionToAvatarMood } from "../mood-bridge";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("emotionToAvatarMood", () => {
  // ── Known emotion mappings ───────────────────────────────────────────

  describe("emotion to expression mapping", () => {
    it("maps 'happy' to 'smile'", () => {
      const mood = emotionToAvatarMood("happy", 0.8);

      expect(mood.emotion).toBe("happy");
      expect(mood.expression).toBe("smile");
      expect(mood.intensity).toBe(0.8);
    });

    it("maps 'sad' to 'sadness'", () => {
      const mood = emotionToAvatarMood("sad", 0.6);

      expect(mood.expression).toBe("sadness");
    });

    it("maps 'angry' to 'anger'", () => {
      const mood = emotionToAvatarMood("angry", 0.9);

      expect(mood.expression).toBe("anger");
    });

    it("maps 'surprised' to 'surprise'", () => {
      const mood = emotionToAvatarMood("surprised", 0.7);

      expect(mood.expression).toBe("surprise");
    });

    it("maps 'thinking' to 'thoughtful'", () => {
      const mood = emotionToAvatarMood("thinking", 0.5);

      expect(mood.expression).toBe("thoughtful");
    });

    it("maps 'confused' to 'puzzled'", () => {
      const mood = emotionToAvatarMood("confused", 0.4);

      expect(mood.expression).toBe("puzzled");
    });

    it("maps 'excited' to 'smile'", () => {
      const mood = emotionToAvatarMood("excited", 0.95);

      expect(mood.expression).toBe("smile");
    });

    it("maps 'frustrated' to 'anger'", () => {
      const mood = emotionToAvatarMood("frustrated", 0.7);

      expect(mood.expression).toBe("anger");
    });

    it("maps 'neutral' to 'neutral'", () => {
      const mood = emotionToAvatarMood("neutral", 0.1);

      expect(mood.expression).toBe("neutral");
    });
  });

  // ── Unknown / unmapped emotions ──────────────────────────────────────

  describe("unknown emotions", () => {
    it("returns 'neutral' expression for unknown emotion", () => {
      const mood = emotionToAvatarMood("bewildered", 0.5);

      expect(mood.expression).toBe("neutral");
      expect(mood.emotion).toBe("bewildered");
    });

    it("returns 'neutral' expression for empty string", () => {
      const mood = emotionToAvatarMood("", 0.5);

      expect(mood.expression).toBe("neutral");
      expect(mood.emotion).toBe("neutral");
    });

    it("handles emotion with leading/trailing whitespace", () => {
      const mood = emotionToAvatarMood("  happy  ", 0.8);

      expect(mood.expression).toBe("smile");
      expect(mood.emotion).toBe("happy");
    });

    it("handles mixed-case emotion names", () => {
      const mood = emotionToAvatarMood("Happy", 0.8);

      expect(mood.expression).toBe("smile");
      expect(mood.emotion).toBe("happy");
    });

    it("handles all-caps emotion names", () => {
      const mood = emotionToAvatarMood("ANGRY", 0.9);

      expect(mood.expression).toBe("anger");
    });
  });

  // ── Intensity passthrough ────────────────────────────────────────────

  describe("intensity handling", () => {
    it("passes through intensity value directly", () => {
      const mood = emotionToAvatarMood("happy", 0.42);

      expect(mood.intensity).toBe(0.42);
    });

    it("clamps intensity to 1 when above 1", () => {
      const mood = emotionToAvatarMood("happy", 1.5);

      expect(mood.intensity).toBe(1);
    });

    it("clamps intensity to 0 when below 0", () => {
      const mood = emotionToAvatarMood("happy", -0.3);

      expect(mood.intensity).toBe(0);
    });

    it("returns 0 for NaN intensity", () => {
      const mood = emotionToAvatarMood("happy", NaN);

      expect(mood.intensity).toBe(0);
    });

    it("handles intensity of exactly 0", () => {
      const mood = emotionToAvatarMood("happy", 0);

      expect(mood.intensity).toBe(0);
    });

    it("handles intensity of exactly 1", () => {
      const mood = emotionToAvatarMood("happy", 1);

      expect(mood.intensity).toBe(1);
    });
  });

  // ── Result structure ─────────────────────────────────────────────────

  describe("result structure", () => {
    it("returns all required fields", () => {
      const mood = emotionToAvatarMood("happy", 0.7);

      expect(mood).toHaveProperty("emotion");
      expect(mood).toHaveProperty("expression");
      expect(mood).toHaveProperty("intensity");
      expect(typeof mood.emotion).toBe("string");
      expect(typeof mood.expression).toBe("string");
      expect(typeof mood.intensity).toBe("number");
    });

    it("emotion field contains the normalized input emotion", () => {
      const mood = emotionToAvatarMood("Happy", 0.5);

      // Should be lowercased and trimmed
      expect(mood.emotion).toBe("happy");
    });
  });
});
