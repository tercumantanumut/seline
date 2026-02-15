import { tool, jsonSchema } from "ai";
import { db } from "@/lib/db/sqlite-client";
import { scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { getScheduler } from "@/lib/scheduler/scheduler-service";
import { findSkillByNameLike, getSkillById, getSkillByName, updateSkillRunStats } from "@/lib/skills/queries";
import { renderSkillPrompt } from "@/lib/skills/runtime";
import { trackSkillTelemetryEvent } from "@/lib/skills/telemetry";

interface RunSkillInput {
  skillId?: string;
  skillName?: string;
  triggerSource?: "manual" | "auto";
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
    skillId: { type: "string" },
    skillName: { type: "string" },
    parameters: { type: "object", additionalProperties: true },
    triggerSource: { type: "string", enum: ["manual", "auto"] },
    schedule: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
});

export function createRunSkillTool(options: RunSkillToolOptions) {
  return tool({
    description: "Run a saved skill by id/name and optionally create a linked schedule.",
    inputSchema: schema,
    execute: async (input: RunSkillInput) => {
      if (!options.characterId) {
        return { success: false, error: "No active character selected for skill execution." };
      }

      let skill = input.skillId ? await getSkillById(input.skillId, options.userId) : null;
      if (!skill && input.skillName) {
        skill = await getSkillByName(options.userId, options.characterId, input.skillName);
        if (!skill) {
          const fuzzy = await findSkillByNameLike(options.userId, options.characterId, input.skillName);
          if (fuzzy.length > 1) {
            return {
              success: false,
              error: "Multiple skills matched that name. Please use skillId or exact skill name.",
              matches: fuzzy.map((candidate) => ({ id: candidate.id, name: candidate.name })),
            };
          }
          if (fuzzy.length === 1) skill = fuzzy[0];
        }
      }
      if (!skill) return { success: false, error: "Skill not found." };
      if (skill.characterId !== options.characterId) {
        return { success: false, error: "Skill does not belong to the active agent." };
      }

      const rendered = renderSkillPrompt(skill, input.parameters || {});
      if (rendered.missingParameters.length > 0) {
        return { success: false, error: "Missing required parameters", missingParameters: rendered.missingParameters };
      }

      const chatRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `zlutty-session=${options.userId}`,
        },
        body: JSON.stringify({
          sessionId: options.sessionId,
          characterId: options.characterId,
          messages: [{ role: "user", content: rendered.prompt }],
        }),
      });

      await updateSkillRunStats(skill.id, options.userId, chatRes.ok);
      await trackSkillTelemetryEvent({
        userId: options.userId,
        eventType: input.triggerSource === "auto" ? "skill_auto_triggered" : "skill_manual_run",
        skillId: skill.id,
        characterId: options.characterId,
        metadata: { succeeded: chatRes.ok, via: "runSkillTool" },
      });

      let schedule = null;
      if (input.schedule) {
        const [created] = await db.insert(scheduledTasks).values({
          userId: options.userId,
          characterId: options.characterId,
          skillId: skill.id,
          name: input.schedule.name,
          scheduleType: input.schedule.scheduleType,
          cronExpression: input.schedule.cronExpression || null,
          intervalMinutes: input.schedule.intervalMinutes || null,
          scheduledAt: input.schedule.scheduledAt || null,
          timezone: input.schedule.timezone || "UTC",
          initialPrompt: rendered.prompt,
          promptVariables: rendered.resolvedParameters,
          enabled: true,
          status: "active",
          resultSessionId: options.sessionId,
          deliveryMethod: input.schedule.deliveryMethod || "session",
          deliveryConfig: input.schedule.deliveryConfig || {},
          createNewSessionPerRun: input.schedule.createNewSessionPerRun ?? false,
        }).returning();
        await getScheduler().reloadSchedule(created.id);
        schedule = created;
      }

      return {
        success: chatRes.ok,
        skillId: skill.id,
        skillName: skill.name,
        renderedPrompt: rendered.prompt,
        resolvedParameters: rendered.resolvedParameters,
        schedule,
      };
    },
  });
}
