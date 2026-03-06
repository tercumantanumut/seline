export type SkillCategory =
  | "design"
  | "deploy"
  | "dev-tools"
  | "productivity"
  | "creative"
  | "docs"
  | "security";

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
    };

export interface CatalogSkill {
  id: string;
  displayName: string;
  shortDescription: string;
  category: SkillCategory;
  icon: string;
  defaultPrompt: string;
  overview?: string;
  dependencies?: CatalogSkillDependency[];
  installSource: CatalogSkillSource;
  tags: string[];
  platforms?: Array<"darwin" | "linux" | "windows">;
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
  icon: string;
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

export interface CatalogSkillWithStatus extends CatalogSkill {
  isInstalled: boolean;
  installedSkillId: string | null;
  isEnabled: boolean | null;
}
