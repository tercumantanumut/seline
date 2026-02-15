import { z } from "zod";

export const skillStatusSchema = z.enum(["draft", "active", "archived"]);
export const skillSourceTypeSchema = z.enum(["conversation", "manual", "template"]);

export const skillInputParameterSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["string", "number", "boolean"]).optional().default("string"),
  description: z.string().max(400).optional(),
  required: z.boolean().optional().default(false),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

export const createSkillSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  icon: z.string().max(20).optional(),
  promptTemplate: z.string().min(1).max(8000),
  inputParameters: z.array(skillInputParameterSchema).optional().default([]),
  toolHints: z.array(z.string().min(1).max(60)).optional().default([]),
  sourceType: skillSourceTypeSchema.optional().default("manual"),
  sourceSessionId: z.string().optional(),
  status: skillStatusSchema.optional().default("active"),
});

export const updateSkillSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  icon: z.string().max(20).nullable().optional(),
  promptTemplate: z.string().min(1).max(8000).optional(),
  inputParameters: z.array(skillInputParameterSchema).optional(),
  toolHints: z.array(z.string().min(1).max(60)).optional(),
  status: skillStatusSchema.optional(),
});

export const listSkillsQuerySchema = z.object({
  characterId: z.string().optional(),
  status: skillStatusSchema.optional(),
});

export const runSkillSchema = z.object({
  parameters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default({}),
  schedule: z
    .object({
      name: z.string().min(1).max(120),
      scheduleType: z.enum(["cron", "interval", "once"]),
      cronExpression: z.string().optional(),
      intervalMinutes: z.number().int().positive().optional(),
      scheduledAt: z.string().optional(),
      timezone: z.string().optional(),
      deliveryChannel: z.enum(["app", "telegram", "slack", "whatsapp", "auto"]).optional(),
    })
    .optional(),
});

export const scheduleSkillSchema = z.object({
  name: z.string().min(1).max(120),
  scheduleType: z.enum(["cron", "interval", "once"]),
  cronExpression: z.string().optional(),
  intervalMinutes: z.number().int().positive().optional(),
  scheduledAt: z.string().optional(),
  timezone: z.string().optional(),
  deliveryMethod: z.enum(["session", "channel", "email", "slack", "webhook"]).optional(),
  deliveryConfig: z.record(z.unknown()).optional(),
  createNewSessionPerRun: z.boolean().optional(),
  promptVariables: z.record(z.string()).optional(),
});
