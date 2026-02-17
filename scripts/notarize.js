const path = require("node:path");
const { notarize } = require("@electron/notarize");

/**
 * Notarize the signed macOS app after electron-builder signs it.
 * Uses env vars to avoid committing secrets into the repository.
 */
exports.default = async function notarizeMacApp(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const appleIdPassword =
    process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_ID_PASSWORD;

  if (!appleId || !teamId || !appleIdPassword) {
    console.warn(
      "[notarize] Skipping notarization because required env vars are missing. " +
        "Set APPLE_ID, APPLE_TEAM_ID, and APPLE_APP_SPECIFIC_PASSWORD."
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[notarize] Submitting ${appPath} to Apple notary service...`);

  await notarize({
    tool: "notarytool",
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });

  console.log("[notarize] Notarization completed.");
};
