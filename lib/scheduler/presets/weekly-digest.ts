/**
 * Weekly Progress Digest Preset
 * 
 * Generates a weekly summary of progress and achievements.
 */

import type { SchedulePreset } from "./types";

export const weeklyDigestPreset: SchedulePreset = {
  id: "weekly-progress-digest",
  name: "Weekly Progress Digest",
  description: "Generate a comprehensive weekly summary of completed work, ongoing projects, and upcoming priorities",
  icon: "Calendar",
  category: "analytics",
  
  defaults: {
    cronExpression: "0 17 * * 5",  // Friday at 5pm
    timezone: "UTC",
    initialPrompt: `Generate a weekly progress digest covering {{LAST_7_DAYS}}.

## Summary Structure

### 🎯 Key Accomplishments
List the most important things completed this week.

### 📊 Metrics & Progress
- Tasks completed vs created
- Any notable trends

### 🚧 Ongoing Work
What's currently in progress and expected completion.

### 📋 Next Week Priorities
Top 3-5 priorities for the upcoming week.

### ⚠️ Blockers & Concerns
Any issues that need attention.

Keep the summary concise and actionable.`,
    suggestedTools: ["linear", "github"],
  },
  
  estimatedDuration: "3-5 minutes",
};

