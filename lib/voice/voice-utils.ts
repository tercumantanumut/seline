import { generateText } from "ai";
import { getLocalUser } from "@/lib/auth/local-auth";
import { db } from "@/lib/db/sqlite-client";
import { sessions } from "@/lib/db/sqlite-schema";
import { eq } from "drizzle-orm";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  getSessionProviderTemperature,
  resolveSessionUtilityModel,
} from "@/lib/ai/session-model-resolver";

export const VOICE_ACTIONS = ["fix-grammar", "professional", "summarize", "translate"] as const;

export type VoiceActionType = (typeof VOICE_ACTIONS)[number];

export interface VoiceHistoryEntry {
  id: string;
  userId: string;
  sessionId: string | null;
  provider: string;
  inputText: string;
  outputText: string;
  action: string;
  language: string | null;
  durationMs: number | null;
  createdAt: string;
  metadata: string;
}

export interface VoiceActionRequest {
  text: string;
  action: VoiceActionType;
  sessionId?: string;
  targetLanguage?: string;
}

interface PromptContext {
  preserveStyle: boolean;
  defaultLanguage: string;
  formalTone: "auto" | "business" | "casual";
  translationStyle: "natural" | "literal";
  summarizeLength: "short" | "medium" | "long";
}

interface SqlRunner {
  run: (...args: unknown[]) => void;
}

interface SqlRows<T> {
  all: (...args: unknown[]) => T[];
}

interface SqlClient {
  exec?: (sql: string) => void;
  prepare?: (sql: string) => SqlRunner & Partial<SqlRows<Record<string, unknown>>>;
}

interface SqlBackedDb {
  $client?: unknown;
}

function getSqlClient(): SqlClient | null {
  const candidate = (db as unknown as SqlBackedDb).$client;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as SqlClient;
}

function safeTrim(value: string, max = 20_000): string {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

function ensureVoiceTables(): void {
  const sqlite = getSqlClient();
  if (!sqlite?.exec) {
    throw new Error("SQLite client is unavailable");
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS voice_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      input_text TEXT NOT NULL,
      output_text TEXT NOT NULL,
      action TEXT NOT NULL,
      language TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_voice_history_user_created
      ON voice_history (user_id, created_at DESC)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_voice_history_session_created
      ON voice_history (session_id, created_at DESC)
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS voice_dictionary (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, word)
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_voice_dictionary_user_word
      ON voice_dictionary (user_id, word)
  `);
}

function asPromptContext(): PromptContext {
  const settings = loadSettings();
  return {
    preserveStyle: settings.voiceActionPreserveStyle ?? true,
    defaultLanguage: settings.voiceActionDefaultLanguage || "English",
    formalTone: settings.voiceActionFormalTone ?? "auto",
    translationStyle: settings.voiceActionTranslationStyle ?? "natural",
    summarizeLength: settings.voiceActionSummarizeLength ?? "medium",
  };
}

function summarizeInstruction(length: PromptContext["summarizeLength"]): string {
  if (length === "short") return "2-4 bullet points max.";
  if (length === "long") return "Comprehensive but concise. 8-12 bullet points max.";
  return "4-8 bullet points max.";
}

function buildActionPrompt(request: VoiceActionRequest, ctx: PromptContext): string {
  const content = safeTrim(request.text, 12_000);
  if (!content) {
    throw new Error("Text is required for voice action");
  }

  const baseRules = [
    "Return ONLY the transformed text.",
    "Do not add explanations, labels, or markdown wrappers.",
    ctx.preserveStyle
      ? "Preserve author voice and intent unless the action explicitly changes tone."
      : "Prioritize clarity over preserving original style.",
  ];

  const styleRule =
    ctx.formalTone === "business"
      ? "Tone preference: business professional."
      : ctx.formalTone === "casual"
        ? "Tone preference: natural casual."
        : "Tone preference: adapt to content.";

  switch (request.action) {
    case "fix-grammar":
      return [
        "You are a writing cleanup assistant.",
        ...baseRules,
        styleRule,
        "Fix grammar, punctuation, and readability while preserving meaning.",
        "Input:",
        content,
      ].join("\n");

    case "professional":
      return [
        "You are a rewriting assistant.",
        ...baseRules,
        "Rewrite this text in a polished professional tone suitable for work communication.",
        styleRule,
        "Input:",
        content,
      ].join("\n");

    case "summarize":
      return [
        "You are a summarization assistant.",
        ...baseRules,
        `Summarize the input as clear bullets. ${summarizeInstruction(ctx.summarizeLength)}`,
        "Keep key technical details and decisions.",
        "Input:",
        content,
      ].join("\n");

    case "translate": {
      const targetLanguage = safeTrim(request.targetLanguage || ctx.defaultLanguage, 80);
      return [
        "You are a translation assistant.",
        ...baseRules,
        `Translate to ${targetLanguage}.`,
        ctx.translationStyle === "literal"
          ? "Use literal translation where possible."
          : "Use natural, fluent translation while preserving meaning.",
        "Input:",
        content,
      ].join("\n");
    }

    default:
      throw new Error(`Unsupported voice action: ${request.action}`);
  }
}

function normalizeWord(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w]+|[^\w]+$/g, ""))
    .filter(Boolean);
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function findSubstitutions(originalWords: string[], editedWords: string[]): Array<[string, string]> {
  const m = originalWords.length;
  const n = editedWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (originalWords[i - 1].toLowerCase() === editedWords[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const aligned: Array<[string | null, string | null]> = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (
      i > 0
      && j > 0
      && originalWords[i - 1].toLowerCase() === editedWords[j - 1].toLowerCase()
    ) {
      aligned.unshift([originalWords[i - 1], editedWords[j - 1]]);
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      aligned.unshift([null, editedWords[j - 1]]);
      j -= 1;
    } else {
      aligned.unshift([originalWords[i - 1], null]);
      i -= 1;
    }
  }

  const substitutions: Array<[string, string]> = [];
  for (let index = 0; index < aligned.length - 1; index += 1) {
    const [origWord, editWord] = aligned[index];
    const [nextOrigWord, nextEditWord] = aligned[index + 1];
    if (origWord && !editWord && !nextOrigWord && nextEditWord) {
      substitutions.push([origWord, nextEditWord]);
    }
  }

  return substitutions;
}

export function extractDictionaryCorrections(
  originalText: string,
  editedText: string,
  existingDictionary: string[],
): string[] {
  if (!originalText || !editedText || originalText === editedText) {
    return [];
  }

  const originalWords = tokenize(originalText);
  const editedWords = tokenize(editedText);

  if (!originalWords.length || !editedWords.length) {
    return [];
  }

  const substitutions = findSubstitutions(originalWords, editedWords);
  if (substitutions.length > originalWords.length * 0.5) {
    return [];
  }

  const existing = new Set(existingDictionary.map((word) => word.toLowerCase()));
  const picked = new Set<string>();
  const results: string[] = [];

  for (const [sourceWord, correctedWord] of substitutions) {
    const normalized = correctedWord.toLowerCase();
    if (existing.has(normalized) || picked.has(normalized)) {
      continue;
    }
    if (sourceWord.toLowerCase() === normalized || correctedWord.length < 3) {
      continue;
    }

    const distance = editDistance(sourceWord.toLowerCase(), correctedWord.toLowerCase());
    const maxLength = Math.max(sourceWord.length, correctedWord.length);
    if (distance / maxLength > 0.65) {
      continue;
    }

    results.push(correctedWord);
    picked.add(normalized);
  }

  return results;
}

function getPreparedStatement(sql: string): SqlRunner & Partial<SqlRows<Record<string, unknown>>> {
  const sqlite = getSqlClient();
  if (!sqlite?.prepare) {
    throw new Error("SQLite prepare API is unavailable");
  }
  return sqlite.prepare(sql);
}

export async function runVoiceAction(request: VoiceActionRequest): Promise<{ text: string; provider: string }> {
  ensureVoiceTables();
  const prompt = buildActionPrompt(request, asPromptContext());

  let sessionMetadata: Record<string, unknown> | null = null;
  if (request.sessionId) {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, request.sessionId),
      columns: { metadata: true },
    });
    sessionMetadata = (session?.metadata as Record<string, unknown> | null) ?? null;
  }

  const startedAt = Date.now();
  const completion = await generateText({
    model: resolveSessionUtilityModel(sessionMetadata),
    temperature: getSessionProviderTemperature(sessionMetadata, 0.2),
    maxOutputTokens: 1200,
    prompt,
  });

  const output = safeTrim(completion.text, 20_000);
  if (!output) {
    throw new Error("Voice action returned empty output");
  }

  const user = await getLocalUser();
  const settings = loadSettings();
  if (settings.voiceHistoryEnabled !== false) {
    getPreparedStatement(
      `INSERT INTO voice_history (id, user_id, session_id, provider, input_text, output_text, action, language, duration_ms, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      user.id,
      request.sessionId ?? null,
      "utility-model",
      request.text,
      output,
      request.action,
      request.action === "translate" ? (request.targetLanguage || settings.voiceActionDefaultLanguage || "English") : null,
      Date.now() - startedAt,
      JSON.stringify({ preserveStyle: settings.voiceActionPreserveStyle ?? true }),
    );
  }

  return {
    text: output,
    provider: "utility-model",
  };
}

export async function getVoiceHistory(options?: { sessionId?: string; limit?: number }): Promise<VoiceHistoryEntry[]> {
  ensureVoiceTables();
  const user = await getLocalUser();
  const settings = loadSettings();
  const limit = Math.max(1, Math.min(options?.limit ?? settings.voiceHistoryLimit ?? 200, 500));

  const retentionDays = settings.voiceHistoryRetentionDays ?? 30;
  const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  getPreparedStatement("DELETE FROM voice_history WHERE user_id = ? AND created_at < ?").run(user.id, cutoffIso);

  const sql = options?.sessionId
    ? `SELECT * FROM voice_history WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM voice_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`;

  const rowsRaw = options?.sessionId
    ? getPreparedStatement(sql).all?.(user.id, options.sessionId, limit)
    : getPreparedStatement(sql).all?.(user.id, limit);

  const rows = (rowsRaw ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? row.userId ?? ""),
    sessionId: row.session_id != null ? String(row.session_id) : (row.sessionId != null ? String(row.sessionId) : null),
    provider: String(row.provider ?? ""),
    inputText: String(row.input_text ?? row.inputText ?? ""),
    outputText: String(row.output_text ?? row.outputText ?? ""),
    action: String(row.action ?? ""),
    language: row.language != null ? String(row.language) : null,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : (row.durationMs != null ? Number(row.durationMs) : null),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    metadata: typeof row.metadata === "string" ? row.metadata : JSON.stringify(row.metadata ?? {}),
  }));
}

export async function deleteVoiceHistoryEntry(entryId: string): Promise<void> {
  ensureVoiceTables();
  const user = await getLocalUser();
  getPreparedStatement("DELETE FROM voice_history WHERE id = ? AND user_id = ?").run(entryId, user.id);
}

export async function clearVoiceHistory(sessionId?: string): Promise<void> {
  ensureVoiceTables();
  const user = await getLocalUser();
  if (sessionId) {
    getPreparedStatement("DELETE FROM voice_history WHERE user_id = ? AND session_id = ?").run(user.id, sessionId);
    return;
  }
  getPreparedStatement("DELETE FROM voice_history WHERE user_id = ?").run(user.id);
}

export async function getCustomDictionary(): Promise<string[]> {
  ensureVoiceTables();
  const user = await getLocalUser();
  const rows = (getPreparedStatement(
    "SELECT word FROM voice_dictionary WHERE user_id = ? ORDER BY word COLLATE NOCASE ASC"
  ).all?.(user.id) ?? []) as Array<{ word: string }>;
  return rows.map((row) => row.word).filter(Boolean);
}

export async function addDictionaryWords(words: string[]): Promise<string[]> {
  ensureVoiceTables();
  const user = await getLocalUser();

  const normalizedWords = words
    .map((word) => normalizeWord(word))
    .filter((word) => word.length > 0)
    .slice(0, 500);

  const stmt = getPreparedStatement(
    `INSERT INTO voice_dictionary (id, user_id, word)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, word) DO NOTHING`
  );

  for (const word of normalizedWords) {
    stmt.run(crypto.randomUUID(), user.id, word);
  }

  return getCustomDictionary();
}

export async function removeDictionaryWord(word: string): Promise<string[]> {
  ensureVoiceTables();
  const user = await getLocalUser();
  const normalized = normalizeWord(word);
  getPreparedStatement("DELETE FROM voice_dictionary WHERE user_id = ? AND word = ?").run(user.id, normalized);
  return getCustomDictionary();
}

export async function autoLearnDictionaryFromEdit(originalText: string, editedText: string): Promise<string[]> {
  const settings = loadSettings();
  if (!settings.voiceAutoLearn) {
    return [];
  }

  const existing = await getCustomDictionary();
  const learned = extractDictionaryCorrections(originalText, editedText, existing);
  if (!learned.length) {
    return [];
  }

  return addDictionaryWords(learned);
}

export function buildWhisperPromptFromDictionary(words: string[]): string | undefined {
  if (!words.length) {
    return undefined;
  }

  const clipped = words
    .map((word) => normalizeWord(word))
    .filter(Boolean)
    .slice(0, 200);

  if (!clipped.length) {
    return undefined;
  }

  return `Custom dictionary: ${clipped.join(", ")}`;
}

export async function listVoiceHistoryByDay(limit = 200): Promise<Array<{ date: string; items: VoiceHistoryEntry[] }>> {
  const history = await getVoiceHistory({ limit });
  const grouped = new Map<string, VoiceHistoryEntry[]>();

  for (const item of history) {
    const date = item.createdAt.slice(0, 10);
    const bucket = grouped.get(date) ?? [];
    bucket.push(item);
    grouped.set(date, bucket);
  }

  return Array.from(grouped.entries())
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
