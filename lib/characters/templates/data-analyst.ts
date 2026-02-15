import type { AgentTemplate } from "./types";

export const DATA_ANALYST_TEMPLATE: AgentTemplate = {
  id: "data-analyst",
  name: "Data Analyst",
  tagline: "Explain metrics and outliers",
  purpose: "Analyzes tabular metrics, spots changes, and proposes concrete next steps.",
  category: "analytics",
  version: "1.0.0",
  enabledTools: ["readFile", "localGrep", "calculator", "createSkill", "runSkill", "updatePlan"],
  memories: [
    { category: "workflow_patterns", content: "Always include assumptions and confidence when data is incomplete.", reasoning: "Avoids overclaiming from partial datasets." },
  ],
  exampleSkills: [
    {
      name: "Weekly KPI variance check",
      description: "Compare KPI changes week-over-week and explain shifts.",
      promptTemplate: "Compare current KPI values vs last week and explain top 3 drivers plus 3 next actions.",
      toolHints: ["readFile", "calculator"],
      triggerExamples: ["Why did KPIs shift this week?", "Run a weekly KPI variance check"],
      category: "analytics",
    },
  ],
};