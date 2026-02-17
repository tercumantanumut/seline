export const RETRY_SCHEDULE_MS = [10_000, 30_000, 60_000, 120_000, 180_000] as const;
export const RETRY_MAX_DELAY_MS = 300_000;

const RECOVERABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const CONFLICT_STATUS_CODE = 409;

const TRANSIENT_PAYLOAD_PATTERNS = [
  /resource exhausted/i,
  /quota/i,
  /rate\s*limit/i,
  /too many requests/i,
  /temporar(?:y|ily) unavailable/i,
  /temporar(?:y|ily) overloaded/i,
  /upstream.*(closed|reset|interrupted)/i,
  /stream.*(closed|interrupted|terminated)/i,
  /incomplete chunk/i,
  /controller was closed/i,
  /connection (reset|terminated|dropped)/i,
  /timeout/i,
  /deadline exceeded/i,
  /service unavailable/i,
  /bad gateway/i,
  /gateway timeout/i,
  /econnreset/i,
  /etimedout/i,
  /eai_again/i,
];

const TERMINAL_PAYLOAD_PATTERNS = [
  /invalid api key/i,
  /authentication required/i,
  /unauthorized/i,
  /forbidden/i,
  /insufficient permissions?/i,
  /unsupported/i,
  /invalid request/i,
  /malformed/i,
  /context length/i,
  /maximum context/i,
];

const USER_ABORT_PATTERNS = [
  /user.?cancel/i,
  /cancelled by user/i,
  /aborted by user/i,
  /request aborted by caller/i,
];

const UPSTREAM_ABORT_PATTERNS = [
  /aborterror/i,
  /stream.*aborted/i,
  /upstream.*aborted/i,
  /connection closed/i,
  /socket hang up/i,
];

export type RecoveryReason =
  | "recoverable_status"
  | "conflict"
  | "recoverable_payload"
  | "recoverable_abort"
  | "user_abort"
  | "terminal_status"
  | "terminal_payload"
  | "unknown";

export interface NormalizedStreamError {
  message: string;
  statusCode?: number;
  code?: string;
  provider?: string;
  retryAfterMs?: number;
  isAbort: boolean;
  isUserAbort: boolean;
  raw: unknown;
}

export interface RecoveryClassification {
  recoverable: boolean;
  reason: RecoveryReason;
  normalized: NormalizedStreamError;
}

function parseStatusCode(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === "string") {
    const parsed = Number.parseInt(input, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseRetryAfterMs(headers?: Headers): number | undefined {
  if (!headers) return undefined;
  const raw = headers.get("retry-after");
  if (!raw) return undefined;

  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(raw);
  if (Number.isFinite(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return undefined;
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeStreamError(input: unknown): NormalizedStreamError {
  if (input instanceof Response) {
    const msg = `${input.status} ${input.statusText}`.trim();
    return {
      message: msg,
      statusCode: input.status,
      retryAfterMs: parseRetryAfterMs(input.headers),
      isAbort: false,
      isUserAbort: false,
      raw: input,
    };
  }

  const objectLike = typeof input === "object" && input !== null
    ? input as Record<string, unknown>
    : undefined;

  const nestedError = objectLike?.error;
  const nestedErrorObj = typeof nestedError === "object" && nestedError !== null
    ? nestedError as Record<string, unknown>
    : undefined;

  const message = [
    objectLike?.message,
    objectLike?.error,
    nestedErrorObj?.message,
    nestedErrorObj?.error,
    input instanceof Error ? input.message : undefined,
  ].find((v) => typeof v === "string") as string | undefined;

  const statusCode =
    parseStatusCode(objectLike?.statusCode) ??
    parseStatusCode(objectLike?.status) ??
    parseStatusCode(nestedErrorObj?.statusCode) ??
    parseStatusCode(nestedErrorObj?.status);

  const code = [
    objectLike?.code,
    nestedErrorObj?.code,
    input instanceof Error ? input.name : undefined,
  ].find((v) => typeof v === "string") as string | undefined;

  const provider = typeof objectLike?.provider === "string"
    ? objectLike.provider
    : undefined;

  const messageText = message ?? safeStringify(input);
  const lower = messageText.toLowerCase();
  const isAbort = UPSTREAM_ABORT_PATTERNS.some((pattern) => pattern.test(lower));
  const isUserAbort = USER_ABORT_PATTERNS.some((pattern) => pattern.test(lower));

  return {
    message: messageText,
    statusCode,
    code,
    provider,
    retryAfterMs: undefined,
    isAbort,
    isUserAbort,
    raw: input,
  };
}

export function classifyRecoverability(input: unknown): RecoveryClassification {
  const normalized = normalizeStreamError(input);
  const haystack = `${normalized.code ?? ""} ${normalized.message}`.toLowerCase();

  if (normalized.isUserAbort) {
    return { recoverable: false, reason: "user_abort", normalized };
  }

  if (normalized.statusCode === CONFLICT_STATUS_CODE) {
    // 409 can be transient in some provider gateways, but default to non-recoverable.
    return { recoverable: false, reason: "conflict", normalized };
  }

  if (typeof normalized.statusCode === "number") {
    if (RECOVERABLE_STATUS_CODES.has(normalized.statusCode)) {
      return { recoverable: true, reason: "recoverable_status", normalized };
    }

    if (normalized.statusCode >= 400 && normalized.statusCode < 500) {
      return { recoverable: false, reason: "terminal_status", normalized };
    }
  }

  if (TERMINAL_PAYLOAD_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return { recoverable: false, reason: "terminal_payload", normalized };
  }

  if (TRANSIENT_PAYLOAD_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return { recoverable: true, reason: "recoverable_payload", normalized };
  }

  if (normalized.isAbort) {
    return { recoverable: true, reason: "recoverable_abort", normalized };
  }

  return { recoverable: false, reason: "unknown", normalized };
}

export function getBackoffDelayMs(attempt: number, jitterRatio = 0.2): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  const base = RETRY_SCHEDULE_MS[Math.min(safeAttempt, RETRY_SCHEDULE_MS.length - 1)];
  const jitter = base * jitterRatio * (Math.random() * 2 - 1);
  return Math.min(Math.max(0, Math.round(base + jitter)), RETRY_MAX_DELAY_MS);
}

export function shouldRetry(args: {
  classification: RecoveryClassification;
  attempt: number;
  maxAttempts: number;
  aborted?: boolean;
}): boolean {
  const { classification, attempt, maxAttempts, aborted = false } = args;
  if (aborted) return false;
  if (!classification.recoverable) return false;
  return attempt < maxAttempts;
}

export async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return;
  }

  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
