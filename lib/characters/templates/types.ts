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

export interface AgentTemplate {
  id: string;
  name: string;
  tagline: string;
  purpose: string;
  isDefault?: boolean;
  isDeletable?: boolean;
  enabledTools: string[];
  syncFolders?: AgentTemplateSyncFolder[];
  memories: AgentTemplateMemory[];
}
