import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { getOrLoadModel, isVoskAvailable, isModelDownloaded, getDefaultModelId } from "./vosk-manager";

// Find ffmpeg using the same logic as transcription.ts
function findFfmpegBinary(): string | null {
  const { existsSync } = require("node:fs");
  const { join } = require("node:path");

  // 1. ffmpeg-static
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegStaticPath = require("ffmpeg-static") as string;
    if (ffmpegStaticPath && existsSync(ffmpegStaticPath)) return ffmpegStaticPath;
  } catch {}

  // 2. Common system paths
  const commonPaths = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ];
  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }

  // 3. PATH lookup
  try {
    const { execFileSync } = require("node:child_process");
    const cmd = process.platform === "win32" ? "where" : "which";
    const result = (execFileSync(cmd, ["ffmpeg"], { timeout: 3000, stdio: "pipe", encoding: "utf-8" }) as string).trim();
    if (result && existsSync(result.split("\n")[0].trim())) return result.split("\n")[0].trim();
  } catch {}

  return null;
}

interface VoskSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognizer: any;
  ffmpegProcess: ChildProcess;
  pcmBuffer: Buffer;
  createdAt: number;
  finalized: boolean;
}

const sessions = new Map<string, VoskSession>();

// Auto-expire sessions after 5 minutes
const SESSION_TTL_MS = 5 * 60 * 1000;

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      destroySession(id, session);
    }
  }
}, 60_000);

// Prevent the interval from keeping Node alive
if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
  cleanupInterval.unref();
}

function destroySession(id: string, session: VoskSession): void {
  try { session.ffmpegProcess.kill(); } catch {}
  try { session.recognizer.free(); } catch {}
  sessions.delete(id);
}

/**
 * Check if Vosk streaming is available (module installed + model downloaded + ffmpeg available).
 */
export function isVoskStreamingAvailable(): boolean {
  return isVoskAvailable() && isModelDownloaded() && findFfmpegBinary() !== null;
}

/**
 * Create a new streaming Vosk recognizer session.
 * Spawns an ffmpeg process that converts webm/opus to raw PCM (16kHz, mono, s16le).
 */
export function createSession(sessionId: string): void {
  if (sessions.has(sessionId)) {
    return; // Already exists
  }

  const ffmpegPath = findFfmpegBinary();
  if (!ffmpegPath) {
    throw new Error("ffmpeg not found — required for Vosk streaming");
  }

  const model = getOrLoadModel(getDefaultModelId());

  // Dynamic require to prevent Turbopack from statically resolving the optional dependency
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const name = "vosk";
  const vosk = require(/* webpackIgnore: true */ name) as any;
  const recognizer = new vosk.Recognizer({ model, sampleRate: 16000 });

  // ffmpeg: read webm from stdin, output raw PCM to stdout
  const ffmpegProcess = spawn(ffmpegPath, [
    "-i", "pipe:0",         // read from stdin
    "-f", "s16le",          // raw PCM output
    "-ar", "16000",         // 16kHz
    "-ac", "1",             // mono
    "pipe:1",               // write to stdout
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Collect PCM data from ffmpeg stdout
  let pcmBuffer = Buffer.alloc(0);

  ffmpegProcess.stdout?.on("data", (chunk: Buffer) => {
    const session = sessions.get(sessionId);
    if (session) {
      session.pcmBuffer = Buffer.concat([session.pcmBuffer, chunk]);
    }
  });

  ffmpegProcess.stderr?.on("data", () => {
    // Suppress ffmpeg stderr noise
  });

  ffmpegProcess.on("error", (err) => {
    console.error(`[Vosk] ffmpeg error for session ${sessionId}:`, err.message);
  });

  sessions.set(sessionId, {
    recognizer,
    ffmpegProcess,
    pcmBuffer: Buffer.alloc(0),
    createdAt: Date.now(),
    finalized: false,
  });

  console.log(`[Vosk] Session created: ${sessionId}`);
}

/**
 * Feed a webm audio chunk into the session.
 * Returns partial/final recognition results.
 */
export function feedChunk(
  sessionId: string,
  chunk: Buffer
): { partial?: string; text?: string } {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Vosk session not found: ${sessionId}`);
  }
  if (session.finalized) {
    throw new Error(`Vosk session already finalized: ${sessionId}`);
  }

  // Write webm chunk to ffmpeg stdin
  try {
    session.ffmpegProcess.stdin?.write(chunk);
  } catch {
    // ffmpeg may have closed — ignore
  }

  // Process any accumulated PCM data
  const pcm = session.pcmBuffer;
  session.pcmBuffer = Buffer.alloc(0);

  if (pcm.length === 0) {
    return {};
  }

  // Feed PCM to Vosk recognizer
  const isComplete = session.recognizer.acceptWaveform(pcm);

  if (isComplete) {
    const result = session.recognizer.result();
    return { text: result.text || undefined };
  }

  const partial = session.recognizer.partialResult();
  return { partial: partial.partial || undefined };
}

/**
 * End the session and get the final transcription result.
 */
export function endSession(sessionId: string): { text: string } {
  const session = sessions.get(sessionId);
  if (!session) {
    return { text: "" };
  }

  session.finalized = true;

  // Close ffmpeg stdin to flush remaining data
  try { session.ffmpegProcess.stdin?.end(); } catch {}

  // Give ffmpeg a moment to flush, then process remaining PCM
  const remainingPcm = session.pcmBuffer;
  if (remainingPcm.length > 0) {
    session.recognizer.acceptWaveform(remainingPcm);
  }

  const finalResult = session.recognizer.finalResult();
  const text = finalResult.text || "";

  destroySession(sessionId, session);
  console.log(`[Vosk] Session ended: ${sessionId}, text length: ${text.length}`);

  return { text };
}

/**
 * Cancel and clean up a session without getting results.
 */
export function cancelSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    destroySession(sessionId, session);
    console.log(`[Vosk] Session cancelled: ${sessionId}`);
  }
}
