/**
 * Whisper.cpp Local Transcription — End-to-End Integration Tests
 *
 * These tests exercise the REAL whisper-cli binary and ffmpeg against
 * synthetic audio files, verifying the full pipeline works in electron:dev.
 *
 * Prerequisites:
 *   - whisper-cli installed: `brew install whisper-cpp`
 *   - ffmpeg installed: `brew install ffmpeg`
 *   - A whisper model downloaded (ggml-tiny.en or any from Settings)
 *
 * Run:
 *   npm run test:integration -- tests/whisper-cpp-transcription.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir, platform } from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find whisper-cli binary */
function findWhisperCli(): string | null {
  const paths = ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  try {
    return execFileSync("which", ["whisper-cli"], { encoding: "utf-8", timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

/** Find ffmpeg binary */
function findFfmpeg(): string | null {
  const paths = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  try {
    return execFileSync("which", ["ffmpeg"], { encoding: "utf-8", timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

/** Find a downloaded whisper model */
function findModel(): string | null {
  const appName = "seline";
  const os = platform();

  // Build search paths (same logic as transcription.ts)
  const searchDirs: string[] = [];

  // Electron userData
  if (os === "darwin") {
    searchDirs.push(join(homedir(), "Library", "Application Support", appName, "models", "whisper"));
  } else if (os === "win32") {
    searchDirs.push(join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), appName, "models", "whisper"));
  } else {
    searchDirs.push(join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), appName, "models", "whisper"));
  }

  // Dev fallback
  searchDirs.push(join(process.cwd(), ".local-data", "models", "whisper"));

  // Homebrew
  searchDirs.push("/opt/homebrew/share/whisper-cpp/models");
  searchDirs.push("/usr/local/share/whisper-cpp/models");

  // Look for any .bin model
  const preferredModels = ["ggml-tiny.en.bin", "ggml-tiny.bin", "ggml-base.en.bin", "ggml-base.bin"];
  for (const dir of searchDirs) {
    for (const model of preferredModels) {
      const p = join(dir, model);
      if (existsSync(p)) return p;
    }
  }

  return null;
}

/** Generate synthetic audio with ffmpeg */
function generateTestAudio(
  ffmpegPath: string,
  outputPath: string,
  opts: { codec?: string; format?: string; duration?: number; frequency?: number } = {}
): void {
  const { codec = "pcm_s16le", format = "wav", duration = 3, frequency = 440 } = opts;

  const args = [
    "-y",
    "-f", "lavfi",
    "-i", `sine=frequency=${frequency}:duration=${duration}`,
  ];

  if (codec === "libopus") {
    args.push("-c:a", "libopus", "-b:a", "32k");
  } else if (codec === "libvorbis") {
    args.push("-c:a", "libvorbis", "-q:a", "2");
  } else if (codec === "libmp3lame") {
    args.push("-c:a", "libmp3lame", "-b:a", "64k");
  } else {
    args.push("-c:a", codec);
  }

  args.push(outputPath);

  execFileSync(ffmpegPath, args, { timeout: 10000, stdio: "pipe" });
}

/** Generate speech-like audio using ffmpeg (speech synthesis via TTS or just noise) */
function generateSpeechAudio(ffmpegPath: string, outputPath: string, codec: string): void {
  // Generate white noise that whisper will try to transcribe
  // (better than silence which produces no output)
  const args = [
    "-y",
    "-f", "lavfi",
    "-i", "anoisesrc=d=3:c=pink:r=16000:a=0.1",
  ];

  if (codec === "libopus") {
    args.push("-c:a", "libopus", "-b:a", "32k");
  } else if (codec === "libvorbis") {
    args.push("-c:a", "libvorbis", "-q:a", "2");
  } else if (codec === "libmp3lame") {
    args.push("-c:a", "libmp3lame", "-b:a", "64k");
  } else if (codec === "aac") {
    args.push("-c:a", "aac", "-b:a", "64k");
  } else {
    args.push("-c:a", codec, "-ar", "16000", "-ac", "1");
  }

  args.push(outputPath);

  execFileSync(ffmpegPath, args, { timeout: 10000, stdio: "pipe" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Whisper.cpp E2E Transcription", () => {
  let whisperCli: string;
  let ffmpeg: string;
  let modelPath: string;
  let tmpDir: string;

  beforeAll(() => {
    const cli = findWhisperCli();
    const ff = findFfmpeg();
    const model = findModel();

    if (!cli) {
      console.warn("⚠️  whisper-cli not found — skipping E2E tests. Install: brew install whisper-cpp");
      return;
    }
    if (!ff) {
      console.warn("⚠️  ffmpeg not found — skipping E2E tests. Install: brew install ffmpeg");
      return;
    }
    if (!model) {
      console.warn("⚠️  No whisper model found — skipping E2E tests. Download one in Settings → Voice & Audio.");
      return;
    }

    whisperCli = cli;
    ffmpeg = ff;
    modelPath = model;
    tmpDir = join(tmpdir(), `seline-whisper-e2e-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    console.log(`[E2E] whisper-cli: ${whisperCli}`);
    console.log(`[E2E] ffmpeg: ${ffmpeg}`);
    console.log(`[E2E] model: ${modelPath}`);
    console.log(`[E2E] tmpDir: ${tmpDir}`);
  });

  afterAll(() => {
    if (tmpDir && existsSync(tmpDir)) {
      // Clean up temp files
      try {
        execSync(`rm -rf "${tmpDir}"`, { timeout: 5000 });
      } catch {}
    }
  });

  // Helper: skip if prerequisites not met
  function requirePrereqs() {
    if (!whisperCli || !ffmpeg || !modelPath) {
      return false;
    }
    return true;
  }

  // Helper: run the full pipeline (ffmpeg convert → whisper-cli → parse JSON)
  function runPipeline(inputPath: string): { text: string; language?: string; jsonPath: string } {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const wavPath = join(tmpDir, `conv-${id}.wav`);
    const outBase = join(tmpDir, `out-${id}`);
    const jsonPath = `${outBase}.json`;

    // Step 1: Convert to 16kHz mono WAV
    execFileSync(ffmpeg, [
      "-y", "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      wavPath,
    ], { timeout: 30000, stdio: "pipe" });

    expect(existsSync(wavPath)).toBe(true);

    // Step 2: Run whisper-cli
    const result = execFileSync(whisperCli, [
      "-m", modelPath,
      "-f", wavPath,
      "-of", outBase,
      "-oj",
      "-np",
      "--no-timestamps",
    ], { timeout: 120000, stdio: "pipe", encoding: "utf-8" });

    // Step 3: Parse JSON output
    expect(existsSync(jsonPath)).toBe(true);

    const output = JSON.parse(readFileSync(jsonPath, "utf-8"));

    let text = "";
    if (output.transcription && Array.isArray(output.transcription)) {
      text = output.transcription.map((s: { text: string }) => s.text).join(" ").trim();
    } else if (typeof output.text === "string") {
      text = output.text.trim();
    }

    return {
      text,
      language: output.result?.language,
      jsonPath,
    };
  }

  // ── Core pipeline tests ──────────────────────────────────────────────

  it("transcribes Opus-in-OGG (Telegram voice note format)", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "telegram-voice.ogg");
    generateSpeechAudio(ffmpeg, inputPath, "libopus");

    // This is the exact format that was failing before the fix
    const result = runPipeline(inputPath);

    // We don't care WHAT it transcribes (it's noise), just that the pipeline completes
    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe("string");
    expect(result.language).toBe("en");
    console.log(`[E2E] Opus-in-OGG transcription: "${result.text}"`);
  });

  it("transcribes Vorbis-in-OGG", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "vorbis-voice.ogg");
    generateSpeechAudio(ffmpeg, inputPath, "libvorbis");

    const result = runPipeline(inputPath);
    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe("string");
    console.log(`[E2E] Vorbis-in-OGG transcription: "${result.text}"`);
  });

  it("transcribes MP3 (WhatsApp voice note format)", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "whatsapp-voice.mp3");
    generateSpeechAudio(ffmpeg, inputPath, "libmp3lame");

    const result = runPipeline(inputPath);
    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe("string");
    console.log(`[E2E] MP3 transcription: "${result.text}"`);
  });

  it("transcribes WAV (direct format)", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "direct.wav");
    generateSpeechAudio(ffmpeg, inputPath, "pcm_s16le");

    const result = runPipeline(inputPath);
    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe("string");
    console.log(`[E2E] WAV transcription: "${result.text}"`);
  });

  it("transcribes WebM/Opus (Discord voice message format)", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "discord-voice.webm");
    // Generate WebM with Opus codec
    execFileSync(ffmpeg, [
      "-y", "-f", "lavfi",
      "-i", "anoisesrc=d=3:c=pink:r=16000:a=0.1",
      "-c:a", "libopus", "-b:a", "32k",
      inputPath,
    ], { timeout: 10000, stdio: "pipe" });

    const result = runPipeline(inputPath);
    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe("string");
    console.log(`[E2E] WebM/Opus transcription: "${result.text}"`);
  });

  it("transcribes M4A/AAC (iOS voice memo format)", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "ios-memo.m4a");
    execFileSync(ffmpeg, [
      "-y", "-f", "lavfi",
      "-i", "anoisesrc=d=3:c=pink:r=16000:a=0.1",
      "-c:a", "aac", "-b:a", "64k",
      inputPath,
    ], { timeout: 10000, stdio: "pipe" });

    const result = runPipeline(inputPath);
    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe("string");
    console.log(`[E2E] M4A/AAC transcription: "${result.text}"`);
  });

  // ── Whisper-cli direct failure test (proves the bug) ─────────────────

  it("proves whisper-cli CANNOT read Opus-in-OGG directly (the original bug)", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "opus-direct-test.ogg");
    const outBase = join(tmpDir, "opus-direct-out");
    const jsonPath = `${outBase}.json`;

    // Generate Opus-in-OGG (Telegram format)
    generateSpeechAudio(ffmpeg, inputPath, "libopus");

    // Run whisper-cli DIRECTLY without ffmpeg conversion
    execFileSync(whisperCli, [
      "-m", modelPath,
      "-f", inputPath,
      "-of", outBase,
      "-oj",
      "-np",
      "--no-timestamps",
    ], { timeout: 30000, stdio: "pipe" });

    // whisper-cli exits 0 but produces NO output file — this is the bug
    const hasOutput = existsSync(jsonPath);
    expect(hasOutput).toBe(false); // Proves the bug exists in whisper-cli

    console.log(`[E2E] Confirmed: whisper-cli cannot read Opus-in-OGG directly (no output file produced)`);
  });

  // ── ffmpeg conversion verification ───────────────────────────────────

  it("ffmpeg correctly converts Opus-in-OGG to 16kHz mono WAV", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "ffmpeg-test-input.ogg");
    const outputPath = join(tmpDir, "ffmpeg-test-output.wav");

    generateSpeechAudio(ffmpeg, inputPath, "libopus");

    execFileSync(ffmpeg, [
      "-y", "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      outputPath,
    ], { timeout: 10000, stdio: "pipe" });

    expect(existsSync(outputPath)).toBe(true);

    // Verify WAV properties using ffprobe
    const probeResult = execFileSync(ffmpeg.replace("ffmpeg", "ffprobe"), [
      "-v", "error",
      "-show_entries", "stream=sample_rate,channels,codec_name",
      "-of", "json",
      outputPath,
    ], { timeout: 5000, encoding: "utf-8", stdio: "pipe" });

    const probe = JSON.parse(probeResult);
    const stream = probe.streams[0];
    expect(stream.codec_name).toBe("pcm_s16le");
    expect(stream.sample_rate).toBe("16000");
    expect(stream.channels).toBe(1);

    console.log("[E2E] ffmpeg conversion verified: 16kHz mono PCM s16le WAV ✓");
  });

  // ── JSON output format verification ──────────────────────────────────

  it("whisper-cli JSON output has expected structure", () => {
    if (!requirePrereqs()) return;

    const inputPath = join(tmpDir, "json-format-test.wav");
    generateSpeechAudio(ffmpeg, inputPath, "pcm_s16le");

    const outBase = join(tmpDir, "json-format-out");
    const jsonPath = `${outBase}.json`;

    execFileSync(ffmpeg, [
      "-y", "-i", inputPath,
      "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
      join(tmpDir, "json-format-conv.wav"),
    ], { timeout: 10000, stdio: "pipe" });

    execFileSync(whisperCli, [
      "-m", modelPath,
      "-f", join(tmpDir, "json-format-conv.wav"),
      "-of", outBase,
      "-oj",
      "-np",
      "--no-timestamps",
    ], { timeout: 120000, stdio: "pipe" });

    expect(existsSync(jsonPath)).toBe(true);

    const output = JSON.parse(readFileSync(jsonPath, "utf-8"));

    // Verify expected JSON structure
    expect(output).toHaveProperty("systeminfo");
    expect(output).toHaveProperty("model");
    expect(output).toHaveProperty("params");
    expect(output).toHaveProperty("result");
    expect(output).toHaveProperty("transcription");
    expect(output.result).toHaveProperty("language");
    expect(Array.isArray(output.transcription)).toBe(true);

    if (output.transcription.length > 0) {
      expect(output.transcription[0]).toHaveProperty("text");
    }

    console.log("[E2E] JSON output structure verified ✓");
    console.log(`[E2E] Model type: ${output.model?.type}, language: ${output.result?.language}`);
  });

  // ── Full transcription module integration ────────────────────────────

  it("transcribeAudio() works end-to-end with Opus-in-OGG", async () => {
    if (!requirePrereqs()) return;

    // Generate an Opus-in-OGG test file
    const inputPath = join(tmpDir, "module-e2e-test.ogg");
    generateSpeechAudio(ffmpeg, inputPath, "libopus");

    const audioBuffer = readFileSync(inputPath);

    // Import the actual transcription module
    // We need to set up settings first
    const { loadSettings, saveSettings } = await import("@/lib/settings/settings-manager");

    // Save current settings and set up for local transcription
    const originalSettings = loadSettings();
    try {
      saveSettings({
        ...originalSettings,
        sttEnabled: true,
        sttProvider: "local",
        sttLocalModel: "ggml-tiny.en",
      });

      const { transcribeAudio, isTranscriptionAvailable, isWhisperCppAvailable } = await import("@/lib/audio/transcription");

      // Verify availability
      expect(isWhisperCppAvailable()).toBe(true);
      expect(isTranscriptionAvailable()).toBe(true);

      // Run the actual transcription
      const result = await transcribeAudio(audioBuffer, "audio/ogg", "test-voice-note.ogg");

      expect(result).toBeDefined();
      expect(result.provider).toBe("whisper.cpp");
      expect(typeof result.text).toBe("string");
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.language).toBe("en");

      console.log(`[E2E] transcribeAudio() result: "${result.text}" (provider: ${result.provider})`);
    } finally {
      // Restore original settings
      saveSettings(originalSettings);
    }
  });
});
