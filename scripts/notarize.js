const path = require("path");

/**
 * Electron Builder `afterSign` hook for macOS notarization.
 *
 * Environment options:
 * 1) App-specific password flow:
 *    - APPLE_ID
 *    - APPLE_APP_SPECIFIC_PASSWORD
 *    - APPLE_TEAM_ID
 *
 * 2) App Store Connect API key flow:
 *    - APPLE_API_KEY
 *    - APPLE_API_KEY_ID
 *    - APPLE_API_ISSUER
 */
exports.default = async function notarizeIfConfigured(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  let notarize;
  try {
    ({ notarize } = require("@electron/notarize"));
  } catch (error) {
    console.warn("[notarize] @electron/notarize is unavailable, skipping.");
    if (error) {
      console.warn(`[notarize] ${String(error)}`);
    }
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  const apiKey = process.env.APPLE_API_KEY;
  const apiKeyId = process.env.APPLE_API_KEY_ID;
  const apiIssuer = process.env.APPLE_API_ISSUER;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  const appBundleId = process.env.APPLE_BUNDLE_ID || context.packager.appInfo.id;

  const canUseApiKey = Boolean(apiKey && apiKeyId && apiIssuer);
  const canUseAppleId = Boolean(appleId && appleIdPassword && teamId);

  if (!canUseApiKey && !canUseAppleId) {
    console.warn(
      "[notarize] Missing Apple notarization credentials. " +
        "Set APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID " +
        "or APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER. Skipping."
    );
    return;
  }

  const options = canUseApiKey
    ? {
        appBundleId,
        appPath,
        tool: "notarytool",
        appleApiKey: apiKey,
        appleApiKeyId: apiKeyId,
        appleApiIssuer: apiIssuer,
      }
    : {
        appBundleId,
        appPath,
        tool: "notarytool",
        appleId,
        appleIdPassword,
        teamId,
      };

  console.log(`[notarize] Submitting ${appPath} for notarization...`);
  await notarize(options);
  console.log("[notarize] Notarization completed.");
};
