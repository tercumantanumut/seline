/**
 * Daily Linear Summary Preset
 * 
 * Summarizes Linear tickets and status each morning.
 */

import type { SchedulePreset } from "./types";

export const linearSummaryPreset: SchedulePreset = {
  id: "linear-daily-summary",
  name: "Daily Linear Summary",
  description: "Get a morning summary of your Linear tickets, grouped by status with blockers highlighted",
  icon: "ListChecks",
  category: "productivity",
  
  defaults: {
    cronExpression: "0 9 * * 1-5",  // 9am weekdays
    timezone: "UTC",
    initialPrompt: `Analyze Linear tickets updated since {{YESTERDAY}}.

Group by status and highlight:
- 🔴 Blocked items needing attention
- 🟡 In Progress with assignees  
- 🟢 Completed yesterday

Include any tickets that seem stalled (no updates in 3+ days).

Format as a concise morning briefing.`,
    suggestedTools: ["linear"],
  },
  
  requiredIntegrations: ["linear"],
  estimatedDuration: "2-3 minutes",
};

