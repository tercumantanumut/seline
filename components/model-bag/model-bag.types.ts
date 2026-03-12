/**
 * Model Bag Type System
 *
 * Shared types for the "Bag of Models" inventory UI and
 * scoped model configuration across global settings,
 * agent defaults, and per-session overrides.
 */

// Re-export the provider type so consumers don't need a second import
export type LLMProvider =
  | "anthropic"
  | "openrouter"
  | "antigravity"
  | "codex"
  | "kimi"
  | "minimax"
  | "ollama"
  | "claudecode";

/** The 4 model roles that map to settings-manager.ts fields */
export type ModelRole = "chat" | "research" | "vision" | "utility";
export type ModelConfigSource = "session" | "agent" | "global" | "provider-default";

export interface ModelConfig {
  provider?: LLMProvider;
  chatModel?: string;
  researchModel?: string;
  visionModel?: string;
  utilityModel?: string;
}

export interface AgentModelConfig extends ModelConfig {}

/** Maps ModelRole -> AppSettings/AgentModelConfig field name */
export const ROLE_TO_SETTINGS_KEY: Record<ModelRole, keyof ModelConfig> = {
  chat: "chatModel",
  research: "researchModel",
  vision: "visionModel",
  utility: "utilityModel",
};

/** Enriched model metadata for the bag UI */
export interface ModelItem {
  id: string;
  name: string;
  provider: LLMProvider;
  providerDisplayName: string;
  tier: "flagship" | "standard" | "utility" | "legacy";
  capabilities: ModelCapabilities;
  assignedRoles: ModelRole[];
  isAvailable: boolean;
  isDefault: boolean;
}

export interface ModelCapabilities {
  vision: boolean;
  thinking: boolean;
  toolUse: boolean;
  streaming: boolean;
  contextWindow?: string;
  speed?: "fast" | "standard" | "slow";
}

/** Provider status for the filter bar */
export interface ProviderStatus {
  id: LLMProvider;
  displayName: string;
  isActive: boolean;
  isAuthenticated: boolean;
  authType: "api-key" | "oauth" | "local";
  modelCount: number;
  accentColor: string;
  iconEmoji: string;
}

/** State shape for the bag hook */
export interface ModelBagState {
  models: ModelItem[];
  providers: ProviderStatus[];
  activeProvider: LLMProvider;
  roleAssignments: Record<ModelRole, string>;
  filterProvider: LLMProvider | "all";
  searchQuery: string;
  hoveredModel: string | null;
  isLoading: boolean;
  isSaving: boolean;
}

/**
 * Per-session model override stored in session.metadata.
 * All fields are optional - absent means "use agent/global fallback".
 */
export interface SessionModelConfig {
  sessionProvider?: LLMProvider;
  sessionChatModel?: string;
  sessionResearchModel?: string;
  sessionVisionModel?: string;
  sessionUtilityModel?: string;
}

export interface ResolvedModelConfig {
  provider: LLMProvider;
  chatModel: string;
  researchModel: string;
  visionModel: string;
  utilityModel: string;
}

export interface ResolvedModelSources {
  provider: ModelConfigSource;
  chatModel: ModelConfigSource;
  researchModel: ModelConfigSource;
  visionModel: ModelConfigSource;
  utilityModel: ModelConfigSource;
}
