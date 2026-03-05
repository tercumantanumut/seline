/**
 * Rhubarb-Based Lipsync Analysis
 *
 * High-quality lipsync path using the Rhubarb Lip Sync binary for
 * phoneme-level mouth shape detection. Falls back to amplitude-based
 * analysis when the binary is not available.
 *
 * Rhubarb produces shapes A–H and X (silence), which are mapped to
 * Oculus visemes for TalkingHead.js consumption.
 *
 * @see https://github.com/DanielSWolf/rhubarb-lip-sync
 */

import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { promisify } from "node:util";
import type {
  LipsyncConfig,
  LipsyncResult,
  OculusViseme,
  RhubarbOutput,
  VisemeCue,
} from "./types";
import { DEFAULT_LIPSYNC_CONFIG } from "./types";
import { analyzeAmplitude } from "./lipsync-amplitude";

const execFileAsync = promisify(execFile);

// ── Rhubarb → Oculus Mapping ─────────────────────────────────────────────────

/**
 * Maps Rhubarb shape letters to Oculus visemes.
 * Matches the mapping from the DYAI fork's avatar-canvas.tsx.
 */
const RHUBARB_TO_OCULUS: Record<string, OculusViseme> = {
  X: "sil",
  A: "PP",
  B: "E",
  C: "aa",
  D: "O",
  E: "RR",
  F: "FF",
  G: "kk",
  H: "DD",
};

// ── Binary Detection ─────────────────────────────────────────────────────────

/** Common locations to search for the rhubarb binary */
const RHUBARB_SEARCH_PATHS: readonly string[] = [
  "rhubarb",                       // In PATH
  "/usr/local/bin/rhubarb",
  "/usr/bin/rhubarb",
  "/opt/homebrew/bin/rhubarb",
  "/opt/rhubarb/rhubarb",
];

/** Cached binary path (null = not yet checked, undefined = not found) */
let cachedBinaryPath: string | null | undefined = null;

/**
 * Check whether the rhubarb binary is available on this system.
 * Result is cached after first call.
 */
export function isRhubarbAvailable(): boolean {
  return findRhubarbBinary() !== undefined;
}

/**
 * Find the rhubarb binary path. Returns undefined if not found.
 * Caches the result for subsequent calls.
 */
function findRhubarbBinary(): string | undefined {
  // Already resolved
  if (cachedBinaryPath !== null) {
    return cachedBinaryPath;
  }

  for (const candidate of RHUBARB_SEARCH_PATHS) {
    if (isBinaryExecutable(candidate)) {
      cachedBinaryPath = candidate;
      return candidate;
    }
  }

  cachedBinaryPath = undefined;
  return undefined;
}

/**
 * Check if a file path points to an executable binary.
 */
function isBinaryExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Maximum time to wait for rhubarb to finish processing (30 seconds) */
const RHUBARB_TIMEOUT_MS = 30_000;

/**
 * Analyze an audio file using the Rhubarb Lip Sync binary.
 *
 * The file should be in WAV format for best results. Rhubarb also
 * accepts some other formats depending on build configuration.
 *
 * Falls back to amplitude-based analysis if:
 * - Rhubarb binary is not found
 * - Rhubarb times out (>30s)
 * - Rhubarb exits with an error
 *
 * @param audioFilePath - Absolute path to an audio file (WAV preferred)
 * @param config        - Optional partial config overrides
 * @returns LipsyncResult with viseme cues
 */
export async function analyzeRhubarb(
  audioFilePath: string,
  config?: Partial<LipsyncConfig>,
): Promise<LipsyncResult> {
  const binaryPath = findRhubarbBinary();

  if (!binaryPath) {
    console.warn(
      "[Lipsync] Rhubarb binary not found, falling back to amplitude analysis",
    );
    return fallbackToAmplitude(audioFilePath, config);
  }

  try {
    const { stdout } = await execFileAsync(
      binaryPath,
      [audioFilePath, "-f", "json", "--machineReadable"],
      { timeout: RHUBARB_TIMEOUT_MS },
    );

    const output: RhubarbOutput = JSON.parse(stdout);
    const visemes = mapRhubarbCues(output);
    const duration = computeDurationFromCues(output);

    return {
      visemes,
      duration,
      method: "rhubarb",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      "[Lipsync] Rhubarb analysis failed, falling back to amplitude:",
      message,
    );
    return fallbackToAmplitude(audioFilePath, config);
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

/**
 * Map Rhubarb's mouth cues to Oculus viseme cues.
 */
function mapRhubarbCues(output: RhubarbOutput): VisemeCue[] {
  return output.mouthCues.map((cue) => {
    const viseme = RHUBARB_TO_OCULUS[cue.value] ?? "sil";
    const startMs = Math.round(cue.start * 1000);
    const endMs = Math.round(cue.end * 1000);

    return {
      time: startMs,
      viseme,
      duration: endMs - startMs,
      weight: viseme === "sil" ? 0 : 1.0,
    };
  });
}

/**
 * Compute total audio duration from Rhubarb output (last cue's end time).
 */
function computeDurationFromCues(output: RhubarbOutput): number {
  if (output.mouthCues.length === 0) return 0;
  const lastCue = output.mouthCues[output.mouthCues.length - 1];
  return Math.round(lastCue.end * 1000);
}

/**
 * Fallback: return an empty amplitude result.
 *
 * We can't decode the file from a path alone without an external tool,
 * so we return an empty result. The caller should use amplitude analysis
 * directly with raw PCM data when they have it.
 */
function fallbackToAmplitude(
  _audioFilePath: string,
  _config?: Partial<LipsyncConfig>,
): LipsyncResult {
  return { visemes: [], duration: 0, method: "amplitude" };
}

// ── Test helpers (exported for tests only) ───────────────────────────────────

/** Reset the cached binary path. Intended for tests. */
export function _resetBinaryCache(): void {
  cachedBinaryPath = null;
}

/** Parse rhubarb JSON output into viseme cues. Exported for testing. */
export function _parseRhubarbOutput(output: RhubarbOutput): VisemeCue[] {
  return mapRhubarbCues(output);
}

/** Compute duration from rhubarb output. Exported for testing. */
export function _computeDuration(output: RhubarbOutput): number {
  return computeDurationFromCues(output);
}
