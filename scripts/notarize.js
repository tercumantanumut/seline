const fs = require("node:fs");
const path = require("node:path");
const { notarize } = require("@electron/notarize");

function loadNotarizeEnv(projectDir) {
  let dotenv;
  try {
    dotenv = require("dotenv");
  } catch {
    return;
  }

  const candidates = [
    path.join(projectDir, ".env.local"),
    path.join(projectDir, ".env"),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({ path: filePath, override: false });
  }
}

function isTruthyEnv(value) {
  return value === "1" || value === "true" || value === "yes";
}

function getNotarizeAuthOptions() {
  const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;
  const keychain = process.env.APPLE_KEYCHAIN;

  if (keychainProfile) {
    return {
      strategy: "keychain-profile",
      options: {
        keychainProfile,
        ...(keychain ? { keychain } : {}),
      },
    };
  }

  const appleApiKey = process.env.APPLE_API_KEY;
  const appleApiKeyId = process.env.APPLE_API_KEY_ID;
  const appleApiIssuer = process.env.APPLE_API_ISSUER;

  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
      throw new Error(
        "Incomplete App Store Connect API credentials. Set APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER."
      );
    }

    return {
      strategy: "api-key",
      options: {
        appleApiKey,
        appleApiKeyId,
        appleApiIssuer,
      },
    };
  }

  const appleId = process.env.APPLE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const appleIdPassword =
    process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_ID_PASSWORD;

  if (appleId || teamId || appleIdPassword) {
    if (!appleId || !teamId || !appleIdPassword) {
      throw new Error(
        "Incomplete Apple ID credentials. Set APPLE_ID, APPLE_TEAM_ID, and APPLE_APP_SPECIFIC_PASSWORD."
      );
    }

    return {
      strategy: "apple-id",
      options: {
        appleId,
        teamId,
        appleIdPassword,
      },
    };
  }

  return null;
}

/**
 * Notarize the signed macOS app after electron-builder signs it.
 * Credentials are loaded from environment variables.
 */
exports.default = async function notarizeMacApp(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const projectDir = context.packager?.projectDir || process.cwd();
  loadNotarizeEnv(projectDir);

  if (isTruthyEnv(process.env.APPLE_NOTARIZE_SKIP)) {
    console.warn("[notarize] Skipping notarization because APPLE_NOTARIZE_SKIP is enabled.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    throw new Error(`[notarize] Cannot find app bundle at ${appPath}`);
  }

  const auth = getNotarizeAuthOptions();
  if (!auth) {
    throw new Error(
      "[notarize] Missing notarization credentials. Configure APPLE_KEYCHAIN_PROFILE, " +
        "or APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER, " +
        "or APPLE_ID/APPLE_TEAM_ID/APPLE_APP_SPECIFIC_PASSWORD."
    );
  }

  console.log(`[notarize] Using ${auth.strategy} authentication.`);
  console.log(`[notarize] Submitting ${appPath} to Apple notary service...`);

  await notarize({
    tool: "notarytool",
    appPath,
    ...auth.options,
  });

  console.log("[notarize] Notarization completed.");
};
