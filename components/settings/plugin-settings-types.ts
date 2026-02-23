export interface InstalledPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  scope: string;
  status: "active" | "disabled" | "error";
  marketplaceName?: string;
  installedAt: string;
  updatedAt: string;
  lastError?: string;
  manifest: {
    author?: { name: string; email?: string };
    homepage?: string;
    repository?: string;
    license?: string;
    keywords?: string[];
    category?: string;
  };
  components: {
    skills: Array<{ name: string; namespacedName?: string; description: string }>;
    agents: Array<{ name: string; description: string }>;
    hooks: { hooks: Record<string, unknown[]> } | null;
    mcpServers: Record<string, unknown> | null;
    lspServers: Record<string, unknown> | null;
  };
}

export interface CharacterOption {
  id: string;
  name: string;
  displayName?: string | null;
  status: string;
}
