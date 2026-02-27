import type { AgentTemplate } from "./types";

export const PROJECT_MANAGER_TEMPLATE: AgentTemplate = {
  id: "project-manager",
  name: "Project Manager",
  tagline: "Keep plans on track",
  purpose: "Transforms project context into milestones, risks, and execution plans with owners.",
  category: "productivity",
  version: "1.0.0",
  enabledTools: ["updatePlan", "scheduleTask", "docsSearch", "runSkill", "updateSkill"],
  memories: [
    { category: "workflow_patterns", content: "Always call out blockers, dependencies, and owner accountability.", reasoning: "Improves execution discipline." },
  ],
  exampleSkills: [
    {
      name: "Milestone health check",
      description: "Evaluate milestones and identify schedule risks.",
      promptTemplate: "Review current milestones and report on status, blockers, risk level, and next owner actions.",
      toolHints: ["updatePlan", "docsSearch"],
      triggerExamples: ["How is the project tracking this week?", "Run a milestone health check"],
      category: "productivity",
    },
  ],
};
