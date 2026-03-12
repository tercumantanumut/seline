import JSZip from "jszip";
import matter from "gray-matter";
import path from "path";
import mime from "mime-types";

export interface ParsedSkillPackage {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
  metadata?: Record<string, unknown>;
  promptTemplate: string; // The markdown body from SKILL.md
  scripts: ParsedFile[];
  references: ParsedFile[];
  assets: ParsedFile[];
  files: ParsedFile[]; // All files except SKILL.md
}

export interface ParsedFile {
  relativePath: string;
  content: Buffer;
  mimeType: string;
  size: number;
  isExecutable: boolean;
}

const EXECUTABLE_EXTENSIONS = [".py", ".js", ".sh", ".bash", ".zsh", ".ts"];
const SCRIPT_DIRS = ["scripts", "script"];
const REFERENCE_DIRS = ["references", "reference", "docs"];
const ASSET_DIRS = ["assets", "asset", "resources"];
const BLOCKED_EXTENSIONS = [".exe", ".dll", ".so", ".dylib", ".app", ".bat", ".cmd"];

interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseLenientFrontmatter(source: string): ParsedFrontmatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, content: source };
  }

  const frontmatterBlock = match[1];
  const body = source.slice(match[0].length);
  const data: Record<string, unknown> = {};
  const lines = frontmatterBlock.split(/\r?\n/);
  let currentArrayKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (!trimmed) {
      currentArrayKey = null;
      continue;
    }

    const arrayMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (arrayMatch && currentArrayKey) {
      const existing = Array.isArray(data[currentArrayKey]) ? [...(data[currentArrayKey] as string[])] : [];
      existing.push(stripWrappingQuotes(arrayMatch[1].trim()));
      data[currentArrayKey] = existing;
      continue;
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      currentArrayKey = null;
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      currentArrayKey = null;
      continue;
    }

    if (!rawValue) {
      currentArrayKey = key;
      data[key] = [];
      continue;
    }

    currentArrayKey = null;
    data[key] = stripWrappingQuotes(rawValue);
  }

  return {
    data,
    content: body,
  };
}

function parseMarkdownFrontmatter(source: string): ParsedFrontmatter {
  try {
    const parsed = matter(source);
    return {
      data: (parsed.data || {}) as Record<string, unknown>,
      content: parsed.content,
    };
  } catch {
    return parseLenientFrontmatter(source);
  }
}

function parseSkillMarkdown(source: string): Omit<ParsedSkillPackage, "scripts" | "references" | "assets" | "files"> {
  const parsed = parseMarkdownFrontmatter(source);
  const frontmatter = parsed.data;
  const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";

  if (!name) {
    throw new Error("SKILL.md must include 'name' in frontmatter");
  }

  if (!description) {
    throw new Error("SKILL.md must include 'description' in frontmatter");
  }

  return {
    name,
    description,
    license: typeof frontmatter.license === "string" ? frontmatter.license : undefined,
    compatibility: typeof frontmatter.compatibility === "string" ? frontmatter.compatibility : undefined,
    allowedTools: Array.isArray(frontmatter["allowed-tools"])
      ? frontmatter["allowed-tools"].map((tool) => String(tool).trim()).filter(Boolean)
      : undefined,
    metadata:
      frontmatter.metadata && typeof frontmatter.metadata === "object" && !Array.isArray(frontmatter.metadata)
        ? (frontmatter.metadata as Record<string, unknown>)
        : undefined,
    promptTemplate: parsed.content.trim(),
  };
}

export async function parseSkillPackage(zipBuffer: Buffer): Promise<ParsedSkillPackage> {
  const zip = await JSZip.loadAsync(zipBuffer);

  // Find SKILL.md
  const skillMdEntry = Object.values(zip.files).find(
    (file) => !file.dir && (file.name === "SKILL.md" || file.name.endsWith("/SKILL.md"))
  );

  if (!skillMdEntry) {
    throw new Error("No SKILL.md found in package. This is required for Agent Skills format.");
  }

  // Parse SKILL.md
  const skillMdContent = await skillMdEntry.async("string");
  const parsedMarkdown = parseSkillMarkdown(skillMdContent);

  // Determine the skill root directory
  const skillRoot = skillMdEntry.name === "SKILL.md"
    ? ""
    : skillMdEntry.name.slice(0, skillMdEntry.name.lastIndexOf("/"));

  // Extract all other files
  const files: ParsedFile[] = [];
  const scripts: ParsedFile[] = [];
  const references: ParsedFile[] = [];
  const assets: ParsedFile[] = [];

  for (const [filePath, entry] of Object.entries(zip.files)) {
    if (entry.dir || filePath === skillMdEntry.name) continue;

    // Skip files outside the skill root
    if (skillRoot && !filePath.startsWith(`${skillRoot}/`)) continue;

    const relativePath = skillRoot
      ? filePath.slice(skillRoot.length + 1)
      : filePath;

    const ext = path.extname(relativePath).toLowerCase();

    // Block dangerous file types
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw new Error(`Blocked file type: ${ext}. Only script files (.py, .js, .sh) are allowed.`);
    }

    const content = await entry.async("nodebuffer");

    // Check individual file size (10MB max per file)
    if (content.length > 10 * 1024 * 1024) {
      throw new Error(`File ${relativePath} exceeds 10MB limit`);
    }

    const mimeType = mime.lookup(relativePath) || "application/octet-stream";
    const isExecutable = EXECUTABLE_EXTENSIONS.includes(ext);

    const parsedFile: ParsedFile = {
      relativePath,
      content,
      mimeType,
      size: content.length,
      isExecutable,
    };

    files.push(parsedFile);

    // Categorize by directory
    const firstDir = relativePath.split("/")[0]?.toLowerCase();
    if (SCRIPT_DIRS.includes(firstDir)) {
      scripts.push(parsedFile);
    } else if (REFERENCE_DIRS.includes(firstDir)) {
      references.push(parsedFile);
    } else if (ASSET_DIRS.includes(firstDir)) {
      assets.push(parsedFile);
    }
  }

  return {
    ...parsedMarkdown,
    scripts,
    references,
    assets,
    files,
  };
}

/**
 * Parse a single SKILL.md file (no scripts, just prompt template)
 */
export async function parseSingleSkillMd(fileBuffer: Buffer, filename: string): Promise<ParsedSkillPackage> {
  const content = fileBuffer.toString("utf-8");
  const parsedMarkdown = parseSkillMarkdown(content);

  return {
    ...parsedMarkdown,
    scripts: [],
    references: [],
    assets: [],
    files: [],
  };
}
