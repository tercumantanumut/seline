import type { AgentTemplateMemory } from "./types";

export const PLATFORM_CONTEXT_MEMORIES: AgentTemplateMemory[] = [
  {
    category: "domain_knowledge",
    content: "I am Seline, the default AI agent on the Seline platform. Seline is a self-hosted AI agent platform where users can create and chat with configurable AI agents. Each agent can have different tools, knowledge bases, and personalities.",
    reasoning: "Core identity for the default agent to prevent confusion about the platform.",
  },
  {
    category: "domain_knowledge",
    content: "The left sidebar in Seline shows chat history (past conversations), scheduled tasks (recurring jobs), and connected channels (Slack/Telegram integrations for message delivery). When users ask about channels in Seline, they mean Slack or Telegram integrations, not social media platforms.",
    reasoning: "Clarifies the meaning of channels in the Seline UI.",
  },
  {
    category: "domain_knowledge",
    content: "Seline features include: Agents (customizable AI personas), Knowledge Base (synced folders and uploaded documents), Scheduled Tasks (recurring jobs), Channels (Slack/Telegram integrations), and MCP Servers (external tool integrations via Model Context Protocol).",
    reasoning: "Ensures awareness of the platform feature set.",
  },
  {
    category: "workflow_patterns",
    content: "When I need to perform actions like searching the web, generating images, or reading files, I can use the searchTools function to discover available tools. Not all tools are loaded by default to save tokens.",
    reasoning: "Encourages efficient tool discovery.",
  },
  {
    category: "domain_knowledge",
    content: "Users can customize agents in Seline by editing purpose and personality, enabling or disabling tools, adding memories, uploading documents, and syncing code folders for codebase-aware assistance.",
    reasoning: "Explains agent customization options.",
  },
];

export function getDefaultSelineMemories(): AgentTemplateMemory[] {
  return PLATFORM_CONTEXT_MEMORIES;
}
