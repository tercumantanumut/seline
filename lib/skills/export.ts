import JSZip from "jszip";
import type { SkillFile } from "@/lib/db/sqlite-skills-schema";
import type { SkillRecord } from "./types";

const ZIP_MIME_TYPE = "application/zip";

function slugifySkillName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "skill";
}

function toFrontmatterValue(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/'/g, "''")
    .trim();
}

function normalizeExportPath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/")) return null;

  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  for (const segment of segments) {
    if (segment === "." || segment === "..") return null;
  }

  return segments.join("/");
}

function buildSkillMarkdown(skill: SkillRecord): string {
  const lines: string[] = [
    "---",
    `name: '${toFrontmatterValue(skill.name)}'`,
    `description: '${toFrontmatterValue((skill.description || "").trim() || "No description provided.")}'`,
  ];

  if (skill.toolHints.length > 0) {
    lines.push("allowed-tools:");
    for (const toolHint of skill.toolHints) {
      lines.push(`  - '${toFrontmatterValue(toolHint)}'`);
    }
  }

  lines.push("---", "", skill.promptTemplate.trim());
  return lines.join("\n");
}

function toBuffer(content: SkillFile["content"]): Buffer {
  if (content instanceof Buffer) {
    return content;
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }
  return Buffer.from(content as ArrayBuffer);
}

export interface SkillExportArtifact {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  skippedFiles: string[];
}

export async function buildSkillExportArtifact(
  skill: SkillRecord,
  files: SkillFile[]
): Promise<SkillExportArtifact> {
  const zip = new JSZip();
  zip.file("SKILL.md", buildSkillMarkdown(skill));

  const skippedFiles: string[] = [];

  for (const file of files) {
    const exportPath = normalizeExportPath(file.relativePath);
    if (!exportPath || exportPath === "SKILL.md") {
      skippedFiles.push(file.relativePath);
      continue;
    }

    zip.file(exportPath, toBuffer(file.content), {
      binary: true,
      date: new Date(file.createdAt),
    });
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  return {
    fileName: `${slugifySkillName(skill.name)}.zip`,
    mimeType: ZIP_MIME_TYPE,
    buffer,
    skippedFiles,
  };
}
