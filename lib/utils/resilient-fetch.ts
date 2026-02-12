/**
 * Resilient Fetch Wrapper
 *
 * Adds timeout, retry with exponential backoff, and AbortController
 * integration to standard fetch. Designed for client-side UI fetches
 * that should never hang indefinitely on slow/unreliable connections.
 */

export interface ResilientFetchOptions extends Omit<RequestInit, "signal"> {
  /** Timeout in ms. Default: 10000 (10s). Use 30000 for uploads. */
  timeout?: number;
  /** Number of retries on failure. Default: 2. Set 0 to disable. */
  retries?: number;
  /** Initial backoff in ms (doubles each retry). Default: 1000. */
  backoffMs?: number;
  /** External AbortSignal (e.g., from useEffect cleanup). */
  signal?: AbortSignal;
  /** Called before each retry attempt. */
  onRetry?: (attempt: number, error: Error) => void;
}

export interface ResilientFetchResult<T> {
  data: T | null;
  error: string | null;
  timedOut: boolean;
  status?: number;
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF = 1_000;

/**
 * Fetch with automatic timeout and retry.
 *
 * - Never throws — returns { data, error, timedOut } tuple
 * - Auto-aborts after timeout
 * - Retries with exponential backoff on network errors and 5xx responses
 * - Respects external AbortSignal for cleanup
 */
export async function resilientFetch<T = unknown>(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<ResilientFetchResult<T>> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF,
    signal: externalSignal,
    onRetry,
    ...fetchOptions
  } = options;

  let lastError: string | null = null;
  let timedOut = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Abort controller: combines timeout + external signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Forward external abort to our controller
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);

      // Don't retry client errors (4xx) — they won't succeed on retry
      if (response.ok) {
        const data = (await response.json()) as T;
        return { data, error: null, timedOut: false, status: response.status };
      }

      // Retry on server errors (5xx)
      if (response.status >= 500 && attempt < retries) {
        lastError = `HTTP ${response.status}`;
        onRetry?.(attempt + 1, new Error(lastError));
        await sleep(backoffMs * Math.pow(2, attempt));
        continue;
      }

      // Non-retryable error
      return {
        data: null,
        error: `HTTP ${response.status}`,
        timedOut: false,
        status: response.status,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);

      // External abort — don't retry, caller intentionally cancelled
      if (externalSignal?.aborted) {
        return { data: null, error: "Aborted", timedOut: false };
      }

      // Timeout
      if (controller.signal.aborted) {
        timedOut = true;
        lastError = "Request timed out";
      } else {
        timedOut = false;
        lastError = err instanceof Error ? err.message : "Network error";
      }

      if (attempt < retries) {
        onRetry?.(attempt + 1, new Error(lastError));
        await sleep(backoffMs * Math.pow(2, attempt));
        continue;
      }
    }
  }

  return { data: null, error: lastError, timedOut };
}

/**
 * Convenience: resilient JSON POST
 */
export async function resilientPost<T = unknown>(
  url: string,
  body: unknown,
  options: ResilientFetchOptions = {}
): Promise<ResilientFetchResult<T>> {
  const { headers: extraHeaders, ...rest } = options;
  return resilientFetch<T>(url, {
    ...rest,
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders as Record<string, string> },
    body: JSON.stringify(body),
  });
}

/**
 * Convenience: resilient DELETE
 */
export async function resilientDelete<T = unknown>(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<ResilientFetchResult<T>> {
  return resilientFetch<T>(url, { method: "DELETE", ...options });
}

/**
 * Convenience: resilient PUT
 */
export async function resilientPut<T = unknown>(
  url: string,
  body: unknown,
  options: ResilientFetchOptions = {}
): Promise<ResilientFetchResult<T>> {
  const { headers: extraHeaders, ...rest } = options;
  return resilientFetch<T>(url, {
    ...rest,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...extraHeaders as Record<string, string> },
    body: JSON.stringify(body),
  });
}

/**
 * Convenience: resilient PATCH
 */
export async function resilientPatch<T = unknown>(
  url: string,
  body: unknown,
  options: ResilientFetchOptions = {}
): Promise<ResilientFetchResult<T>> {
  const { headers: extraHeaders, ...rest } = options;
  return resilientFetch<T>(url, {
    ...rest,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...extraHeaders as Record<string, string> },
    body: JSON.stringify(body),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
