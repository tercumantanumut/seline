import { relative } from "path";

const RAW_DEFAULT_IGNORE_PATTERNS = [
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
  ".DS_Store",
  "Thumbs.db",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "*.tsbuildinfo",
  "*.log",
  "*.lock",
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.local-data/**",
  "**/dist-electron/**",
  "**/comfyui_backend/**",
  "**/.vscode/**",
  "**/.idea/**",
  "**/tmp/**",
  "**/temp/**",
];

export const DEFAULT_IGNORE_PATTERNS = Array.from(new Set(RAW_DEFAULT_IGNORE_PATTERNS));

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
