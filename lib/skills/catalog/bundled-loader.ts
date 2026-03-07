import { promises as fs } from "fs";
import path from "path";
import mime from "mime-types";
import type { CatalogSkillSource } from "./types";
import type { ParsedFile } from "../import-parser";

const BUNDLED_SKILL_BASE_DIR = path.join(process.cwd(), "lib", "skills", "catalog", "bundled");

const EXECUTABLE_EXTENSIONS = [".py", ".js", ".sh", ".bash", ".zsh", ".ts", ".mjs"];
const SCRIPT_DIR = "scripts";
const REFERENCE_DIR = "references";

/**
 * Returns the absolute path to a bundled skill's root directory.
 * For directory-based skills: `bundled/{id}/`
 * For flat skills: `bundled/` (the base dir itself)
 */
export function getBundledSkillRootPath(skillId: string): string {
  return path.join(BUNDLED_SKILL_BASE_DIR, skillId);
}

/**
 * Load the SKILL.md markdown content for a bundled skill.
 * Tries directory layout (`{id}/SKILL.md`) first, falls back to flat (`{id}.md`).
 */
export async function loadBundledSkillMarkdown(skillId: string, source: CatalogSkillSource): Promise<string> {
  if (source.type !== "bundled") {
    throw new Error("Bundled source required");
  }

  // If an explicit file override is set, use it directly
  if (source.file) {
    const normalized = source.file.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.includes("..")) {
      throw new Error("Invalid bundled skill path");
    }
    const fullPath = path.join(BUNDLED_SKILL_BASE_DIR, normalized);
    return fs.readFile(fullPath, "utf-8");
  }

  // Try directory layout first: {id}/SKILL.md
  const dirPath = path.join(BUNDLED_SKILL_BASE_DIR, skillId, "SKILL.md");
  try {
    return await fs.readFile(dirPath, "utf-8");
  } catch {
    // Fall back to flat layout: {id}.md
    const flatPath = path.join(BUNDLED_SKILL_BASE_DIR, `${skillId}.md`);
    return fs.readFile(flatPath, "utf-8");
  }
}

/**
 * Load all scripts and reference files from a directory-based bundled skill.
 * Returns empty array for flat-file skills (no scripts/references directory).
 */
export async function loadBundledSkillFiles(skillId: string): Promise<ParsedFile[]> {
  const skillDir = path.join(BUNDLED_SKILL_BASE_DIR, skillId);

  // Check if the skill directory exists
  try {
    const stat = await fs.stat(skillDir);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const files: ParsedFile[] = [];
  const dirsToScan = [SCRIPT_DIR, REFERENCE_DIR];

  for (const subDir of dirsToScan) {
    const subDirPath = path.join(skillDir, subDir);
    try {
      const entries = await fs.readdir(subDirPath);
      for (const entry of entries) {
        const filePath = path.join(subDirPath, entry);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;

        const content = await fs.readFile(filePath);
        const ext = path.extname(entry).toLowerCase();
        const relativePath = `${subDir}/${entry}`;
        const mimeType = mime.lookup(entry) || "application/octet-stream";
        const isExecutable = EXECUTABLE_EXTENSIONS.includes(ext);

        files.push({
          relativePath,
          content,
          mimeType,
          size: content.length,
          isExecutable,
        });
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }

  return files;
}
