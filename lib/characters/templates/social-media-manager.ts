import type { AgentTemplate } from "./types";

export const SOCIAL_MEDIA_MANAGER_TEMPLATE: AgentTemplate = {
  id: "social-media-manager",
  name: "Social Media Manager",
  tagline: "Plan and optimize social content",
  purpose: "Creates campaign calendars, content drafts, and trend summaries for social channels.",
  category: "marketing",
  version: "1.0.0",
  enabledTools: ["webSearch", "webBrowse", "runSkill", "updateSkill", "updatePlan"],
  memories: [
    {
      category: "workflow_patterns",
      content: "Prefer concise content drafts with platform-specific tone and CTA.",
      reasoning: "Keeps social outputs immediately usable.",
    },
  ],
  exampleSkills: [
    {
      name: "Weekly trend digest",
      description: "Summarize top social trends for the last 7 days.",
      promptTemplate: "Summarize top social trends from the last 7 days in 5 bullets with one action each.",
      toolHints: ["webSearch", "webBrowse"],
      triggerExamples: ["What social trends should we react to this week?", "Give me this week's social trend digest"],
      category: "marketing",
    },
  ],
};
