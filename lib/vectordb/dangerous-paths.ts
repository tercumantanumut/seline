import { resolve, sep } from "path";

/**
 * Directories that must never be synced or watched.
 * These are filesystem roots, OS internals, or directories so broad
 * they will exhaust file descriptors and flood the watcher with
 * permission errors.
 */
const BLOCKED_UNIX: string[] = [
  "/",
  "/System",
  "/Library",
  "/Applications",
  "/Users",
  "/var",
  "/etc",
  "/private",
  "/usr",
  "/opt",
  "/sbin",
  "/bin",
  "/tmp",
  "/Volumes",
  "/cores",
  "/dev",
  "/proc",
  "/run",
  "/snap",
  "/boot",
  "/root",
  "/srv",
  "/lib",
  "/lib64",
];

/**
 * Check whether `folderPath` is a dangerous path that should never be
 * synced or watched.  Returns a user-facing error string when blocked,
 * or `null` when the path is safe.
 */
export function isDangerousPath(folderPath: string): string | null {
  const resolved = resolve(folderPath);

  // --- Windows drive roots (e.g. "C:\", "D:\") ---
  if (/^[A-Za-z]:[/\\]?$/.test(resolved)) {
    return `Cannot sync a drive root (${resolved}). Please choose a specific folder inside it.`;
  }

  // --- Windows well-known system directories ---
  const resolvedLower = resolved.toLowerCase().replace(/\\/g, "/");
  const windowsBlocked = [
    "c:/windows",
    "c:/program files",
    "c:/program files (x86)",
    "c:/users",
    "c:/programdata",
    "c:/system volume information",
  ];
  for (const blocked of windowsBlocked) {
    if (resolvedLower === blocked || resolvedLower === blocked + "/") {
      return `Cannot sync "${resolved}" — this is a protected system directory.`;
    }
  }

  // --- Unix / macOS blocked paths ---
  const normalizedUnix = resolved.replace(/\/+$/, "") || "/"; // keep bare "/" intact
  for (const blocked of BLOCKED_UNIX) {
    if (normalizedUnix === blocked) {
      return blocked === "/"
        ? 'Cannot sync the filesystem root ("/"). Please choose a specific project folder.'
        : `Cannot sync "${blocked}" — this is a system directory.`;
    }
  }

  // --- Depth guard: require at least 2 path segments after the root ---
  // e.g. "/a" has 1 segment (blocked), "/a/b" has 2 segments (allowed)
  const segments = resolved.split(sep).filter(Boolean);
  if (segments.length < 2) {
    return "Path is too shallow to sync safely. Please choose a folder at least two levels deep (e.g. /Users/you/myproject).";
  }

  return null;
}
