import type { MemoryCategory } from "@/lib/agent-memory/types";

export interface AgentTemplateMemory {
  category: MemoryCategory;
  content: string;
  reasoning: string;
}

export interface AgentTemplateSyncFolder {
  pathVariable: string;
  displayName: string;
  includeExtensions: string[];
  excludePatterns: string[];
  isPrimary: boolean;
}

export interface AgentTemplateSkill {
  name: string;
  description: string;
  promptTemplate: string;
  inputParameters?: Array<{ name: string; type: "string" | "number" | "boolean"; default?: string }>;
  toolHints?: string[];
  triggerExamples?: string[];
  category?: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  tagline: string;
  purpose: string;
  category?: string;
  version?: string;
  isDefault?: boolean;
  isDeletable?: boolean;
  enabledTools: string[];
  syncFolders?: AgentTemplateSyncFolder[];
  memories: AgentTemplateMemory[];
  exampleSkills?: AgentTemplateSkill[];
}
