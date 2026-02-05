/**
 * Environment detection utilities
 *
 * Helps distinguish between different runtime environments:
 * - Development (Next.js dev server)
 * - Electron production (local desktop app)
 * - Server production (deployed web server - hypothetical future use)
 */

/**
 * Check if running in an Electron production build
 *
 * Electron production builds have specific markers:
 * - SELINE_PRODUCTION_BUILD=1
 * - process.resourcesPath exists (Electron-specific)
 * - ELECTRON_RESOURCES_PATH is set
 */
export function isElectronProduction(): boolean {
  return (
    (process.env.SELINE_PRODUCTION_BUILD === "1" ||
      !!(process as any).resourcesPath ||
      !!process.env.ELECTRON_RESOURCES_PATH) &&
    process.env.ELECTRON_IS_DEV !== "1" &&
    process.env.NODE_ENV !== "development"
  );
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Check if running in a local environment (dev or Electron production)
 *
 * In local environments, auth can be relaxed for admin endpoints
 * since the user is running the app on their own machine.
 */
export function isLocalEnvironment(): boolean {
  return isDevelopment() || isElectronProduction();
}

/**
 * Get the correct base URL for internal API calls
 *
 * Port mapping:
 * - Development: port 3000 (Next.js dev server)
 * - Electron Production: port 3456 (standalone server)
 */
export function getApiBaseUrl(): string {
  return isElectronProduction()
    ? "http://localhost:3456"
    : "http://localhost:3000";
}
