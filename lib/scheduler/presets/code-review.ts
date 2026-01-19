/**
 * Code Review Summary Preset
 * 
 * Reviews open PRs and provides a summary.
 */

import type { SchedulePreset } from "./types";

export const codeReviewPreset: SchedulePreset = {
  id: "code-review-summary",
  name: "Daily Code Review Summary",
  description: "Get a daily overview of open pull requests that need attention, with age and reviewer status",
  icon: "GitPullRequest",
  category: "development",
  
  defaults: {
    cronExpression: "0 10 * * 1-5",  // 10am weekdays
    timezone: "UTC",
    initialPrompt: `Review all open pull requests and provide a summary.

## For each PR, include:
- Title and author
- Days open
- Review status (approved, changes requested, pending)
- Number of comments

## Prioritize:
1. 🔥 PRs older than 3 days
2. 🟡 PRs with changes requested
3. 🆕 New PRs (opened today)

## Summary:
- Total open PRs
- Average age
- PRs needing immediate attention

Keep it concise and actionable.`,
    suggestedTools: ["github"],
  },
  
  requiredIntegrations: ["github"],
  estimatedDuration: "2-4 minutes",
};

