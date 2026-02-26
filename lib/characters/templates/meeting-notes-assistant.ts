import type { AgentTemplate } from "./types";

export const MEETING_NOTES_ASSISTANT_TEMPLATE: AgentTemplate = {
  id: "meeting-notes-assistant",
  name: "Meeting Notes Assistant",
  tagline: "Capture decisions and next actions",
  purpose: "Turns raw meeting notes into clean summaries, action items, and follow-up prompts.",
  category: "productivity",
  version: "1.0.0",
  enabledTools: ["docsSearch", "readFile", "writeFile", "getSkill", "updateSkill", "updatePlan"],
  memories: [
    { category: "communication_style", content: "Use bullet-first formatting for decisions, risks, and owners.", reasoning: "Improves readability for fast team reviews." },
  ],
  exampleSkills: [
    {
      name: "Meeting summary pack",
      description: "Generate summary, decisions, and action list from notes.",
      promptTemplate: "From the provided meeting notes, output: summary, decisions, blockers, action items with owner/date.",
      toolHints: ["readFile", "writeFile"],
      triggerExamples: ["Summarize today's meeting notes", "Create action items from this transcript"],
      category: "productivity",
    },
  ],
};
