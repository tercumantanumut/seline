/**
 * Daily Standup Summary Preset
 * 
 * Generates a standup-style summary for team updates.
 */

import type { SchedulePreset } from "./types";

export const dailyStandupPreset: SchedulePreset = {
  id: "daily-standup",
  name: "Daily Standup Summary",
  description: "Generate a standup-format summary with yesterday's work, today's plan, and blockers",
  icon: "Users",
  category: "communication",
  
  defaults: {
    cronExpression: "0 9 * * 1-5",  // 9am weekdays
    timezone: "UTC",
    initialPrompt: `Generate a daily standup summary.

## 📅 {{TODAY}} - {{WEEKDAY}}

### ✅ Yesterday
What was completed or worked on yesterday ({{YESTERDAY}})?

### 🎯 Today
What's planned for today? List top priorities.

### 🚧 Blockers
Any blockers or issues that need help?

### 💡 Notes
Any other relevant updates or announcements.

Keep it brief - this is meant for a quick team sync.`,
    suggestedTools: [],
  },
  
  estimatedDuration: "1-2 minutes",
};

