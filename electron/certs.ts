import * as fs from "fs";
import * as path from "path";
import selfsigned from "selfsigned";
import { debugLog, debugError } from "./debug-logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalCerts {
  cert: string;
  key: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CERT_DIR = "certs";
const CERT_FILE = "localhost.crt";
const KEY_FILE = "localhost.key";

/** macOS maximum validity for self-signed certificates. */
const VALIDITY_DAYS = 825;

/** Regenerate if the cert is older than this many days. */
const MAX_AGE_DAYS = 365;

const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the cached cert file exists and was created less than
 * MAX_AGE_DAYS ago.
 */
function isCertFresh(certPath: string): boolean {
  try {
    const stat = fs.statSync(certPath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < MAX_AGE_MS;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure self-signed localhost certs exist. Generates them if missing or expired.
 * Certs are cached in {userDataPath}/certs/.
 */
export async function ensureLocalCerts(userDataPath: string): Promise<LocalCerts> {
  const certsDir = path.join(userDataPath, CERT_DIR);
  const certPath = path.join(certsDir, CERT_FILE);
  const keyPath = path.join(certsDir, KEY_FILE);

  // -----------------------------------------------------------------------
  // Return cached certs if they exist and are still fresh
  // -----------------------------------------------------------------------
  if (isCertFresh(certPath) && fs.existsSync(keyPath)) {
    debugLog("[Certs] Using cached self-signed certs from", certsDir);
    return {
      cert: fs.readFileSync(certPath, "utf-8"),
      key: fs.readFileSync(keyPath, "utf-8"),
    };
  }

  // -----------------------------------------------------------------------
  // Generate new certs
  // -----------------------------------------------------------------------
  debugLog("[Certs] Generating new self-signed certificate for localhost...");

  try {
    const notBefore = new Date();
    const notAfter = new Date(notBefore);
    notAfter.setDate(notAfter.getDate() + VALIDITY_DAYS);

    const pems = await selfsigned.generate(
      [{ name: "commonName", value: "localhost" }],
      {
        keySize: 2048,
        algorithm: "sha256",
        notBeforeDate: notBefore,
        notAfterDate: notAfter,
        extensions: [
          { name: "basicConstraints", cA: false, critical: true },
          {
            name: "keyUsage",
            digitalSignature: true,
            keyEncipherment: true,
            critical: true,
          },
          { name: "extKeyUsage", serverAuth: true },
          {
            name: "subjectAltName",
            altNames: [
              { type: 2, value: "localhost" },
              { type: 7, ip: "127.0.0.1" },
            ],
          },
        ],
      },
    );

    fs.mkdirSync(certsDir, { recursive: true });
    fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });
    fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
    debugLog("[Certs] Certs written to", certsDir);

    return { cert: pems.cert, key: pems.private };
  } catch (err) {
    debugError("[Certs] Failed to generate self-signed certs:", err);
    throw err;
  }
}
