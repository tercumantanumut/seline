/**
 * Amplitude-Based Lipsync Analysis
 *
 * Fast, always-available lipsync path that analyzes raw audio amplitude
 * to produce viseme cues. Processes 16-bit PCM audio in windowed segments,
 * computing RMS to determine voice activity, then cycles through a set of
 * mouth shapes for natural-looking speech animation.
 *
 * Typical processing time: <10ms for a 10-second clip.
 */

import type {
  LipsyncConfig,
  LipsyncResult,
  OculusViseme,
  VisemeCue,
} from "./types";
import { DEFAULT_LIPSYNC_CONFIG } from "./types";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Viseme cycling pattern for amplitude-based analysis.
 * Cycles through varied mouth shapes to avoid repetitive animation.
 * Matches the pattern used in the DYAI fork's avatar-canvas.
 */
const AMPLITUDE_VISEME_CYCLE: readonly OculusViseme[] = [
  "aa", "O", "E", "PP", "aa", "kk",
];

/** Assumed sample rate when decoding raw PCM (16kHz mono) */
const DEFAULT_SAMPLE_RATE = 16000;

/** Bytes per sample for 16-bit PCM */
const BYTES_PER_SAMPLE = 2;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze raw audio amplitude and produce viseme cues.
 *
 * Assumes 16-bit signed PCM, mono, 16kHz. For other formats, decode
 * to PCM before calling this function.
 *
 * @param audioBuffer - Raw audio bytes (16-bit PCM)
 * @param config      - Optional partial config overrides
 * @returns LipsyncResult with viseme cues and total duration
 */
export function analyzeAmplitude(
  audioBuffer: ArrayBuffer,
  config?: Partial<LipsyncConfig>,
): LipsyncResult {
  const cfg = resolveConfig(config);

  if (audioBuffer.byteLength === 0) {
    return { visemes: [], duration: 0, method: "amplitude" };
  }

  const samples = decodePCM16(audioBuffer);
  const totalDurationMs = (samples.length / DEFAULT_SAMPLE_RATE) * 1000;
  const windowSamples = Math.floor(
    (DEFAULT_SAMPLE_RATE * cfg.windowSize) / 1000,
  );

  if (windowSamples === 0) {
    return { visemes: [], duration: totalDurationMs, method: "amplitude" };
  }

  const rawCues = computeRawCues(samples, windowSamples, cfg);
  const visemes = applyLerp(rawCues, cfg.lerpDuration);

  return {
    visemes,
    duration: Math.round(totalDurationMs),
    method: "amplitude",
  };
}

// ── Internals ────────────────────────────────────────────────────────────────

/**
 * Merge user config with defaults.
 */
function resolveConfig(partial?: Partial<LipsyncConfig>): LipsyncConfig {
  return { ...DEFAULT_LIPSYNC_CONFIG, ...partial };
}

/**
 * Decode an ArrayBuffer of 16-bit signed little-endian PCM into float samples [-1, 1].
 */
function decodePCM16(buffer: ArrayBuffer): Float32Array {
  const sampleCount = Math.floor(buffer.byteLength / BYTES_PER_SAMPLE);
  const view = new DataView(buffer);
  const samples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * BYTES_PER_SAMPLE, true); // little-endian
    samples[i] = int16 / 32768;
  }

  return samples;
}

/**
 * Compute raw (un-interpolated) viseme cues from float samples.
 */
function computeRawCues(
  samples: Float32Array,
  windowSamples: number,
  cfg: LipsyncConfig,
): VisemeCue[] {
  const cues: VisemeCue[] = [];
  let cycleIndex = 0;

  for (let offset = 0; offset < samples.length; offset += windowSamples) {
    const end = Math.min(offset + windowSamples, samples.length);
    const rms = computeRMS(samples, offset, end);
    const timeMs = Math.round((offset / DEFAULT_SAMPLE_RATE) * 1000);

    if (rms > cfg.silenceThreshold) {
      // Voice activity: pick from the cycling pattern
      const viseme =
        AMPLITUDE_VISEME_CYCLE[cycleIndex % AMPLITUDE_VISEME_CYCLE.length];
      cycleIndex++;

      // Weight scales with amplitude (clamped to [0, 1])
      const weight = Math.min(1, rms / 0.3);

      cues.push({
        time: timeMs,
        viseme,
        duration: cfg.windowSize,
        weight,
      });
    } else {
      // Silence
      cues.push({
        time: timeMs,
        viseme: "sil",
        duration: cfg.windowSize,
        weight: 0,
      });
      // Reset cycle on silence so speech starts fresh
      cycleIndex = 0;
    }
  }

  return cues;
}

/**
 * Compute RMS (root mean square) of a sample range.
 */
function computeRMS(
  samples: Float32Array,
  start: number,
  end: number,
): number {
  if (end <= start) return 0;

  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / (end - start));
}

/**
 * Apply LERP-based weight interpolation between consecutive viseme cues.
 *
 * When a viseme transition occurs near the end of a cue's duration,
 * the weight is interpolated to create smoother mouth movements.
 * This modifies the weight of cues in the transition zone.
 */
function applyLerp(cues: VisemeCue[], lerpDurationMs: number): VisemeCue[] {
  if (cues.length <= 1) return cues;

  const result: VisemeCue[] = [];

  for (let i = 0; i < cues.length; i++) {
    const current = cues[i];
    const next = cues[i + 1];

    if (next && current.viseme !== next.viseme && lerpDurationMs > 0) {
      // Transition zone: split the current cue into a main part and a blend part
      const blendMs = Math.min(lerpDurationMs, current.duration);
      const mainDuration = current.duration - blendMs;

      if (mainDuration > 0) {
        // Main portion at full weight
        result.push({
          time: current.time,
          viseme: current.viseme,
          duration: mainDuration,
          weight: current.weight,
        });
      }

      // Blend portion with interpolated weight (ramp toward next cue)
      const blendWeight = (current.weight + next.weight) / 2;
      result.push({
        time: current.time + mainDuration,
        viseme: current.viseme,
        duration: blendMs,
        weight: blendWeight,
      });
    } else {
      result.push({ ...current });
    }
  }

  return result;
}
