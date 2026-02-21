/**
 * Creates a DDGS instance from the vendored upstream package.
 * The dynamic import keeps startup behavior close to the previous implementation.
 */

interface DDGSClientOptions {
  proxy?: string;
  timeout?: number;
  verify?: boolean;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function parseBoolean(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

/**
 * Optional runtime overrides for DDG networking behavior.
 * - DDG_VERIFY_TLS=false: disable TLS verification (useful for restrictive Windows environments)
 * - DDG_TIMEOUT_MS=15000: adjust request timeout
 * - DDG_PROXY=http://host:port: route requests through proxy
 */
export function getDDGSClientOptionsFromEnv(): DDGSClientOptions {
  const options: DDGSClientOptions = {};

  const verify = parseBoolean(process.env.DDG_VERIFY_TLS);
  if (verify !== undefined) {
    options.verify = verify;
  }

  const timeoutRaw = process.env.DDG_TIMEOUT_MS?.trim();
  if (timeoutRaw) {
    const timeout = Number(timeoutRaw);
    if (Number.isFinite(timeout) && timeout > 0) {
      options.timeout = Math.floor(timeout);
    }
  }

  const proxy = process.env.DDG_PROXY?.trim();
  if (proxy) {
    options.proxy = proxy;
  }

  return options;
}

export async function createDDGS() {
  const { DDGS } = await import("@/vendors/duckduckgo-search/index.js");
  return new DDGS(getDDGSClientOptionsFromEnv());
}
