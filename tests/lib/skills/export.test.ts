import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildSkillExportArtifact } from "@/lib/skills/export";
import type { SkillRecord } from "@/lib/skills/types";
import type { SkillFile } from "@/lib/db/sqlite-skills-schema";

function makeSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: "skill-1",
    userId: "user-1",
    characterId: "character-1",
    name: "Weekly Review",
    description: "Summarize weekly updates",
    icon: null,
    promptTemplate: "Provide five concise bullets.",
    inputParameters: [],
    toolHints: ["webSearch", "readFile"],
    triggerExamples: [],
    category: "general",
    version: 1,
    copiedFromSkillId: null,
    copiedFromCharacterId: null,
    sourceType: "manual",
    sourceSessionId: null,
    runCount: 0,
    successCount: 0,
    lastRunAt: null,
    status: "active",
    createdAt: "2026-02-26T09:00:00.000Z",
    updatedAt: "2026-02-26T09:00:00.000Z",
    ...overrides,
  };
}

function makeFile(overrides: Partial<SkillFile> = {}): SkillFile {
  return {
    id: "file-1",
    skillId: "skill-1",
    relativePath: "scripts/run.ts",
    content: Buffer.from("console.log('hello')"),
    mimeType: "application/typescript",
    size: 20,
    isExecutable: true,
    createdAt: "2026-02-26T09:00:00.000Z",
    ...overrides,
  };
}

describe("buildSkillExportArtifact", () => {
  it("builds a valid zip with SKILL.md and attached files", async () => {
    const artifact = await buildSkillExportArtifact(makeSkill(), [
      makeFile({ relativePath: "scripts/run.ts", content: Buffer.from("echo run") }),
      makeFile({ id: "file-2", relativePath: "docs/guide.md", content: Buffer.from("# guide") }),
    ]);

    expect(artifact.fileName).toBe("weekly-review.zip");
    expect(artifact.mimeType).toBe("application/zip");
    expect(artifact.skippedFiles).toEqual([]);

    const zip = await JSZip.loadAsync(artifact.buffer);
    const skillMd = await zip.file("SKILL.md")?.async("string");
    const script = await zip.file("scripts/run.ts")?.async("string");
    const docs = await zip.file("docs/guide.md")?.async("string");

    expect(skillMd).toContain("name: 'Weekly Review'");
    expect(skillMd).toContain("description: 'Summarize weekly updates'");
    expect(skillMd).toContain("allowed-tools:");
    expect(skillMd).toContain("- 'webSearch'");
    expect(skillMd).toContain("Provide five concise bullets.");
    expect(script).toBe("echo run");
    expect(docs).toBe("# guide");
  });

  it("skips unsafe or duplicate SKILL.md paths", async () => {
    const artifact = await buildSkillExportArtifact(makeSkill({ name: "My Skill" }), [
      makeFile({ id: "file-1", relativePath: "SKILL.md" }),
      makeFile({ id: "file-2", relativePath: "../escape.sh" }),
      makeFile({ id: "file-3", relativePath: "/abs/path.sh" }),
      makeFile({ id: "file-4", relativePath: "ok/path.txt", content: Buffer.from("ok") }),
    ]);

    expect(artifact.fileName).toBe("my-skill.zip");
    expect(artifact.skippedFiles).toEqual(["SKILL.md", "../escape.sh", "/abs/path.sh"]);

    const zip = await JSZip.loadAsync(artifact.buffer);
    expect(await zip.file("SKILL.md")?.async("string")).toContain("name: 'My Skill'");
    expect(await zip.file("ok/path.txt")?.async("string")).toBe("ok");
    expect(zip.file("../escape.sh")).toBeNull();
    expect(zip.file("/abs/path.sh")).toBeNull();
  });
});
