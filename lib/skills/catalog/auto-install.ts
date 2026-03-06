import { SYSTEM_SKILLS } from "./system-skills";
import { getCatalogSkillById } from "./index";
import { loadBundledSkillMarkdown } from "./bundled-loader";
import { parseSingleSkillMd } from "../import-parser";
import { importSkillPackage, listSkillsForUser } from "../queries";

export interface AutoInstallResult {
  installed: string[];
  failed: string[];
  skipped: string[];
}

/**
 * Auto-install all system skills for a newly created character.
 *
 * - Skips skills that are already installed (matched by catalogId).
 * - Catches errors per-skill so one failure doesn't block the rest.
 * - Only installs bundled system skills (non-bundled sources are skipped).
 */
export async function autoInstallSystemSkills(
  userId: string,
  characterId: string
): Promise<AutoInstallResult> {
  const result: AutoInstallResult = {
    installed: [],
    failed: [],
    skipped: [],
  };

  // Check which catalog skills are already installed for this character
  const existingSkills = await listSkillsForUser(userId, {
    characterId,
    limit: 500,
  });
  const installedCatalogIds = new Set(
    existingSkills
      .filter((s) => s.catalogId)
      .map((s) => s.catalogId!)
  );

  for (const systemSkill of SYSTEM_SKILLS) {
    try {
      // Skip if already installed
      if (installedCatalogIds.has(systemSkill.id)) {
        result.skipped.push(systemSkill.id);
        continue;
      }

      const catalogSkill = getCatalogSkillById(systemSkill.id);
      if (!catalogSkill || catalogSkill.installSource.type !== "bundled") {
        result.skipped.push(systemSkill.id);
        continue;
      }

      const markdown = await loadBundledSkillMarkdown(
        catalogSkill.id,
        catalogSkill.installSource
      );
      const parsedSkill = await parseSingleSkillMd(
        Buffer.from(markdown, "utf-8"),
        `${catalogSkill.id}.md`
      );

      await importSkillPackage({
        userId,
        characterId,
        parsedSkill,
        sourceType: "catalog",
        catalogId: catalogSkill.id,
        icon: catalogSkill.icon,
        status: "active",
        categoryOverride: catalogSkill.category,
        nameOverride: catalogSkill.displayName,
        descriptionOverride: catalogSkill.shortDescription,
      });

      result.installed.push(systemSkill.id);
    } catch (error) {
      console.warn(
        `[AutoInstall] Failed to install system skill "${systemSkill.id}":`,
        error
      );
      result.failed.push(systemSkill.id);
    }
  }

  if (result.installed.length > 0) {
    console.log(
      `[AutoInstall] Installed ${result.installed.length} system skill(s) for character ${characterId}: ${result.installed.join(", ")}`
    );
  }

  return result;
}
