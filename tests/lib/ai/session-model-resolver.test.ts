import { beforeEach, describe, expect, it, vi } from "vitest";

function isCompatible(model: string, provider: string): boolean {
  if (!model) return false;

  switch (provider) {
    case "anthropic":
    case "claudecode":
      return model.startsWith("claude");
    case "codex":
      return model.startsWith("gpt");
    case "kimi":
      return model.startsWith("kimi");
    case "openrouter":
      return model.includes("/");
    case "ollama":
      return true;
    default:
      return false;
  }
}

const providerMocks = vi.hoisted(() => ({
  DEFAULT_MODELS: {
    anthropic: "claude-default",
    openrouter: "openrouter/auto",
    antigravity: "claude-default",
    codex: "gpt-default",
    claudecode: "claude-default",
    kimi: "kimi-default",
    minimax: "minimax-default",
    ollama: "llama3.1:8b",
  },
  UTILITY_MODELS: {
    anthropic: "claude-utility-default",
    openrouter: "openrouter/utility",
    antigravity: "claude-utility-default",
    codex: "gpt-utility-default",
    claudecode: "claude-utility-default",
    kimi: "kimi-utility-default",
    minimax: "minimax-utility-default",
    ollama: "llama3.1:8b",
  },
  getLanguageModelForProvider: vi.fn((provider: string, model: string) => ({ provider, model })),
  getProviderDisplayName: vi.fn(() => "Anthropic (global)"),
  isProviderOperational: vi.fn((provider: string) => provider !== "antigravity"),
  resolveProviderWithFallback: vi.fn((preferredProvider?: string | null, fallbackProvider = "anthropic") => preferredProvider || fallbackProvider),
  resolveModelForProvider: vi.fn((model: string | null | undefined, provider: string, fallback: string) => {
    if (!model) return null;
    return isCompatible(model, provider) ? model : fallback;
  }),
}));

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(() => ({
    llmProvider: "anthropic",
    chatModel: "claude-global-chat",
    researchModel: "claude-global-research",
    visionModel: "claude-global-vision",
    utilityModel: "claude-global-utility",
  })),
}));

vi.mock("@/lib/ai/providers", () => providerMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);

import {
  buildSessionModelMetadata,
  clearSessionModelMetadata,
  extractSessionModelConfig,
  getSessionProviderTemperature,
  resolveSessionModelScope,
  resolveSessionResearchModel,
  resolveSessionUtilityModel,
} from "@/lib/ai/session-model-resolver";

describe("session-model-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMocks.loadSettings.mockReturnValue({
      llmProvider: "anthropic",
      chatModel: "claude-global-chat",
      researchModel: "claude-global-research",
      visionModel: "claude-global-vision",
      utilityModel: "claude-global-utility",
    });
    providerMocks.isProviderOperational.mockImplementation((provider: string) => provider !== "antigravity");
  });

  it("prefers session overrides over agent and global defaults", () => {
    const scope = resolveSessionModelScope(
      {
        sessionProvider: "codex",
        sessionChatModel: "gpt-session-chat",
        sessionResearchModel: "gpt-session-research",
        sessionUtilityModel: "gpt-session-utility",
      },
      {
        agentModelConfig: {
          provider: "kimi",
          chatModel: "kimi-agent-chat",
          researchModel: "kimi-agent-research",
          utilityModel: "kimi-agent-utility",
        },
      },
    );

    expect(scope.effectiveConfig).toEqual({
      provider: "codex",
      chatModel: "gpt-session-chat",
      researchModel: "gpt-session-research",
      visionModel: "gpt-session-chat",
      utilityModel: "gpt-session-utility",
    });
    expect(scope.sources).toEqual({
      provider: "session",
      chatModel: "session",
      researchModel: "session",
      visionModel: "session",
      utilityModel: "session",
    });
  });

  it("falls back from session to agent to global for missing values", () => {
    const scope = resolveSessionModelScope(
      {},
      {
        agentModelConfig: {
          provider: "codex",
          chatModel: "gpt-agent-chat",
          researchModel: "gpt-agent-research",
        },
      },
    );

    expect(scope.effectiveConfig).toEqual({
      provider: "codex",
      chatModel: "gpt-agent-chat",
      researchModel: "gpt-agent-research",
      visionModel: "gpt-agent-chat",
      utilityModel: "gpt-utility-default",
    });
    expect(scope.sources).toEqual({
      provider: "agent",
      chatModel: "agent",
      researchModel: "agent",
      visionModel: "agent",
      utilityModel: "provider-default",
    });
  });

  it("falls back to the next operational provider when a preferred provider is unavailable", () => {
    const scope = resolveSessionModelScope(
      { sessionProvider: "antigravity" },
      {
        agentModelConfig: { provider: "codex", chatModel: "gpt-agent-chat" },
      },
    );

    expect(scope.effectiveConfig.provider).toBe("codex");
    expect(scope.sources.provider).toBe("agent");
  });

  it("drops incompatible session models to provider defaults instead of breaking", () => {
    const scope = resolveSessionModelScope({
      sessionProvider: "codex",
      sessionChatModel: "claude-bad-chat",
      sessionResearchModel: "claude-bad-research",
      sessionUtilityModel: "claude-bad-utility",
    });

    expect(scope.effectiveConfig).toEqual({
      provider: "codex",
      chatModel: "gpt-default",
      researchModel: "gpt-default",
      visionModel: "gpt-default",
      utilityModel: "gpt-utility-default",
    });
    expect(scope.sources).toEqual({
      provider: "session",
      chatModel: "provider-default",
      researchModel: "provider-default",
      visionModel: "provider-default",
      utilityModel: "provider-default",
    });
  });

  it("resolves research and utility language models from the effective provider/model pair", () => {
    const researchModel = resolveSessionResearchModel(
      { sessionProvider: "codex", sessionResearchModel: "gpt-session-research" },
      { agentModelConfig: { provider: "anthropic" } },
    );
    const utilityModel = resolveSessionUtilityModel(
      { sessionProvider: "codex", sessionUtilityModel: "gpt-session-utility" },
      { agentModelConfig: { provider: "anthropic" } },
    );

    expect(researchModel).toEqual({ provider: "codex", model: "gpt-session-research" });
    expect(utilityModel).toEqual({ provider: "codex", model: "gpt-session-utility" });
    expect(providerMocks.getLanguageModelForProvider).toHaveBeenCalledWith("codex", "gpt-session-research");
    expect(providerMocks.getLanguageModelForProvider).toHaveBeenCalledWith("codex", "gpt-session-utility");
  });

  it("uses kimi fixed temperature based on the resolved provider", () => {
    const temperature = getSessionProviderTemperature(
      {},
      0.3,
      { agentModelConfig: { provider: "kimi", chatModel: "kimi-agent-chat" } },
    );

    expect(temperature).toBe(1);
  });

  it("uses requested temperature when the resolved provider is not kimi", () => {
    const temperature = getSessionProviderTemperature(
      { sessionProvider: "codex", sessionUtilityModel: "gpt-5.1-codex" },
      0.3,
    );

    expect(temperature).toBe(0.3);
  });

  it("extracts all session model overrides including utility", () => {
    const config = extractSessionModelConfig({
      sessionProvider: "codex",
      sessionChatModel: "gpt-5.1-codex",
      sessionResearchModel: "gpt-5.1-codex-mini",
      sessionVisionModel: "gpt-5.1-codex-vision",
      sessionUtilityModel: "gpt-5.3-codex-medium",
    });

    expect(config).toEqual({
      sessionProvider: "codex",
      sessionChatModel: "gpt-5.1-codex",
      sessionResearchModel: "gpt-5.1-codex-mini",
      sessionVisionModel: "gpt-5.1-codex-vision",
      sessionUtilityModel: "gpt-5.3-codex-medium",
    });
  });

  it("builds and clears utility metadata keys compatibly", () => {
    const metadata = buildSessionModelMetadata({
      sessionProvider: "codex",
      sessionUtilityModel: "gpt-5.3-codex-medium",
    });

    expect(metadata).toEqual({
      sessionProvider: "codex",
      sessionUtilityModel: "gpt-5.3-codex-medium",
    });

    const cleared = clearSessionModelMetadata({
      ...metadata,
      keep: "value",
    });

    expect(cleared).toEqual({ keep: "value" });
  });
});
