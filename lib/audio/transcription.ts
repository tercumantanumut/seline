import { loadSettings } from "@/lib/settings/settings-manager";
import { getWhisperModel, DEFAULT_WHISPER_MODEL } from "@/lib/config/whisper-models";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { tmpdir, homedir, platform } from "node:os";

export interface TranscriptionResult {
  text: string;
  provider: string;
  durationSeconds?: number;
  language?: string;
}

/**
 * Transcribe an audio buffer using the configured STT provider.
 * Supports OpenAI Whisper API (cloud) and whisper.cpp (local, on-device).
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
  filename?: string
): Promise<TranscriptionResult> {
  const settings = loadSettings();

  if (!settings.sttEnabled) {
    throw new Error("Speech-to-text is disabled in settings");
  }

  const provider = settings.sttProvider || "openai";

  if (provider === "openai") {
    return transcribeWithOpenAI(audio, mimeType, filename);
  }

  if (provider === "local") {
    return transcribeWithWhisperCpp(audio, mimeType, filename);
  }

  throw new Error(`Unsupported STT provider: ${provider}`);
}

// ---------------------------------------------------------------------------
// OpenAI Whisper (cloud)
// ---------------------------------------------------------------------------

async function transcribeWithOpenAI(
  audio: Buffer,
  mimeType: string,
  filename?: string
): Promise<TranscriptionResult> {
  const settings = loadSettings();

  // Priority: settings.openaiApiKey > env OPENAI_API_KEY > settings.openrouterApiKey (fallback)
  const openaiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY;
  const openrouterKey = settings.openrouterApiKey;

  if (!openaiKey && !openrouterKey) {
    throw new Error(
      "No API key configured for transcription. " +
      "Please add your OpenAI API key in Settings → API Keys, " +
      "or configure an OpenRouter API key as a fallback."
    );
  }

  // Whisper API is only available on OpenAI directly (not OpenRouter)
  const effectiveKey = openaiKey || openrouterKey!;
  const baseUrl = "https://api.openai.com/v1";

  const extension = getExtensionForMimeType(mimeType);
  const effectiveFilename = filename || `audio.${extension}`;

  const formData = new FormData();
  const uint8 = new Uint8Array(audio);
  const blob = new Blob([uint8 as BlobPart], { type: mimeType });
  formData.append("file", blob, effectiveFilename);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${effectiveKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    const statusCode = response.status;

    if (statusCode === 401) {
      const keySource = openaiKey ? "OpenAI" : "OpenRouter (fallback)";
      throw new Error(
        `Whisper API authentication failed (401) using ${keySource} key. ` +
        `Please verify your OpenAI API key in Settings → API Keys. ` +
        `Note: OpenAI Whisper requires a direct OpenAI API key (sk-...), not an OpenRouter key.`
      );
    }

    throw new Error(`OpenAI Whisper API error ${statusCode}: ${errorText}`);
  }

  const result = await response.json() as {
    text: string;
    duration?: number;
    language?: string;
  };

  console.log(
    `[STT] Transcribed audio (${result.duration?.toFixed(1)}s) via OpenAI Whisper`
  );

  return {
    text: result.text,
    provider: "openai",
    durationSeconds: result.duration,
    language: result.language,
  };
}

// ---------------------------------------------------------------------------
// whisper.cpp (local, on-device)
// ---------------------------------------------------------------------------

/**
 * Local transcription via whisper-cli (whisper.cpp).
 *
 * Writes audio to a temp file, invokes whisper-cli with JSON output,
 * parses the result, and returns TranscriptionResult.
 *
 * Requires:
 *   - whisper-cli binary in PATH
 *     or a custom path in settings.whisperCppPath
 *   - A downloaded GGML model file (.bin)
 */
async function transcribeWithWhisperCpp(
  audio: Buffer,
  mimeType: string,
  _filename?: string
): Promise<TranscriptionResult> {
  const settings = loadSettings();
  const modelId = settings.sttLocalModel || DEFAULT_WHISPER_MODEL;
  const modelInfo = getWhisperModel(modelId);
  const modelPath = resolveWhisperModelPath(modelId);

  if (!modelPath) {
    throw new Error(
      `Whisper model "${modelInfo?.name || modelId}" not found. ` +
      `Please download it in Settings → Voice & Audio → Whisper Model.`
    );
  }

  const binaryPath = findWhisperBinary();
  if (!binaryPath) {
    throw new Error(
      "whisper-cli not found. Install whisper.cpp (macOS: brew install whisper-cpp, Windows: download whisper-bin-x64.zip from https://github.com/ggml-org/whisper.cpp/releases)\n" +
      "Or set a custom path in Settings → Voice & Audio."
    );
  }

  // Always convert to 16kHz mono WAV via ffmpeg before passing to whisper-cli.
  //
  // Why not rely on whisper-cli's built-in format support?
  //   - whisper-cli claims to support "ogg" but only handles Vorbis-in-OGG.
  //     Telegram/WhatsApp voice notes use Opus-in-OGG, which whisper-cli
  //     silently fails on (exit 0, no output file).
  //   - ffmpeg handles every codec reliably and normalises to the exact
  //     format Whisper expects internally (16 kHz, mono, PCM s16le).
  //   - Conversion is fast (<100 ms for typical voice notes).
  const ext = getExtensionForMimeType(mimeType);

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpIn = join(tmpdir(), `seline-stt-in-${id}.${ext}`);
  const tmpWav = join(tmpdir(), `seline-stt-conv-${id}.wav`);
  const tmpOut = join(tmpdir(), `seline-stt-out-${id}`);

  try {
    writeFileSync(tmpIn, audio);

    // Convert to 16kHz mono WAV — the optimal input format for Whisper
    const ffmpegPath = findFfmpegBinary();
    if (!ffmpegPath) {
      throw new Error(
        "ffmpeg is required for local whisper.cpp transcription but was not found. " +
        "Install it with your package manager and ensure it is in PATH."
      );
    }

    try {
      execFileSync(ffmpegPath, [
        "-y", "-i", tmpIn,
        "-ar", "16000",     // 16kHz sample rate (optimal for Whisper)
        "-ac", "1",         // mono
        "-c:a", "pcm_s16le",
        tmpWav,
      ], { timeout: 30000, stdio: "pipe" });
    } catch (ffmpegErr) {
      const msg = ffmpegErr instanceof Error ? ffmpegErr.message : String(ffmpegErr);
      throw new Error(
        `ffmpeg failed to convert audio (format: ${ext}): ${msg}`
      );
    }

    const inputPath = tmpWav;

    // Build whisper-cli arguments
    const args: string[] = [
      "-m", modelPath,
      "-f", inputPath,
      "-of", tmpOut,
      "-oj",              // JSON output
      "-np",              // no extra prints (clean output)
      "--no-timestamps",  // simpler output for voice notes
    ];

    // Auto-detect language for multilingual models
    if (modelInfo?.language === "multilingual") {
      args.push("-l", "auto");
    }

    // Run whisper-cli with a generous timeout (model loading can be slow first time)
    const startTime = Date.now();
    const effectiveBinaryPath = runWhisperCli(binaryPath, args);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Parse JSON output
    const jsonPath = `${tmpOut}.json`;
    if (!existsSync(jsonPath)) {
      throw new Error("whisper-cli did not produce output. The audio may be too short or silent.");
    }

    const output = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      transcription?: Array<{ text: string }>;
      result?: { language?: string };
      // Some versions use different structure
      text?: string;
      language?: string;
    };

    // Extract text — handle different whisper.cpp JSON output formats
    let text = "";
    if (output.transcription && Array.isArray(output.transcription)) {
      text = output.transcription.map((s) => s.text).join(" ").trim();
    } else if (typeof output.text === "string") {
      text = output.text.trim();
    }

    if (!text) {
      throw new Error("Transcription produced empty result. The audio may be silent or too short.");
    }

    const detectedLang = output.result?.language || output.language;

    console.log(
      `[STT] Transcribed audio (${elapsed}s) via whisper.cpp (model: ${modelInfo?.name || modelId}, bin: ${basename(effectiveBinaryPath)})`
    );

    return {
      text,
      provider: "whisper.cpp",
      language: detectedLang || (modelInfo?.language === "en" ? "en" : undefined),
    };
  } finally {
    // Cleanup temp files
    try { unlinkSync(tmpIn); } catch {}
    try { unlinkSync(tmpWav); } catch {}
    try { unlinkSync(`${tmpOut}.json`); } catch {}
    // whisper-cli may also create .txt, .srt etc
    try { unlinkSync(`${tmpOut}.txt`); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Availability checks
// ---------------------------------------------------------------------------

/**
 * Check if audio transcription is available with the current settings.
 */
export function isTranscriptionAvailable(): boolean {
  const settings = loadSettings();
  if (!settings.sttEnabled) return false;

  if (settings.sttProvider === "local") {
    return isWhisperCppAvailable();
  }

  // OpenAI provider — need an API key
  return !!(settings.openaiApiKey || process.env.OPENAI_API_KEY || settings.openrouterApiKey);
}

/**
 * Check if local whisper.cpp transcription is available.
 * Verifies both the whisper-cli binary and the selected model file exist.
 */
export function isWhisperCppAvailable(): boolean {
  try {
    const binaryPath = findWhisperBinary();
    if (!binaryPath) return false;

    const settings = loadSettings();
    const modelId = settings.sttLocalModel || DEFAULT_WHISPER_MODEL;
    const modelPath = resolveWhisperModelPath(modelId);
    return !!modelPath;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the whisper-cli binary.
 * Checks: settings path > bundled in Electron resources > common install paths > PATH
 */
function findWhisperBinary(): string | null {
  const settings = loadSettings();

  // 1. Custom path from settings
  if (settings.whisperCppPath && existsSync(settings.whisperCppPath)) {
    return preferNewWhisperBinary(settings.whisperCppPath);
  }

  // 2. Bundled in Electron app resources (production builds)
  for (const relativePath of getWhisperBundledRelativePaths()) {
    const bundledPaths = getBundledBinaryPaths("whisper", relativePath);
    for (const p of bundledPaths) {
      if (existsSync(p)) return p;
    }
  }

  // 3. Common system install paths
  const commonPaths = [
    "/opt/homebrew/bin/whisper-whisper-cli", // newer upstream naming
    "/usr/local/bin/whisper-whisper-cli",
    "/opt/homebrew/bin/whisper-cli",   // Apple Silicon
    "/usr/local/bin/whisper-cli",      // Intel Mac
    join(process.env.ProgramFiles || "C:\\Program Files", "whisper.cpp", "whisper-whisper-cli.exe"),
    join(process.env.ProgramFiles || "C:\\Program Files", "whisper.cpp", "whisper-cli.exe"),
    join(process.env.ProgramFiles || "C:\\Program Files", "whisper.cpp", "main.exe"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "whisper.cpp", "whisper-whisper-cli.exe"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "whisper.cpp", "whisper-cli.exe"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "whisper.cpp", "main.exe"),
    join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Programs", "whisper.cpp", "whisper-whisper-cli.exe"),
    join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Programs", "whisper.cpp", "whisper-cli.exe"),
    join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Programs", "whisper.cpp", "main.exe"),
  ];
  for (const p of commonPaths) {
    if (existsSync(p)) return preferNewWhisperBinary(p);
  }

  // 4. Check PATH
  const fromPath = findExecutableInPath([
    "whisper-whisper-cli",
    "whisper-whisper-cli.exe",
    "whisper-cli",
    "whisper-cli.exe",
    "main.exe",
  ]);
  if (fromPath) return preferNewWhisperBinary(fromPath);

  return null;
}

/**
 * Find the ffmpeg binary.
 * Required for converting audio to WAV before whisper-cli processing.
 * Checks: ffmpeg-static (bundled) > bundled fallback path > common install paths > PATH
 */
function findFfmpegBinary(): string | null {
  // 1. ffmpeg-static npm package (bundled in Electron builds)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegStaticPath = require("ffmpeg-static") as string;
    if (ffmpegStaticPath && existsSync(ffmpegStaticPath)) return ffmpegStaticPath;
  } catch {
    // ffmpeg-static not installed
  }

  // 2. Bundled in Electron app resources (standalone builds)
  for (const relativePath of getFfmpegBundledRelativePaths()) {
    const bundledPaths = getBundledBinaryPaths("standalone", relativePath);
    for (const p of bundledPaths) {
      if (existsSync(p)) return p;
    }
  }

  // 3. Common system paths
  const commonPaths = [
    "/opt/homebrew/bin/ffmpeg",   // Apple Silicon
    "/usr/local/bin/ffmpeg",      // Intel Mac
    join(process.env.ProgramFiles || "C:\\Program Files", "ffmpeg", "bin", "ffmpeg.exe"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "ffmpeg", "bin", "ffmpeg.exe"),
  ];
  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }

  // 4. Check PATH
  const fromPath = findExecutableInPath(["ffmpeg", "ffmpeg.exe"]);
  if (fromPath) return fromPath;

  return null;
}

function getWhisperBundledRelativePaths(): string[] {
  return [
    join("bin", "whisper-whisper-cli"),
    join("bin", "whisper-whisper-cli.exe"),
    join("bin", "whisper-cli"),
    join("bin", "whisper-cli.exe"),
    join("bin", "main.exe"),
  ];
}

function preferNewWhisperBinary(binaryPath: string): string {
  const fileName = basename(binaryPath).toLowerCase();
  const binaryDir = dirname(binaryPath);

  if (fileName === "whisper-cli.exe") {
    const preferred = join(binaryDir, "whisper-whisper-cli.exe");
    if (existsSync(preferred)) return preferred;
  }

  if (fileName === "whisper-cli") {
    const preferred = join(binaryDir, "whisper-whisper-cli");
    if (existsSync(preferred)) return preferred;
  }

  return binaryPath;
}

function runWhisperCli(binaryPath: string, args: string[]): string {
  const firstChoice = preferNewWhisperBinary(binaryPath);
  try {
    execFileSync(firstChoice, args, {
      timeout: 120000, // 2 minutes max
      stdio: "pipe",
      env: buildWhisperRuntimeEnv(firstChoice),
    });
    return firstChoice;
  } catch (err) {
    const output = getProcessErrorOutput(err);
    const replacement = parseDeprecatedWhisperReplacement(output);

    if (replacement) {
      const retryPath = resolveReplacementWhisperBinary(firstChoice, replacement);
      if (retryPath && retryPath !== firstChoice) {
        execFileSync(retryPath, args, {
          timeout: 120000,
          stdio: "pipe",
          env: buildWhisperRuntimeEnv(retryPath),
        });
        return retryPath;
      }

      throw new Error(
        `Bundled whisper binary "${basename(firstChoice)}" is a deprecated launcher and exited before transcription. ` +
        `Expected replacement "${replacement}" was not found. ` +
        `Re-bundle whisper binaries (npm run electron:bundle-whisper) or set a custom binary path in Settings -> Voice & Audio.`
      );
    }

    throw err;
  }
}

function buildWhisperRuntimeEnv(binaryPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Windows loader requires dependent DLL directories in PATH.
  if (platform() === "win32") {
    const libDir = join(dirname(binaryPath), "..", "lib");
    if (existsSync(libDir)) {
      env.PATH = `${libDir};${env.PATH || ""}`;
    }
  }

  return env;
}

function getProcessErrorOutput(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error ?? "");
  }

  const err = error as {
    message?: string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };

  const chunks: string[] = [];
  if (typeof err.stdout === "string") chunks.push(err.stdout);
  if (Buffer.isBuffer(err.stdout)) chunks.push(err.stdout.toString("utf-8"));
  if (typeof err.stderr === "string") chunks.push(err.stderr);
  if (Buffer.isBuffer(err.stderr)) chunks.push(err.stderr.toString("utf-8"));
  if (typeof err.message === "string") chunks.push(err.message);
  return chunks.join("\n").trim();
}

function parseDeprecatedWhisperReplacement(output: string): string | null {
  if (!/is deprecated/i.test(output)) return null;
  const match = output.match(/Please use '([^']+)'/i);
  return match?.[1] || null;
}

function resolveReplacementWhisperBinary(currentBinaryPath: string, replacementName: string): string | null {
  const localCandidate = join(dirname(currentBinaryPath), replacementName);
  if (existsSync(localCandidate)) return localCandidate;

  const fromPath = findExecutableInPath([replacementName]);
  if (fromPath) return fromPath;

  return null;
}

function getFfmpegBundledRelativePaths(): string[] {
  return [
    join("node_modules", ".bin", "ffmpeg"),
    join("node_modules", ".bin", "ffmpeg.exe"),
  ];
}

function findExecutableInPath(candidates: string[]): string | null {
  const lookupCommand = platform() === "win32" ? "where" : "which";
  for (const candidate of candidates) {
    try {
      const output = execFileSync(lookupCommand, [candidate], {
        timeout: 3000,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();
      if (!output) continue;

      const paths = output.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
      for (const p of paths) {
        if (existsSync(p)) return p;
      }
    } catch {
      // Not found in PATH
    }
  }
  return null;
}

/**
 * Get possible paths for bundled binaries in Electron app resources.
 * In production Electron builds, binaries are in:
 *   - resources/binaries/<name>/<relativePath>   (extraResources)
 *   - resources/standalone/binaries/<name>/<relativePath> (inside standalone)
 */
function getBundledBinaryPaths(name: string, relativePath: string): string[] {
  const paths: string[] = [];

  // ELECTRON_RESOURCES_PATH is set by Electron main process
  const resourcesPath = process.env.ELECTRON_RESOURCES_PATH;
  if (resourcesPath) {
    paths.push(join(resourcesPath, "binaries", name, relativePath));
    paths.push(join(resourcesPath, "standalone", "binaries", name, relativePath));
  }

  // Also check relative to the running server (standalone dir)
  const cwd = process.cwd();
  paths.push(join(cwd, "binaries", name, relativePath));

  // Dev mode: check project root
  paths.push(join(cwd, "..", "binaries", name, relativePath));

  return paths;
}

/**
 * Resolve the full path to a whisper model .bin file.
 * Checks Electron models dir and common system locations.
 * Returns null if the model file is not found.
 */
function resolveWhisperModelPath(modelId: string): string | null {
  const modelInfo = getWhisperModel(modelId);
  const filename = modelInfo?.hfFile || `${modelId}.bin`;

  // 1. Electron user data models dir via LOCAL_DATA_PATH env var
  //    In production Electron, LOCAL_DATA_PATH = ~/Library/Application Support/seline/data
  const electronModelsDir = process.env.LOCAL_DATA_PATH
    ? join(process.env.LOCAL_DATA_PATH, "..", "models", "whisper")
    : null;
  if (electronModelsDir) {
    const p = join(electronModelsDir, filename);
    if (existsSync(p)) return p;
  }

  // 2. Platform-specific Electron userData fallback
  //    In electron:dev, the Next.js server doesn't inherit LOCAL_DATA_PATH
  //    from the Electron main process, so we compute the path directly.
  const electronUserDataFallback = getElectronUserDataModelsDir();
  if (electronUserDataFallback) {
    const p = join(electronUserDataFallback, filename);
    if (existsSync(p)) return p;
  }

  // 3. Standard .local-data/models/whisper/ (dev mode)
  const devPath = join(process.cwd(), ".local-data", "models", "whisper", filename);
  if (existsSync(devPath)) return devPath;

  // 4. Homebrew whisper-cpp default model location
  const brewModelPaths = [
    join("/opt/homebrew/share/whisper-cpp/models", filename),
    join("/usr/local/share/whisper-cpp/models", filename),
  ];
  for (const p of brewModelPaths) {
    if (existsSync(p)) return p;
  }

  // 5. WHISPER_CPP_MODEL env var (used by openclaw tests)
  if (process.env.WHISPER_CPP_MODEL && existsSync(process.env.WHISPER_CPP_MODEL)) {
    return process.env.WHISPER_CPP_MODEL;
  }

  return null;
}

/**
 * Compute the platform-specific Electron userData models/whisper directory.
 * This mirrors Electron's app.getPath("userData") logic so the Next.js server
 * can find models even when LOCAL_DATA_PATH isn't set (e.g., electron:dev).
 */
function getElectronUserDataModelsDir(): string | null {
  // If ELECTRON_USER_DATA_PATH is set, use it directly
  if (process.env.ELECTRON_USER_DATA_PATH) {
    return join(process.env.ELECTRON_USER_DATA_PATH, "models", "whisper");
  }

  // Compute platform-specific userData path (mirrors Electron's app.getPath("userData"))
  const appName = "seline";
  const appNameCandidates = [appName];
  if (process.env.NODE_ENV === "development") {
    appNameCandidates.unshift(`${appName}-dev`);
  }
  const os = platform();
  let userDataDir: string | null = null;

  for (const name of appNameCandidates) {
    if (os === "darwin") {
      userDataDir = join(homedir(), "Library", "Application Support", name);
    } else if (os === "win32") {
      userDataDir = join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), name);
    } else {
      // Linux: ~/.config/<appName>
      userDataDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), name);
    }

    if (userDataDir) {
      const modelsDir = join(userDataDir, "models", "whisper");
      if (existsSync(modelsDir)) return modelsDir;
    }
  }

  return null;
}

function getExtensionForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/opus": "opus",
    "audio/aac": "aac",
    "audio/flac": "flac",
  };
  return map[mimeType] || "ogg";
}

/**
 * Detect if a MIME type represents an audio file.
 */
export function isAudioMimeType(mimeType: string): boolean {
  return mimeType.startsWith("audio/") || mimeType === "application/ogg";
}
