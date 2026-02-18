import crypto from "crypto";

const INTERNAL_API_SECRET_ENV = "INTERNAL_API_SECRET";

function canGenerateFallbackSecret(): boolean {
  // Desktop and dev runtimes are single-process/local contexts where a
  // process-local secret is sufficient and prevents startup hard-failures.
  if (process.env.SELINE_PRODUCTION_BUILD === "1") return true;
  if (process.env.ELECTRON_IS_DEV === "1") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

function readInternalApiSecret(): string {
  const value = process.env[INTERNAL_API_SECRET_ENV]?.trim();
  if (value) {
    return value;
  }

  if (canGenerateFallbackSecret()) {
    const generated = `local-internal-${crypto.randomBytes(24).toString("hex")}`;
    process.env[INTERNAL_API_SECRET_ENV] = generated;
    console.warn(
      `[InternalAuth] ${INTERNAL_API_SECRET_ENV} was not set; generated a process-local fallback secret.`,
    );
    return generated;
  }

  throw new Error(
    `${INTERNAL_API_SECRET_ENV} is required. Configure it before starting the app.`,
  );
}

export const INTERNAL_API_SECRET = readInternalApiSecret();
