/**
 * Context Source Types
 *
 * Context sources fetch external data and inject it into prompts
 * before task execution.
 */

export interface ContextFetcher<TConfig = Record<string, unknown>> {
  type: string;
  fetch(config: TConfig, userId: string): Promise<string>;
}

export interface ResolvedContext {
  prepend: string;
  append: string;
  variables: Record<string, string>;
}

// Linear-specific config
export interface LinearContextConfig {
  teamId?: string;
  projectIds?: string[];
  statuses?: string[];
  updatedSince?: "{{YESTERDAY}}" | "{{LAST_7_DAYS}}" | string;
  limit?: number;
}

// GitHub-specific config
export interface GitHubContextConfig {
  owner: string;
  repo: string;
  type: "issues" | "prs" | "commits";
  state?: "open" | "closed" | "all";
  since?: string;
  limit?: number;
}

// Custom API config
export interface APIContextConfig {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  jsonPath?: string;  // Path to extract data from response
}

// Database query config
export interface DatabaseContextConfig {
  query: string;
  params?: Record<string, unknown>;
}

