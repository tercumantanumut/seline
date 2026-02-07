import { describe, expect, it } from "vitest";
import { parseTTSDirectives } from "@/lib/tts/directives";

describe("TTS Directives Parser", () => {
  // ── No directives ──────────────────────────────────────────────────────

  describe("no directives", () => {
    it("returns text unchanged when no directives present", () => {
      const result = parseTTSDirectives("Hello, how are you?");
      expect(result.text).toBe("Hello, how are you?");
      expect(result.directive).toBeNull();
    });

    it("returns empty text unchanged", () => {
      const result = parseTTSDirectives("");
      expect(result.text).toBe("");
      expect(result.directive).toBeNull();
    });

    it("handles text with brackets that are not directives", () => {
      const result = parseTTSDirectives("Use [[bold]] for emphasis");
      expect(result.text).toBe("Use [[bold]] for emphasis");
      expect(result.directive).toBeNull();
    });
  });

  // ── [[tts:off]] ────────────────────────────────────────────────────────

  describe("[[tts:off]] directive", () => {
    it("parses off directive", () => {
      const result = parseTTSDirectives("Hello [[tts:off]] world");
      expect(result.directive).toEqual({ off: true });
      expect(result.text).toBe("Hello  world");
    });

    it("parses off directive case-insensitively", () => {
      const result = parseTTSDirectives("Hello [[tts:OFF]]");
      expect(result.directive).toEqual({ off: true });
    });
  });

  // ── Voice directives ───────────────────────────────────────────────────

  describe("voice directives", () => {
    it("parses voice parameter", () => {
      const result = parseTTSDirectives("[[tts:voice=alloy]] Hello");
      expect(result.directive).toEqual({ voice: "alloy" });
      expect(result.text).toBe("Hello");
    });

    it("parses voiceId parameter", () => {
      const result = parseTTSDirectives("[[tts:voiceId=abc123]] Hello");
      expect(result.directive).toEqual({ voiceId: "abc123" });
    });

    it("parses provider parameter", () => {
      const result = parseTTSDirectives("[[tts:provider=elevenlabs]] Hello");
      expect(result.directive).toEqual({ provider: "elevenlabs" });
    });

    it("parses speed parameter", () => {
      const result = parseTTSDirectives("[[tts:speed=1.5]] Hello");
      expect(result.directive).toEqual({ speed: 1.5 });
    });
  });

  // ── Multiple parameters ────────────────────────────────────────────────

  describe("multiple parameters", () => {
    it("parses multiple key=value pairs in one directive", () => {
      const result = parseTTSDirectives(
        "[[tts:provider=elevenlabs voiceId=abc123 speed=1.1]] Hello"
      );
      expect(result.directive).toEqual({
        provider: "elevenlabs",
        voiceId: "abc123",
        speed: 1.1,
      });
    });

    it("merges multiple directives (last wins)", () => {
      const result = parseTTSDirectives(
        "[[tts:voice=alloy]] Hello [[tts:voice=echo speed=0.8]]"
      );
      expect(result.directive).toEqual({
        voice: "echo",
        speed: 0.8,
      });
    });
  });

  // ── Text cleaning ─────────────────────────────────────────────────────

  describe("text cleaning", () => {
    it("strips directive from text", () => {
      const result = parseTTSDirectives("Hello [[tts:voice=alloy]] world");
      expect(result.text).toBe("Hello  world");
    });

    it("collapses excessive newlines after stripping", () => {
      const result = parseTTSDirectives("Hello\n\n\n[[tts:voice=alloy]]\n\n\nworld");
      expect(result.text).not.toContain("\n\n\n");
    });

    it("trims whitespace from result", () => {
      const result = parseTTSDirectives("  [[tts:voice=alloy]] Hello  ");
      expect(result.text).toBe("Hello");
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles directive with no valid params", () => {
      const result = parseTTSDirectives("[[tts:]] Hello");
      expect(result.directive).toBeNull();
    });

    it("ignores invalid key=value pairs", () => {
      const result = parseTTSDirectives("[[tts:invalid_key=value]] Hello");
      // The key doesn't match any known param, so directive should be null
      // (or contain no recognized keys)
      expect(result.text).toBe("Hello");
    });

    it("handles speed with invalid number", () => {
      const result = parseTTSDirectives("[[tts:speed=notanumber]] Hello");
      expect(result.directive?.speed).toBeUndefined();
    });
  });
});
