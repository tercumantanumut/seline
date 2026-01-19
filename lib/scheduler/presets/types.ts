/**
 * Schedule Preset Types
 * 
 * Presets are static template definitions that pre-fill the schedule form
 * with common configurations for productivity and development workflows.
 */

export interface SchedulePreset {
  id: string;
  name: string;
  description: string;
  icon: string;  // Lucide icon name
  category: "productivity" | "development" | "communication" | "analytics";
  
  // Pre-filled form values
  defaults: {
    cronExpression: string;
    timezone?: string;
    initialPrompt: string;
    promptVariables?: Record<string, string>;
    suggestedTools?: string[];
  };
  
  // UI hints
  requiredIntegrations?: string[];  // Show warning if not configured
  estimatedDuration?: string;       // "2-5 minutes"
}

export type PresetCategory = SchedulePreset["category"];

