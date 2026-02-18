import { tool, jsonSchema } from "ai";
import {
  applyFileEdits,
  generateBeforeAfterDiff,
  type FileEdit,
} from "@/lib/ai/filesystem";
import {
  assertCharacterOwnership,
  copySkill,
  createSkill,
  updateSkill,
} from "@/lib/skills/queries";
import type { SkillInputParameter, SkillStatus } from "@/lib/skills/types";
import { resolveRuntimeSkill } from "@/lib/skills/runtime-catalog";
import { createPluginSkillRevision } from "@/lib/plugins/skill-revision-queries";

type UpdateSkillAction = "create" | "patch" | "replace" | "metadata" | "copy" | "archive";

interface UpdateSkillInput {
  action: UpdateSkillAction;
  skillId?: string;
  skillName?: string;
  source?: "db" | "plugin";
  expectedVersion?: number;
  expectedVersionRef?: number;
  changeReason?: string;
  dryRun?: boolean;

  // Create / metadata / replace
  name?: string;
  description?: string | null;
  icon?: string | null;
  promptTemplate?: string;
  content?: string;
  inputParameters?: SkillInputParameter[];
  toolHints?: string[];
  triggerExamples?: string[];
  category?: string;
  status?: SkillStatus;
  skipVersionBump?: boolean;

  // Patch
  oldString?: string;
  newString?: string;
  edits?: FileEdit[];

  // Copy
  targetCharacterId?: string;
  targetName?: string;
}

export interface UpdateSkillToolOptions {
  userId: string;
  characterId?: string;
}

const schema = jsonSchema<UpdateSkillInput>({
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["create", "patch", "replace", "metadata", "copy", "archive"],
    },
    skillId: { type: "string" },
    skillName: { type: "string" },
    source: { type: "string", enum: ["db", "plugin"] },
    expectedVersion: { type: "number" },
    expectedVersionRef: { type: "number" },
    changeReason: { type: "string", maxLength: 300 },
    dryRun: { type: "boolean" },
    name: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: ["string", "null"], maxLength: 1000 },
    icon: { type: ["string", "null"], maxLength: 20 },
    promptTemplate: { type: "string", minLength: 1, maxLength: 400000 },
    content: { type: "string", minLength: 1, maxLength: 400000 },
    inputParameters: { type: "array", items: { type: "object", additionalProperties: true } },
    toolHints: { type: "array", items: { type: "string" } },
    triggerExamples: { type: "array", items: { type: "string" } },
    category: { type: "string", minLength: 1, maxLength: 80 },
    status: { type: "string", enum: ["draft", "active", "archived"] },
    skipVersionBump: { type: "boolean" },
    oldString: { type: "string" },
    newString: { type: "string" },
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          oldString: { type: "string" },
          newString: { type: "string" },
        },
        required: ["oldString", "newString"],
      },
    },
    targetCharacterId: { type: "string" },
    targetName: { type: "string", minLength: 1, maxLength: 120 },
  },
  required: ["action"],
  additionalProperties: false,
});

function getEffectiveExpectedVersion(input: UpdateSkillInput): number | undefined {
  return input.expectedVersionRef ?? input.expectedVersion;
}

function toEdits(input: UpdateSkillInput): FileEdit[] {
  if (Array.isArray(input.edits) && input.edits.length > 0) {
    return input.edits;
  }
  if (input.oldString !== undefined && input.newString !== undefined) {
    return [{ oldString: input.oldString, newString: input.newString }];
  }
  return [];
}

export function createUpdateSkillTool(options: UpdateSkillToolOptions) {
  return tool({
    description:
      "Unified skill mutation tool. Supports action=create|patch|replace|metadata|copy|archive for both DB and plugin-backed skills (plugin edits are revisioned).",
    inputSchema: schema,
    execute: async (input: UpdateSkillInput) => {
      const action = input.action;

      if (action === "create") {
        if (!options.characterId) {
          return { success: false, action, error: "No active character selected." };
        }
        if (!input.name || !(input.promptTemplate || input.content)) {
          return {
            success: false,
            action,
            error: "create requires name and promptTemplate (or content).",
          };
        }

        const ownsCharacter = await assertCharacterOwnership(options.characterId, options.userId);
        if (!ownsCharacter) {
          return { success: false, action, error: "Character not found or not owned by user." };
        }

        const skill = await createSkill({
          userId: options.userId,
          characterId: options.characterId,
          name: input.name,
          description: input.description,
          icon: input.icon,
          promptTemplate: input.promptTemplate || input.content || "",
          inputParameters: input.inputParameters || [],
          toolHints: input.toolHints || [],
          triggerExamples: input.triggerExamples || [],
          category: input.category || "general",
          sourceType: "manual",
          sourceSessionId: null,
          status: input.status || "active",
        });

        return {
          success: true,
          action,
          skill,
          message: `Created skill "${skill.name}".`,
        };
      }

      if (action === "copy") {
        if (!input.targetCharacterId) {
          return { success: false, action, error: "copy requires targetCharacterId." };
        }

        if (!input.skillId && !input.skillName) {
          return { success: false, action, error: "copy requires skillId or skillName." };
        }

        const resolution = await resolveRuntimeSkill({
          userId: options.userId,
          characterId: options.characterId,
          skillId: input.skillId,
          skillName: input.skillName,
          source: "db",
        });
        if (!resolution.skill || resolution.skill.source !== "db") {
          return {
            success: false,
            action,
            error: resolution.error || "DB skill not found for copy.",
            matches: resolution.matches,
          };
        }

        const skill = await copySkill(
          {
            skillId: resolution.skill.dbSkill.id,
            targetCharacterId: input.targetCharacterId,
            targetName: input.targetName,
          },
          options.userId,
        );

        if (!skill) {
          return {
            success: false,
            action,
            error: "Copy failed. Skill not found or target agent not owned.",
          };
        }

        return {
          success: true,
          action,
          skill,
          message: `Copied skill to target agent as "${skill.name}".`,
        };
      }

      if (!input.skillId && !input.skillName) {
        return { success: false, action, error: "Provide skillId or skillName." };
      }

      const resolved = await resolveRuntimeSkill({
        userId: options.userId,
        characterId: options.characterId,
        skillId: input.skillId,
        skillName: input.skillName,
        source: input.source,
      });

      if (!resolved.skill) {
        return {
          success: false,
          action,
          error: resolved.error || "Skill not found.",
          matches: resolved.matches,
        };
      }

      const skill = resolved.skill;
      const expectedVersion = getEffectiveExpectedVersion(input);

      if (action === "archive") {
        if (skill.source !== "db") {
          return {
            success: false,
            action,
            error: "archive is currently supported for DB skills only.",
          };
        }

        const archived = await updateSkill(skill.dbSkill.id, options.userId, {
          status: "archived",
          expectedVersion,
          changeReason: input.changeReason || "archived via updateSkill",
        });

        if (!archived.skill) {
          return { success: false, action, error: "Skill not found." };
        }
        if (archived.stale) {
          return {
            success: false,
            action,
            stale: true,
            staleVersion: archived.staleVersion,
            error: "Skill was updated elsewhere. Refresh and retry.",
            warnings: archived.warnings,
          };
        }

        return {
          success: true,
          action,
          skill: archived.skill,
          changedFields: archived.changedFields,
          warnings: archived.warnings,
          message: `Archived skill "${archived.skill.name}".`,
        };
      }

      if (action === "metadata") {
        if (skill.source !== "db") {
          return {
            success: false,
            action,
            error:
              "metadata updates are currently supported for DB skills only. Use patch/replace for plugin skill content.",
          };
        }

        const updated = await updateSkill(skill.dbSkill.id, options.userId, {
          name: input.name,
          description: input.description,
          icon: input.icon,
          inputParameters: input.inputParameters,
          toolHints: input.toolHints,
          triggerExamples: input.triggerExamples,
          category: input.category,
          status: input.status,
          expectedVersion,
          changeReason: input.changeReason,
          skipVersionBump: input.skipVersionBump,
        });

        if (!updated.skill) {
          return { success: false, action, error: "Skill not found." };
        }
        if (updated.stale) {
          return {
            success: false,
            action,
            stale: true,
            staleVersion: updated.staleVersion,
            error: "Skill was updated elsewhere. Refresh and retry.",
            warnings: updated.warnings,
          };
        }

        return {
          success: true,
          action,
          skill: updated.skill,
          changedFields: updated.changedFields,
          warnings: updated.warnings,
          noChanges: updated.noChanges,
        };
      }

      if (action === "replace") {
        const replacement = input.content ?? input.promptTemplate;
        if (!replacement) {
          return {
            success: false,
            action,
            error: "replace requires content or promptTemplate.",
          };
        }

        if (input.dryRun) {
          const before = skill.source === "db" ? skill.dbSkill.promptTemplate : skill.content;
          const diff = generateBeforeAfterDiff(
            `${skill.displayName}.skill.md`,
            before,
            replacement,
          );
          return {
            success: true,
            action,
            dryRun: true,
            skillId: skill.canonicalId,
            diff,
            linesChanged: Math.max(before.split("\n").length, replacement.split("\n").length),
            message: "[Dry Run] Replace preview generated.",
          };
        }

        if (skill.source === "db") {
          const updated = await updateSkill(skill.dbSkill.id, options.userId, {
            promptTemplate: replacement,
            expectedVersion,
            changeReason: input.changeReason || "replace via updateSkill",
            skipVersionBump: input.skipVersionBump,
          });

          if (!updated.skill) {
            return { success: false, action, error: "Skill not found." };
          }
          if (updated.stale) {
            return {
              success: false,
              action,
              stale: true,
              staleVersion: updated.staleVersion,
              error: "Skill was updated elsewhere. Refresh and retry.",
              warnings: updated.warnings,
            };
          }

          const diff = generateBeforeAfterDiff(
            `${skill.displayName}.skill.md`,
            skill.dbSkill.promptTemplate,
            replacement,
          );

          return {
            success: true,
            action,
            skill: updated.skill,
            changedFields: updated.changedFields,
            warnings: updated.warnings,
            diff,
            message: `Replaced content for "${updated.skill.name}".`,
          };
        }

        const revision = await createPluginSkillRevision({
          userId: options.userId,
          pluginId: skill.pluginId,
          namespacedName: skill.namespacedName,
          content: replacement,
          expectedVersion,
          changeReason: input.changeReason || "replace via updateSkill",
        });

        if (!revision.success) {
          return {
            success: false,
            action,
            stale: revision.stale,
            staleVersion: revision.staleVersion,
            error: revision.error || "Failed to replace plugin skill content.",
          };
        }

        const diff = generateBeforeAfterDiff(
          `${skill.displayName}.skill.md`,
          skill.content,
          replacement,
        );

        return {
          success: true,
          action,
          source: "plugin",
          skillId: skill.canonicalId,
          revision: revision.revision,
          diff,
          message: `Replaced plugin skill content for "${skill.displayName}".`,
        };
      }

      if (action === "patch") {
        const edits = toEdits(input);
        if (edits.length === 0) {
          return {
            success: false,
            action,
            error: "patch requires edits or oldString/newString.",
          };
        }

        const before = skill.source === "db" ? skill.dbSkill.promptTemplate : skill.content;
        const patchResult = applyFileEdits(before, edits);
        if (!patchResult.success) {
          return {
            success: false,
            action,
            error: patchResult.error || "Failed to apply patch.",
          };
        }

        const diff = generateBeforeAfterDiff(
          `${skill.displayName}.skill.md`,
          before,
          patchResult.newContent,
        );

        if (input.dryRun) {
          return {
            success: true,
            action,
            dryRun: true,
            skillId: skill.canonicalId,
            diff,
            linesChanged: patchResult.linesChanged,
            message: "[Dry Run] Patch preview generated.",
          };
        }

        if (skill.source === "db") {
          const updated = await updateSkill(skill.dbSkill.id, options.userId, {
            promptTemplate: patchResult.newContent,
            expectedVersion,
            changeReason: input.changeReason || "patch via updateSkill",
            skipVersionBump: input.skipVersionBump,
          });

          if (!updated.skill) {
            return { success: false, action, error: "Skill not found." };
          }
          if (updated.stale) {
            return {
              success: false,
              action,
              stale: true,
              staleVersion: updated.staleVersion,
              error: "Skill was updated elsewhere. Refresh and retry.",
              warnings: updated.warnings,
            };
          }

          return {
            success: true,
            action,
            skill: updated.skill,
            changedFields: updated.changedFields,
            warnings: updated.warnings,
            diff,
            linesChanged: patchResult.linesChanged,
            message: `Patched "${updated.skill.name}".`,
          };
        }

        const revision = await createPluginSkillRevision({
          userId: options.userId,
          pluginId: skill.pluginId,
          namespacedName: skill.namespacedName,
          content: patchResult.newContent,
          expectedVersion,
          changeReason: input.changeReason || "patch via updateSkill",
        });

        if (!revision.success) {
          return {
            success: false,
            action,
            stale: revision.stale,
            staleVersion: revision.staleVersion,
            error: revision.error || "Failed to patch plugin skill content.",
          };
        }

        return {
          success: true,
          action,
          source: "plugin",
          skillId: skill.canonicalId,
          revision: revision.revision,
          diff,
          linesChanged: patchResult.linesChanged,
          message: `Patched plugin skill "${skill.displayName}".`,
        };
      }

      return {
        success: false,
        action,
        error: `Unsupported action: ${action}`,
      };
    },
  });
}
