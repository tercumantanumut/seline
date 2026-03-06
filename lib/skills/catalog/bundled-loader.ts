import { promises as fs } from "fs";
import path from "path";
import type { CatalogSkillSource } from "./types";

const BUNDLED_SKILL_BASE_DIR = path.join(process.cwd(), "lib", "skills", "catalog", "bundled");

function resolveBundledSkillFileName(skillId: string): string {
  return `${skillId}.md`;
}

export async function loadBundledSkillMarkdown(skillId: string, source: CatalogSkillSource): Promise<string> {
  if (source.type !== "bundled") {
    throw new Error("Bundled source required");
  }

  const fileName = source.file || resolveBundledSkillFileName(skillId);
  const normalized = fileName.replace(/\\/g, "/").replace(/^\/+/, "");

  if (normalized.includes("..")) {
    throw new Error("Invalid bundled skill path");
  }

  const fullPath = path.join(BUNDLED_SKILL_BASE_DIR, normalized);
  const content = await fs.readFile(fullPath, "utf-8");
  return content;
}
