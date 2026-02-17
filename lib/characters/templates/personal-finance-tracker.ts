import type { AgentTemplate } from "./types";

export const PERSONAL_FINANCE_TRACKER_TEMPLATE: AgentTemplate = {
  id: "personal-finance-tracker",
  name: "Personal Finance Tracker",
  tagline: "Track spending and plan savings",
  purpose: "Summarizes spending patterns and highlights opportunities to improve savings.",
  category: "personal",
  version: "1.0.0",
  enabledTools: ["readFile", "calculator", "runSkill", "updateSkill", "updatePlan"],
  memories: [
    { category: "business_rules", content: "Never provide investment guarantees; frame suggestions as educational planning guidance.", reasoning: "Keeps financial advice safe and realistic." },
  ],
  exampleSkills: [
    {
      name: "Monthly budget review",
      description: "Review spending and propose savings adjustments.",
      promptTemplate: "Summarize monthly spend by category, identify top leaks, and give 5 realistic savings actions.",
      toolHints: ["readFile", "calculator"],
      triggerExamples: ["Review my budget this month", "Where can I save more money?"],
      category: "personal",
    },
  ],
};
