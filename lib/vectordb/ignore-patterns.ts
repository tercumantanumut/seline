import { relative } from "path";

const DEFAULT_IGNORED_DIRECTORY_NAMES = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".local-data",
  "dist-electron",
  "comfyui_backend",
  ".vscode",
  ".idea",
  "tmp",
  "temp",
  ".venv",
  "venv",
  "env",
  ".env",
  "__pycache__",
  "site-packages",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
];

const DEFAULT_IGNORED_FILE_NAMES = [
  ".DS_Store",
  "Thumbs.db",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

const DEFAULT_IGNORED_FILE_GLOBS = [
  "*.tsbuildinfo",
  "*.log",
  "*.lock",
  "*.pyc",
  "*.pyo",
];

const RAW_DEFAULT_IGNORE_PATTERNS = [
  ...DEFAULT_IGNORED_DIRECTORY_NAMES,
  ...DEFAULT_IGNORED_FILE_NAMES,
  ...DEFAULT_IGNORED_FILE_GLOBS,
  ...DEFAULT_IGNORED_DIRECTORY_NAMES.map((name) => `**/${name}/**`),
];

export const DEFAULT_IGNORE_PATTERNS = Array.from(new Set(RAW_DEFAULT_IGNORE_PATTERNS));
export const DEFAULT_BINARY_ASSET_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "cur",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "otf",
  "pdf",
  "png",
  "psd",
  "svg",
  "tif",
  "tiff",
  "ttf",
  "wav",
  "webm",
  "webp",
  "woff",
  "woff2",
]);
const DEFAULT_IGNORED_DIRECTORY_NAME_SET = new Set(DEFAULT_IGNORED_DIRECTORY_NAMES);
const DEFAULT_IGNORED_FILE_NAME_SET = new Set(DEFAULT_IGNORED_FILE_NAMES);

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function normalizePattern(pattern: string): string {
  let p = pattern.trim();
  if (!p) return "";
  if (p.startsWith("./")) p = p.slice(2);
  if (p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  let p = pattern;
  if (p.startsWith("/")) p = p.slice(1);
  if (!p.startsWith("**/") && !p.startsWith("/")) {
    p = `**/${p}`;
  }

  let out = "";
  for (let i = 0; i < p.length; i += 1) {
    const char = p[i];
    if (char === "*") {
      if (p[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else {
      out += escapeRegex(char);
    }
  }

  return new RegExp(`^${out}$`);
}

function segmentMatcher(pattern: string): (path: string) => boolean {
  const escaped = escapeRegex(pattern);
  const regex = new RegExp(`(^|/)${escaped}(/|$)`);
  return (path) => regex.test(path);
}

function subpathMatcher(pattern: string): (path: string) => boolean {
  const normalized = normalizePath(pattern);
  const escaped = escapeRegex(normalized);
  const regex = new RegExp(`(^|/)${escaped}(/|$)`);
  return (path) => regex.test(path);
}

export function createIgnoreMatcher(patterns: string[], basePath?: string) {
  const matchers = patterns
    .map((raw) => normalizePattern(raw))
    .filter(Boolean)
    .map((pattern) => {
      const hasGlob = /[*?]/.test(pattern);
      const hasSlash = pattern.includes("/");

      if (!hasGlob && !hasSlash) {
        const matchSegment = segmentMatcher(pattern);
        return (path: string, rel: string) => matchSegment(path) || matchSegment(rel);
      }

      if (!hasGlob && hasSlash) {
        const matchSubpath = subpathMatcher(pattern);
        return (path: string, rel: string) => matchSubpath(path) || matchSubpath(rel);
      }

      const regex = globToRegex(pattern);
      return (path: string, rel: string) => regex.test(path) || regex.test(rel);
    });

  return (filePath: string): boolean => {
    const normalized = normalizePath(filePath);
    const rel = basePath
      ? normalizePath(relative(basePath, filePath))
      : normalized;

    return matchers.some((matcher) => matcher(normalized, rel));
  };
}

function hasIgnoredDirectorySegment(path: string): boolean {
  const normalized = normalizePath(path);
  const segments = normalized.split("/").filter(Boolean);
  return segments.some((segment, index) => {
    if (!DEFAULT_IGNORED_DIRECTORY_NAME_SET.has(segment)) {
      return false;
    }

    // ".env" is commonly a file; only auto-ignore it when it appears as a directory segment.
    if (segment === ".env") {
      return index < segments.length - 1;
    }

    return true;
  });
}

function hasIgnoredFileName(path: string): boolean {
  const normalized = normalizePath(path);
  const fileName = normalized.split("/").pop() ?? normalized;
  return DEFAULT_IGNORED_FILE_NAME_SET.has(fileName);
}

function isBinaryAssetPath(path: string, includeExtensions: string[]): boolean {
  const normalized = normalizePath(path);
  const fileName = normalized.split("/").pop() ?? normalized;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) return false;

  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  if (!DEFAULT_BINARY_ASSET_EXTENSIONS.has(extension)) {
    return false;
  }

  return !includeExtensions.includes(extension);
}

/**
 * Creates a highly optimized aggressive ignore function for file watchers.
 * This function is designed to prevent Chokidar/fsevents from even scanning
 * massive directories like node_modules, which is critical for avoiding
 * EMFILE errors and high CPU usage.
 */
export function createAggressiveIgnore(
  patterns: string[],
  basePath?: string,
  includeExtensions: string[] = []
) {
  const shouldIgnore = createIgnoreMatcher(patterns, basePath);
  const normalizedIncludeExtensions = includeExtensions.map((ext) =>
    ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase()
  );

  return (path: string) => {
    if (hasIgnoredDirectorySegment(path)) {
      return true;
    }

    if (hasIgnoredFileName(path)) {
      return true;
    }

    if (isBinaryAssetPath(path, normalizedIncludeExtensions)) {
      return true;
    }

    return shouldIgnore(path);
  };
}
