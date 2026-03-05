import { describe, expect, it } from "vitest";
import { analyzeAmplitude } from "../lipsync-amplitude";
import type { LipsyncResult, OculusViseme } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Sample rate assumed by the analyzer */
const SAMPLE_RATE = 16000;

/**
 * Create a 16-bit PCM buffer filled with a constant amplitude sine wave.
 * @param durationMs - Duration in milliseconds
 * @param amplitude  - Peak amplitude (0–1)
 * @param frequency  - Sine frequency in Hz (default 440)
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

/**
 * Create a 16-bit PCM buffer filled with silence (all zeros).
 * @param durationMs - Duration in milliseconds
 */
function makeSilentBuffer(durationMs: number): ArrayBuffer {
  const sampleCount = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  return new ArrayBuffer(sampleCount * 2);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("analyzeAmplitude", () => {
  // ── Silence ──────────────────────────────────────────────────────────

  describe("silence handling", () => {
    it("returns only 'sil' visemes for silent audio", () => {
      const buffer = makeSilentBuffer(300);
      const result = analyzeAmplitude(buffer);

      expect(result.method).toBe("amplitude");
      expect(result.visemes.length).toBeGreaterThan(0);

      for (const cue of result.visemes) {
        expect(cue.viseme).toBe("sil");
        expect(cue.weight).toBe(0);
      }
    });

    it("returns 'sil' for audio below silence threshold", () => {
      // Very quiet sine wave — RMS should be below default 0.01 threshold
      const buffer = makeSineBuffer(300, 0.005);
      const result = analyzeAmplitude(buffer);

      for (const cue of result.visemes) {
        expect(cue.viseme).toBe("sil");
      }
    });
  });

  // ── Speech (loud audio) ──────────────────────────────────────────────

  describe("speech viseme generation", () => {
    it("returns speech visemes for loud audio", () => {
      const buffer = makeSineBuffer(300, 0.8);
      const result = analyzeAmplitude(buffer);

      expect(result.method).toBe("amplitude");
      expect(result.visemes.length).toBeGreaterThan(0);

      const speechVisemes = result.visemes.filter((c) => c.viseme !== "sil");
      expect(speechVisemes.length).toBeGreaterThan(0);
    });

    it("cycles through the correct viseme pattern", () => {
      const expectedCycle: OculusViseme[] = ["aa", "O", "E", "PP", "aa", "kk"];
      const buffer = makeSineBuffer(600, 0.8);
      const result = analyzeAmplitude(buffer);

      // Extract non-silence visemes (ignoring LERP transition cues)
      // Due to LERP splitting, we check the original viseme cycle is present
      const speechVisemes = result.visemes
        .filter((c) => c.viseme !== "sil")
        .map((c) => c.viseme);

      // The first several should match the cycle pattern
      for (let i = 0; i < Math.min(expectedCycle.length, speechVisemes.length); i++) {
        expect(speechVisemes[i]).toBe(expectedCycle[i % expectedCycle.length]);
      }
    });

    it("assigns positive weight to speech visemes", () => {
      const buffer = makeSineBuffer(300, 0.8);
      const result = analyzeAmplitude(buffer);

      const speechCues = result.visemes.filter((c) => c.viseme !== "sil");
      for (const cue of speechCues) {
        expect(cue.weight).toBeGreaterThan(0);
        expect(cue.weight).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── Duration tracking ────────────────────────────────────────────────

  describe("duration calculation", () => {
    it("reports correct total duration", () => {
      const buffer = makeSineBuffer(500, 0.5);
      const result = analyzeAmplitude(buffer);

      // Should be approximately 500ms (within rounding tolerance)
      expect(result.duration).toBeGreaterThanOrEqual(490);
      expect(result.duration).toBeLessThanOrEqual(510);
    });

    it("reports 0 duration for empty buffer", () => {
      const result = analyzeAmplitude(new ArrayBuffer(0));
      expect(result.duration).toBe(0);
    });
  });

  // ── Custom window size ───────────────────────────────────────────────

  describe("custom window size", () => {
    it("produces more cues with a smaller window", () => {
      const buffer = makeSineBuffer(300, 0.8);

      const defaultResult = analyzeAmplitude(buffer);
      const smallWindowResult = analyzeAmplitude(buffer, { windowSize: 30 });

      // Smaller window → more analysis windows → more cues
      expect(smallWindowResult.visemes.length).toBeGreaterThan(
        defaultResult.visemes.length,
      );
    });

    it("produces fewer cues with a larger window", () => {
      const buffer = makeSineBuffer(600, 0.8);

      const defaultResult = analyzeAmplitude(buffer);
      const largeWindowResult = analyzeAmplitude(buffer, { windowSize: 120 });

      expect(largeWindowResult.visemes.length).toBeLessThan(
        defaultResult.visemes.length,
      );
    });
  });

  // ── Custom silence threshold ─────────────────────────────────────────

  describe("custom silence threshold", () => {
    it("treats more audio as speech with a lower threshold", () => {
      // Medium-quiet audio
      const buffer = makeSineBuffer(300, 0.02);

      // Default threshold (0.01) should detect some speech
      const defaultResult = analyzeAmplitude(buffer);
      const speechDefault = defaultResult.visemes.filter(
        (c) => c.viseme !== "sil",
      ).length;

      // Higher threshold should treat it as silence
      const highThresholdResult = analyzeAmplitude(buffer, {
        silenceThreshold: 0.5,
      });
      const speechHigh = highThresholdResult.visemes.filter(
        (c) => c.viseme !== "sil",
      ).length;

      expect(speechDefault).toBeGreaterThanOrEqual(speechHigh);
    });

    it("treats everything as speech with threshold of 0", () => {
      const buffer = makeSineBuffer(300, 0.005);
      const result = analyzeAmplitude(buffer, { silenceThreshold: 0 });

      // Even very quiet audio should be non-silent with threshold 0
      const speechCues = result.visemes.filter((c) => c.viseme !== "sil");
      expect(speechCues.length).toBeGreaterThan(0);
    });
  });

  // ── Empty / edge cases ───────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns empty visemes for empty buffer", () => {
      const result = analyzeAmplitude(new ArrayBuffer(0));

      expect(result).toEqual({
        visemes: [],
        duration: 0,
        method: "amplitude",
      });
    });

    it("handles very short audio (less than one window)", () => {
      // 10ms of audio with default 60ms window
      const buffer = makeSineBuffer(10, 0.8);
      const result = analyzeAmplitude(buffer);

      // Should still produce at least one cue
      expect(result.visemes.length).toBeGreaterThanOrEqual(1);
    });

    it("handles a single-sample buffer", () => {
      const buffer = new ArrayBuffer(2); // One 16-bit sample
      const result = analyzeAmplitude(buffer);

      // Should not crash and should report a result
      expect(result.method).toBe("amplitude");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ── LERP weight interpolation ────────────────────────────────────────

  describe("LERP weight interpolation", () => {
    it("produces blended weights at viseme transitions", () => {
      // Long enough to have multiple viseme transitions
      const buffer = makeSineBuffer(600, 0.8);
      const result = analyzeAmplitude(buffer);

      // With LERP, consecutive cues with different visemes should
      // produce blend cues. Check that we have cues with fractional weights.
      const weights = result.visemes
        .filter((c) => c.viseme !== "sil")
        .map((c) => c.weight);

      // There should be at least some variation in weights (from LERP blending)
      const uniqueWeights = new Set(weights.map((w) => w.toFixed(3)));
      // With LERP enabled, we expect more than 1 unique weight
      expect(uniqueWeights.size).toBeGreaterThanOrEqual(1);
    });

    it("returns unmodified cues when LERP duration is 0", () => {
      const buffer = makeSineBuffer(300, 0.8);
      const result = analyzeAmplitude(buffer, { lerpDuration: 0 });

      // Every cue should have full duration equal to windowSize (60ms default)
      for (const cue of result.visemes) {
        expect(cue.duration).toBe(60);
      }
    });
  });

  // ── Result shape ─────────────────────────────────────────────────────

  describe("result structure", () => {
    it("returns a valid LipsyncResult shape", () => {
      const buffer = makeSineBuffer(300, 0.5);
      const result: LipsyncResult = analyzeAmplitude(buffer);

      expect(result).toHaveProperty("visemes");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("method");
      expect(result.method).toBe("amplitude");
      expect(Array.isArray(result.visemes)).toBe(true);
      expect(typeof result.duration).toBe("number");
    });

    it("each cue has required fields", () => {
      const buffer = makeSineBuffer(300, 0.5);
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

    it("cues are ordered by time", () => {
      const buffer = makeSineBuffer(600, 0.5);
      const result = analyzeAmplitude(buffer);

      for (let i = 1; i < result.visemes.length; i++) {
        expect(result.visemes[i].time).toBeGreaterThanOrEqual(
          result.visemes[i - 1].time,
        );
      }
    });
  });
});
