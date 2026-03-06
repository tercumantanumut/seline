import type { CatalogSkill } from "./types";

export const SYSTEM_SKILLS: CatalogSkill[] = [
  {
    id: "skill-creator",
    displayName: "Skill Creator",
    shortDescription: "Create or update a skill from task context",
    category: "dev-tools",
    icon: "skill-creator.png",
    defaultPrompt: "Create a new skill based on this conversation and workspace context.",
    installSource: { type: "bundled" },
    tags: ["skill", "creator", "automation", "workflow"],
  },
  {
    id: "notion",
    displayName: "Notion",
    shortDescription: "Notion API for creating and managing pages, databases, and blocks",
    category: "productivity",
    icon: "notion.png",
    defaultPrompt: "Use the Notion API to create or update pages and databases for this task.",
    dependencies: [
      {
        type: "mcp",
        value: "notion",
        description: "Notion MCP server",
        url: "https://mcp.notion.com/mcp",
      },
    ],
    installSource: { type: "bundled" },
    tags: ["notion", "productivity", "knowledge", "docs"],
  },
];
