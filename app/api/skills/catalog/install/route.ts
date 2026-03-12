import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  getCatalogSkillById,
  getCatalogSkillsByCollection,
} from "@/lib/skills/catalog";
import { loadBundledSkillMarkdown, loadBundledSkillFiles } from "@/lib/skills/catalog/bundled-loader";
import { fetchSkillFromGitHub } from "@/lib/skills/catalog/github-fetch";
import type {
  CatalogInstallManyRequest,
  CatalogInstallManyResponse,
  CatalogInstallRequest,
  CatalogSkill,
  CatalogUninstallManyRequest,
  CatalogUninstallManyResponse,
} from "@/lib/skills/catalog/types";
import type { ParsedSkillPackage } from "@/lib/skills/import-parser";
import { parseSingleSkillMd } from "@/lib/skills/import-parser";
import {
  assertCharacterOwnership,
  deleteSkill,
  importSkillPackage,
  listSkillsForUser,
} from "@/lib/skills/queries";

export const runtime = "nodejs";

async function loadCatalogSkillMarkdown(skill: CatalogSkill): Promise<string> {
  return skill.installSource.type === "bundled"
    ? loadBundledSkillMarkdown(skill.id, skill.installSource)
    : fetchSkillFromGitHub(skill.installSource);
}

async function attachBundledFiles(skill: CatalogSkill, parsedSkill: ParsedSkillPackage): Promise<void> {
  if (skill.installSource.type !== "bundled") {
    return;
  }

  const bundledFiles = await loadBundledSkillFiles(skill.id);
  if (bundledFiles.length === 0) {
    return;
  }

  parsedSkill.scripts = bundledFiles.filter((file) => file.relativePath.startsWith("scripts/"));
  parsedSkill.references = bundledFiles.filter((file) => file.relativePath.startsWith("references/"));
  parsedSkill.files = bundledFiles;
}

async function installCatalogSkillForCharacter(params: {
  userId: string;
  characterId: string;
  catalogSkill: CatalogSkill;
}) {
  const markdown = await loadCatalogSkillMarkdown(params.catalogSkill);
  const parsedSkill = await parseSingleSkillMd(
    Buffer.from(markdown, "utf-8"),
    `${params.catalogSkill.id}.md`
  );

  await attachBundledFiles(params.catalogSkill, parsedSkill);

  return importSkillPackage({
    userId: params.userId,
    characterId: params.characterId,
    parsedSkill,
    sourceType: "catalog",
    catalogId: params.catalogSkill.id,
    icon: params.catalogSkill.icon,
    status: "active",
    categoryOverride: params.catalogSkill.category,
    nameOverride: params.catalogSkill.displayName,
    descriptionOverride: params.catalogSkill.shortDescription,
  });
}

function uniqueCatalogSkills(skills: CatalogSkill[]): CatalogSkill[] {
  return Array.from(new Map(skills.map((skill) => [skill.id, skill])).values());
}

function resolveTargetCatalogSkills(body: {
  collectionId?: string;
  catalogSkillIds?: string[];
}) {
  const collectionId = body.collectionId?.trim();
  const requestedIds = Array.isArray(body.catalogSkillIds)
    ? body.catalogSkillIds.map((id) => id.trim()).filter(Boolean)
    : [];

  let targetSkills: CatalogSkill[] = [];

  if (collectionId) {
    targetSkills = getCatalogSkillsByCollection(collectionId);
    if (targetSkills.length === 0) {
      return {
        error: NextResponse.json({ error: "Collection not found" }, { status: 404 }),
        targetSkills: [] as CatalogSkill[],
      };
    }
  }

  if (requestedIds.length > 0) {
    const requestedSkills = requestedIds
      .map((catalogSkillId) => getCatalogSkillById(catalogSkillId))
      .filter((skill): skill is CatalogSkill => Boolean(skill));

    if (!collectionId && requestedSkills.length === 0) {
      return {
        error: NextResponse.json({ error: "No catalog skills selected" }, { status: 404 }),
        targetSkills: [] as CatalogSkill[],
      };
    }

    targetSkills = requestedSkills;
  }

  if (collectionId && requestedIds.length > 0) {
    const allowedIds = new Set(getCatalogSkillsByCollection(collectionId).map((skill) => skill.id));
    targetSkills = targetSkills.filter((skill) => allowedIds.has(skill.id));
  }

  targetSkills = uniqueCatalogSkills(targetSkills);

  if (targetSkills.length === 0) {
    return {
      error: NextResponse.json({ error: "No catalog skills selected" }, { status: 400 }),
      targetSkills: [] as CatalogSkill[],
    };
  }

  return { error: null, targetSkills };
}

async function handleSingleInstall(userId: string, characterId: string, catalogSkillId: string) {
  const catalogSkill = getCatalogSkillById(catalogSkillId);
  if (!catalogSkill) {
    return NextResponse.json(
      { error: "Skill not found in catalog", code: "not_found" },
      { status: 404 }
    );
  }

  const existingSkills = await listSkillsForUser(userId, { all: true, limit: 1000, characterId });
  const existing = existingSkills.find((skill) => skill.catalogId === catalogSkillId);
  if (existing) {
    return NextResponse.json(
      {
        error: "Skill already installed",
        code: "already_installed",
        existingSkillId: existing.id,
      },
      { status: 409 }
    );
  }

  const installed = await installCatalogSkillForCharacter({
    userId,
    characterId,
    catalogSkill,
  });

  return NextResponse.json({
    installed: true,
    skillId: installed.id,
    name: installed.name,
  });
}

async function handleBulkInstall(
  userId: string,
  characterId: string,
  body: CatalogInstallManyRequest
) {
  const { error, targetSkills } = resolveTargetCatalogSkills(body);
  if (error) {
    return error;
  }

  const existingSkills = await listSkillsForUser(userId, { all: true, limit: 1000, characterId });
  const existingByCatalogId = new Map(
    existingSkills
      .filter((skill) => skill.catalogId)
      .map((skill) => [skill.catalogId!, skill])
  );

  const response: CatalogInstallManyResponse = {
    installed: [],
    skipped: [],
    failed: [],
  };

  for (const catalogSkill of targetSkills) {
    const existing = existingByCatalogId.get(catalogSkill.id);
    if (existing) {
      response.skipped.push({
        catalogSkillId: catalogSkill.id,
        existingSkillId: existing.id,
      });
      continue;
    }

    try {
      const installed = await installCatalogSkillForCharacter({
        userId,
        characterId,
        catalogSkill,
      });

      existingByCatalogId.set(catalogSkill.id, installed);
      response.installed.push({
        catalogSkillId: catalogSkill.id,
        skillId: installed.id,
        name: installed.name,
      });
    } catch (error) {
      response.failed.push({
        catalogSkillId: catalogSkill.id,
        name: catalogSkill.displayName,
        error: error instanceof Error ? error.message : "Install failed",
      });
    }
  }

  return NextResponse.json(response);
}

async function handleBulkUninstall(
  userId: string,
  characterId: string,
  body: CatalogUninstallManyRequest
) {
  const { error, targetSkills } = resolveTargetCatalogSkills(body);
  if (error) {
    return error;
  }

  const installedSkills = await listSkillsForUser(userId, { all: true, limit: 1000, characterId });
  const installedByCatalogId = new Map(
    installedSkills
      .filter((skill) => skill.catalogId)
      .map((skill) => [skill.catalogId!, skill])
  );

  const response: CatalogUninstallManyResponse = {
    removed: [],
    skipped: [],
    failed: [],
  };

  for (const catalogSkill of targetSkills) {
    const installed = installedByCatalogId.get(catalogSkill.id);
    if (!installed) {
      response.skipped.push({
        catalogSkillId: catalogSkill.id,
        reason: "not_installed",
      });
      continue;
    }

    try {
      const deleted = await deleteSkill(installed.id, userId);
      if (!deleted) {
        response.failed.push({
          catalogSkillId: catalogSkill.id,
          skillId: installed.id,
          error: "Uninstall failed",
        });
        continue;
      }

      response.removed.push({
        catalogSkillId: catalogSkill.id,
        skillId: installed.id,
      });
      installedByCatalogId.delete(catalogSkill.id);
    } catch (error) {
      response.failed.push({
        catalogSkillId: catalogSkill.id,
        skillId: installed.id,
        error: error instanceof Error ? error.message : "Uninstall failed",
      });
    }
  }

  return NextResponse.json(response);
}

async function authenticateAndResolveCharacter(req: NextRequest) {
  const userId = await requireAuth(req);
  const settings = loadSettings();
  const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

  return { dbUser };
}

export async function POST(req: NextRequest) {
  try {
    const { dbUser } = await authenticateAndResolveCharacter(req);

    const body = (await req.json()) as CatalogInstallRequest | CatalogInstallManyRequest;
    const characterId = body?.characterId?.trim();

    if (!characterId) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }

    const ownsCharacter = await assertCharacterOwnership(characterId, dbUser.id);
    if (!ownsCharacter) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const catalogSkillId = "catalogSkillId" in body ? body.catalogSkillId?.trim() : undefined;
    if (catalogSkillId) {
      return handleSingleInstall(dbUser.id, characterId, catalogSkillId);
    }

    return handleBulkInstall(dbUser.id, characterId, body as CatalogInstallManyRequest);
  } catch (error) {
    console.error("[Skills Catalog Install API] POST error:", error);

    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to install catalog skill" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { dbUser } = await authenticateAndResolveCharacter(req);

    const body = (await req.json()) as CatalogUninstallManyRequest;
    const characterId = body?.characterId?.trim();

    if (!characterId) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }

    const ownsCharacter = await assertCharacterOwnership(characterId, dbUser.id);
    if (!ownsCharacter) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    return handleBulkUninstall(dbUser.id, characterId, body);
  } catch (error) {
    console.error("[Skills Catalog Install API] DELETE error:", error);

    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to uninstall catalog skill" },
      { status: 500 }
    );
  }
}
