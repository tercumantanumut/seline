import os from "os";
import path from "path";

const DEFAULT_DATA_DIR = ".seline";
const DEFAULT_LOCAL_DATA_DIR = "local-data";

export function getLocalDataRoot(): string {
  const envPath = process.env.LOCAL_DATA_PATH;
  if (envPath && envPath.trim().length > 0) {
    return envPath;
  }

  const homeDir = os.homedir();
  if (homeDir && homeDir.trim().length > 0) {
    return path.join(homeDir, DEFAULT_DATA_DIR, DEFAULT_LOCAL_DATA_DIR);
  }

  // Last-resort fallback for environments without a homedir.
  return path.join(process.cwd(), ".local-data");
}

export function getLocalDataPath(...segments: string[]): string {
  return path.join(getLocalDataRoot(), ...segments);
}
