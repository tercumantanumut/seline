export type BuiltInSkillCategory =
  | "design"
  | "deploy"
  | "dev-tools"
  | "productivity"
  | "creative"
  | "docs"
  | "security";

export type SkillCategory = BuiltInSkillCategory | string;

export interface CatalogSkillDependency {
  type: "mcp" | "api-key" | "cli";
  value: string;
  description: string;
  url?: string;
}

export type CatalogSkillSource =
  | {
      type: "bundled";
      file?: string;
    }
  | {
      type: "github";
      repo: string;
      path: string;
      ref?: string;
      contentKind?: "skill-package" | "markdown-file";
    };

export interface CatalogSkillCollection {
  id: string;
  label: string;
  url?: string;
  description?: string;
}

export interface CatalogSkill {
  id: string;
  displayName: string;
  shortDescription: string;
  category: SkillCategory;
  icon: string | null;
  defaultPrompt: string;
  overview?: string;
  dependencies?: CatalogSkillDependency[];
  installSource: CatalogSkillSource;
  tags: string[];
  platforms?: Array<"darwin" | "linux" | "windows">;
  collectionId?: string;
  collectionLabel?: string;
  collectionUrl?: string;
}

export interface CatalogInstallResult {
  markdown: string;
  sourceKind: "bundled" | "github";
}

export interface CatalogInstallSkill {
  id: string;
  displayName: string;
  shortDescription: string;
  category: SkillCategory;
  icon: string | null;
  installSource: CatalogSkillSource;
}

export interface CatalogInstallRequest {
  catalogSkillId: string;
  characterId: string;
}

export interface CatalogInstallResponse {
  installed: boolean;
  skillId: string;
  name: string;
}

export interface CatalogInstallConflictResponse {
  error: string;
  code: "already_installed";
  existingSkillId: string;
}

export interface CatalogInstallNotFoundResponse {
  error: string;
  code: "not_found";
}

export interface CatalogInstallManyRequest {
  characterId: string;
  collectionId?: string;
  catalogSkillIds?: string[];
}

export interface CatalogInstallManyResultItem {
  catalogSkillId: string;
  skillId: string;
  name: string;
}

export interface CatalogInstallManySkippedItem {
  catalogSkillId: string;
  existingSkillId: string;
}

export interface CatalogInstallManyFailedItem {
  catalogSkillId: string;
  name: string;
  error: string;
}

export interface CatalogInstallManyResponse {
  installed: CatalogInstallManyResultItem[];
  skipped: CatalogInstallManySkippedItem[];
  failed: CatalogInstallManyFailedItem[];
}

export interface CatalogUninstallManyRequest {
  characterId: string;
  collectionId?: string;
  catalogSkillIds?: string[];
}

export interface CatalogUninstallManyRemovedItem {
  catalogSkillId: string;
  skillId: string;
}

export interface CatalogUninstallManySkippedItem {
  catalogSkillId: string;
  reason: "not_installed";
}

export interface CatalogUninstallManyFailedItem {
  catalogSkillId: string;
  skillId: string | null;
  error: string;
}

export interface CatalogUninstallManyResponse {
  removed: CatalogUninstallManyRemovedItem[];
  skipped: CatalogUninstallManySkippedItem[];
  failed: CatalogUninstallManyFailedItem[];
}

export interface CatalogSkillWithStatus extends CatalogSkill {
  isInstalled: boolean;
  installedSkillId: string | null;
  isEnabled: boolean | null;
}
