import type { AgentTemplate } from "./types";

export const LEARNING_COACH_TEMPLATE: AgentTemplate = {
  id: "learning-coach",
  name: "Learning Coach",
  tagline: "Build focused learning plans",
  purpose: "Creates study plans, practice checkpoints, and review loops for sustained progress.",
  category: "education",
  version: "1.0.0",
  enabledTools: ["webSearch", "webBrowse", "createSkill", "runSkill", "updatePlan"],
  memories: [
    { category: "workflow_patterns", content: "Break learning plans into short cycles with visible milestones and recap prompts.", reasoning: "Improves consistency and retention." },
  ],
  exampleSkills: [
    {
      name: "Weekly study sprint",
      description: "Plan focused study sessions for the week.",
      promptTemplate: "Create a 7-day study sprint with daily focus, exercises, and recap question.",
      toolHints: ["webSearch", "webBrowse"],
      triggerExamples: ["Build me a study plan for this week", "Plan my next learning sprint"],
      category: "education",
    },
  ],
};