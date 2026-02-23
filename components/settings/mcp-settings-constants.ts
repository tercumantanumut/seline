import type { MCPServerConfig } from "@/lib/mcp/types";

export interface MCPTemplate {
  id: string;
  name: string;
  description: string;
  config: MCPServerConfig;
  requiredEnv: string[];
  setupInstructions?: string;
  authType?: string;
  difficulty?: "Easy" | "Medium" | "Advanced";
}

export const PREBUILT_TEMPLATES: MCPTemplate[] = [
  {
    id: "filesystem",
    name: "Files (single folder)",
    description: "Read and write files in one synced folder",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "${SYNCED_FOLDER}"],
    },
    requiredEnv: [],
  },
  {
    id: "filesystem-multi",
    name: "Files (all folders)",
    description: "Access every synced folder",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "${SYNCED_FOLDERS_ARRAY}"],
    },
    requiredEnv: [],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories and search code",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    },
    requiredEnv: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
  },
  {
    id: "chrome-devtools",
    name: "Chrome DevTools",
    description: "Inspect and debug pages in Chrome",
    config: {
      command: "npx",
      args: ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics", "--isolated=true"],
    },
    requiredEnv: [],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Connect to a PostgreSQL database",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:password@localhost/db"],
    },
    requiredEnv: [],
  },
  {
    id: "composio",
    name: "Composio",
    description: "Connect many apps through Composio",
    config: {
      type: "sse",
      url: "https://backend.composio.dev/v3/mcp/${COMPOSIO_CONNECTION_ID}/mcp",
      headers: {
        "X-API-Key": "${COMPOSIO_API_KEY}",
      },
    },
    requiredEnv: ["COMPOSIO_API_KEY", "COMPOSIO_CONNECTION_ID"],
    setupInstructions:
      "Get Connection ID from Composio. For Tool Router, replace URL with: https://backend.composio.dev/tool_router/{router_id}/mcp",
    authType: "Header + URL",
    difficulty: "Medium",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Track issues and manage projects",
    config: {
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.linear.app/mcp"],
    },
    requiredEnv: [],
    difficulty: "Easy",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Manage Supabase project data and APIs",
    config: {
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}"],
      env: {
        SUPABASE_PROJECT_REF: "",
        SUPABASE_ACCESS_TOKEN: "",
        MCP_REMOTE_HEADERS: '{"Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}"}',
      },
    },
    requiredEnv: ["SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"],
    difficulty: "Medium",
  },
  {
    id: "assistant-ui",
    name: "Assistant UI Docs",
    description: "Search Assistant UI documentation",
    config: {
      command: "npx",
      args: ["-y", "@assistant-ui/mcp-docs-server"],
    },
    requiredEnv: [],
  },
  {
    id: "everything",
    name: "Everything",
    description: "Sample server with many example tools",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
    },
    requiredEnv: [],
  },
];
