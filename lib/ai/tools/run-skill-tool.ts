import { tool, jsonSchema } from "ai";
import path from "path";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { getScheduler } from "@/lib/scheduler/scheduler-service";
import { renderSkillPrompt } from "@/lib/skills/runtime";
import { trackSkillTelemetryEvent } from "@/lib/skills/telemetry";
import { updateSkillRunStats } from "@/lib/skills/queries";
import {
  listRuntimeSkills,
  resolveRuntimeSkill,
  type RuntimeSkill,
} from "@/lib/skills/runtime-catalog";

type RunSkillAction = "list" | "inspect" | "run";

interface RunSkillInput {
  action?: RunSkillAction;
  skillId?: string;
  skillName?: string;
  source?: "db" | "plugin";
  query?: string;
  limit?: number;
  includeContentWithLineNumbers?: boolean;
  parameters?: Record<string, string | number | boolean | null>;
  schedule?: {
    name: string;
    scheduleType: "cron" | "interval" | "once";
    cronExpression?: string;
    intervalMinutes?: number;
    scheduledAt?: string;
    timezone?: string;
    deliveryMethod?: "session" | "channel" | "email" | "slack" | "webhook";
    deliveryConfig?: Record<string, unknown>;
    createNewSessionPerRun?: boolean;
  };
}

export interface RunSkillToolOptions {
  sessionId: string;
  userId: string;
  characterId: string;
}

const schema = jsonSchema<RunSkillInput>({
  type: "object",
  properties: {
    action: { type: "string", enum: ["list", "inspect", "run"] },
    skillId: { type: "string" },
    skillName: { type: "string" },
    source: { type: "string", enum: ["db", "plugin"] },
    query: { type: "string" },
    limit: { type: "number", minimum: 1, maximum: 200 },
    includeContentWithLineNumbers: { type: "boolean" },
    parameters: { type: "object", additionalProperties: true },
    schedule: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
});

function withLineNumbers(text: string): string {
  return text
    .split("\n")
    .map((line, index) => `${index + 1} | ${line}`)
    .join("\n");
}

function renderPluginSkillTemplate(
  content: string,
  parameters: Record<string, string | number | boolean | null>,
): {
  renderedPrompt: string;
  missingParameters: string[];
  resolvedParameters: Record<string, string | number | boolean | null>;
} {
  const resolvedParameters: Record<string, string | number | boolean | null> = {};
  const missing = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

  let rendered = content.replace(pattern, (_full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(parameters, key)) {
      const value = parameters[key];
      resolvedParameters[key] = value;
      return value === null ? "" : String(value);
    }
    missing.add(key);
    return `{{${key}}}`;
  });

  // Preserve full content and avoid accidental trim-induced semantic changes.
  if (!rendered.endsWith("\n") && content.endsWith("\n")) {
    rendered += "\n";
  }

  return {
    renderedPrompt: rendered,
    missingParameters: Array.from(missing),
    resolvedParameters,
  };
}

function injectPluginRoot(
  renderedPrompt: string,
  pluginCachePath?: string
): string {
  if (!pluginCachePath) return renderedPrompt;
  const pluginRoot = path.resolve(pluginCachePath);
  return renderedPrompt.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot);
}

function normalizeAction(input: RunSkillInput): RunSkillAction {
  if (input.action) return input.action;
  if (!input.skillId && !input.skillName) return "list";
  return "run";
}

function toSkillListItem(skill: RuntimeSkill) {
  return {
    skillId: skill.canonicalId,
    source: skill.source,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    modelInvocationAllowed: skill.modelInvocationAllowed,
    versionRef: skill.versionRef,
    ...(skill.source === "db"
      ? {
          runCount: skill.dbSkill.runCount,
          successCount: skill.dbSkill.successCount,
          status: skill.dbSkill.status,
        }
      : {
          pluginId: skill.pluginId,
          pluginName: skill.pluginName,
          pluginVersion: skill.pluginVersion,
          namespacedName: skill.namespacedName,
          disableModelInvocation: !skill.modelInvocationAllowed,
        }),
  };
}

function getInspectContent(
  skill: RuntimeSkill,
): {
  content: string;
  contentWithLineNumbers: string;
} {
  if (skill.source === "db") {
    return {
      content: skill.dbSkill.promptTemplate,
      contentWithLineNumbers: withLineNumbers(skill.dbSkill.promptTemplate),
    };
  }

  return {
    content: skill.content,
    contentWithLineNumbers: withLineNumbers(skill.content),
  };
}

export function createGetSkillTool(options: RunSkillToolOptions) {
  return tool({
    description:
      "Unified getSkill runtime tool. Use action='list' to discover skills, action='inspect' to read full skill content, and action='run' to render runnable instructions.",
    inputSchema: schema,
    execute: async (input: RunSkillInput) => {
      if (!options.characterId) {
        return { success: false, error: "No active character selected for skill execution." };
      }

      const action = normalizeAction(input);

      if (action === "list") {
        const skills = await listRuntimeSkills({
          userId: options.userId,
          characterId: options.characterId,
          source: input.source,
          query: input.query,
          limit: input.limit ?? 100,
        });

        return {
          success: true,
          action,
          count: skills.length,
          skills: skills.map(toSkillListItem),
          message:
            "Use getSkill action='inspect' with skillId to view full skill content, or action='run' to render runnable instructions.",
        };
      }

      const resolution = await resolveRuntimeSkill({
        userId: options.userId,
        characterId: options.characterId,
        skillId: input.skillId,
        skillName: input.skillName,
        source: input.source,
      });

      if (!resolution.skill) {
        return {
          success: false,
          action,
          error: resolution.error || "Skill not found.",
          matches: resolution.matches,
        };
      }

      const runtimeSkill = resolution.skill;

      if (action === "inspect") {
        const inspected = getInspectContent(runtimeSkill);
        return {
          success: true,
          action,
          skill: toSkillListItem(runtimeSkill),
          content: inspected.content,
          ...(input.includeContentWithLineNumbers !== false
            ? { contentWithLineNumbers: inspected.contentWithLineNumbers }
            : {}),
        };
      }

      if (!runtimeSkill.modelInvocationAllowed) {
        return {
          success: false,
          action,
          error:
            "This plugin skill has disable-model-invocation enabled and cannot be executed by the model.",
          skill: toSkillListItem(runtimeSkill),
        };
      }

      const parameters = input.parameters || {};
      const renderResult =
        runtimeSkill.source === "db"
          ? (() => {
              const dbRender = renderSkillPrompt(runtimeSkill.dbSkill, parameters);
              return {
                renderedPrompt: dbRender.prompt,
                missingParameters: dbRender.missingParameters,
                resolvedParameters: dbRender.resolvedParameters,
              };
            })()
          : (() => {
              const pluginRender = renderPluginSkillTemplate(runtimeSkill.content, parameters);
              return {
                ...pluginRender,
                renderedPrompt: injectPluginRoot(
                  pluginRender.renderedPrompt,
                  runtimeSkill.pluginCachePath
                ),
              };
            })();

      if (renderResult.missingParameters.length > 0) {
        return {
          success: false,
          action,
          error: "Missing required parameters",
          missingParameters: renderResult.missingParameters,
          skill: toSkillListItem(runtimeSkill),
        };
      }

      if (runtimeSkill.source === "db") {
        await updateSkillRunStats(runtimeSkill.dbSkill.id, options.userId, true);
      }

      await trackSkillTelemetryEvent({
        userId: options.userId,
        eventType: "skill_manual_run",
        skillId: runtimeSkill.source === "db" ? runtimeSkill.dbSkill.id : undefined,
        characterId: options.characterId,
        metadata: {
          via: "runSkillTool",
          source: runtimeSkill.source,
          canonicalId: runtimeSkill.canonicalId,
        },
      });

      let schedule = null;
      if (input.schedule) {
        try {
          const [created] = await db
            .insert(scheduledTasks)
            .values({
              userId: options.userId,
              characterId: options.characterId,
              skillId: runtimeSkill.source === "db" ? runtimeSkill.dbSkill.id : null,
              name: input.schedule.name,
              scheduleType: input.schedule.scheduleType,
              cronExpression: input.schedule.cronExpression || null,
              intervalMinutes: input.schedule.intervalMinutes || null,
              scheduledAt: input.schedule.scheduledAt || null,
              timezone: input.schedule.timezone || "UTC",
              initialPrompt: renderResult.renderedPrompt,
              promptVariables: renderResult.resolvedParameters,
              enabled: true,
              status: "active",
              resultSessionId: options.sessionId,
              deliveryMethod: input.schedule.deliveryMethod || "session",
              deliveryConfig: input.schedule.deliveryConfig || {},
              createNewSessionPerRun: input.schedule.createNewSessionPerRun ?? false,
            })
            .returning();
          await getScheduler().reloadSchedule(created.id);
          schedule = created;
        } catch (error) {
          return {
            success: true,
            action,
            skill: toSkillListItem(runtimeSkill),
            renderedPrompt: renderResult.renderedPrompt,
            resolvedParameters: renderResult.resolvedParameters,
            toolHints: runtimeSkill.source === "db" ? runtimeSkill.dbSkill.toolHints : [],
            scheduleError: `Failed to create schedule: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }

      return {
        success: true,
        action,
        skill: toSkillListItem(runtimeSkill),
        renderedPrompt: renderResult.renderedPrompt,
        resolvedParameters: renderResult.resolvedParameters,
        toolHints: runtimeSkill.source === "db" ? runtimeSkill.dbSkill.toolHints : [],
        schedule,
      };
    },
  });
}

export const createRunSkillTool = createGetSkillTool;
