import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSettings } from "@/lib/settings/settings-manager";

type TestSettings = AppSettings & {
  antigravityAuth?: { isAuthenticated?: boolean };
  codexAuth?: { isAuthenticated?: boolean };
  claudecodeAuth?: { isAuthenticated?: boolean };
};

const settingsMocks = vi.hoisted(() => {
  const state = {
    settings: {} as TestSettings,
    hasRequiredApiKeys: true,
  };

  return {
    state,
    loadSettings: vi.fn(() => state.settings),
    saveSettings: vi.fn((settings: TestSettings) => {
      state.settings = settings;
    }),
    hasRequiredApiKeys: vi.fn(() => state.hasRequiredApiKeys),
  };
});

const providersMocks = vi.hoisted(() => ({
  invalidateProviderCache: vi.fn(),
}));

const claudecodeAuthMocks = vi.hoisted(() => ({
  getClaudeCodeAuthState: vi.fn(() => ({ isAuthenticated: false })),
  getClaudeCodeAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
}));

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: settingsMocks.loadSettings,
  saveSettings: settingsMocks.saveSettings,
  hasRequiredApiKeys: settingsMocks.hasRequiredApiKeys,
}));

vi.mock("@/lib/ai/providers", () => ({
  invalidateProviderCache: providersMocks.invalidateProviderCache,
}));

vi.mock("@/lib/auth/claudecode-auth", () => ({
  getClaudeCodeAuthState: claudecodeAuthMocks.getClaudeCodeAuthState,
  getClaudeCodeAuthStatus: claudecodeAuthMocks.getClaudeCodeAuthStatus,
}));

import { GET, POST } from "@/app/api/onboarding/route";

function buildSettings(overrides: Partial<TestSettings> = {}): TestSettings {
  return {
    llmProvider: "anthropic",
    onboardingComplete: false,
    onboardingVersion: undefined,
    chatModel: "claude-sonnet-4-5-20250929",
    researchModel: "claude-haiku-4-5-20251001",
    visionModel: "claude-opus-4-20250929",
    utilityModel: "claude-haiku-4-5-20251001",
    webScraperProvider: "local",
    antigravityAuth: { isAuthenticated: false },
    codexAuth: { isAuthenticated: false },
    claudecodeAuth: { isAuthenticated: false },
    ...overrides,
  };
}

describe("/api/onboarding route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMocks.state.settings = buildSettings();
    settingsMocks.state.hasRequiredApiKeys = true;
    claudecodeAuthMocks.getClaudeCodeAuthState.mockReturnValue({ isAuthenticated: false });
    claudecodeAuthMocks.getClaudeCodeAuthStatus.mockResolvedValue({ authenticated: false });
  });

  it("GET reports Claude Code as missing when required auth is not configured", async () => {
    settingsMocks.state.settings = buildSettings({ llmProvider: "claudecode" });
    settingsMocks.state.hasRequiredApiKeys = false;

    const response = await GET();
    const payload = await response.json();

    expect(payload).toMatchObject({
      isComplete: false,
      hasRequiredKeys: false,
      missingProvider: "claudecode",
    });
  });

  it("GET trusts cached Claude Code auth during onboarding", async () => {
    settingsMocks.state.settings = buildSettings({
      llmProvider: "claudecode",
      claudecodeAuth: { isAuthenticated: false },
    });
    settingsMocks.state.hasRequiredApiKeys = false;
    claudecodeAuthMocks.getClaudeCodeAuthState.mockReturnValue({ isAuthenticated: true });

    const response = await GET();
    const payload = await response.json();

    expect(payload).toMatchObject({
      hasRequiredKeys: true,
      missingProvider: null,
    });
    expect(claudecodeAuthMocks.getClaudeCodeAuthStatus).not.toHaveBeenCalled();
  });

  it("GET refreshes Claude Code auth from the SDK before marking it missing", async () => {
    settingsMocks.state.settings = buildSettings({
      llmProvider: "claudecode",
      claudecodeAuth: { isAuthenticated: false },
    });
    settingsMocks.state.hasRequiredApiKeys = false;
    claudecodeAuthMocks.getClaudeCodeAuthStatus.mockResolvedValue({ authenticated: true });

    const response = await GET();
    const payload = await response.json();

    expect(payload).toMatchObject({
      hasRequiredKeys: true,
      missingProvider: null,
    });
    expect(claudecodeAuthMocks.getClaudeCodeAuthStatus).toHaveBeenCalledTimes(1);
  });

  it("GET treats ollama as ready even when key checks fail", async () => {
    settingsMocks.state.settings = buildSettings({ llmProvider: "ollama" });
    settingsMocks.state.hasRequiredApiKeys = false;

    const response = await GET();
    const payload = await response.json();

    expect(payload).toMatchObject({
      hasRequiredKeys: true,
      missingProvider: null,
    });
  });

  it("POST applies onboarding provider selection, clears provider-bound models, and invalidates provider cache", async () => {
    const response = await POST(new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        llmProvider: "codex",
        tavilyApiKey: "  tvly-test-key  ",
        webScraperProvider: "firecrawl",
        firecrawlApiKey: "  fc-test-key  ",
      }),
    }));

    const payload = await response.json();

    expect(payload).toEqual({ success: true });
    expect(settingsMocks.state.settings.llmProvider).toBe("codex");
    expect(settingsMocks.state.settings.chatModel).toBe("");
    expect(settingsMocks.state.settings.researchModel).toBe("");
    expect(settingsMocks.state.settings.visionModel).toBe("");
    expect(settingsMocks.state.settings.utilityModel).toBe("");
    expect(settingsMocks.state.settings.tavilyApiKey).toBe("tvly-test-key");
    expect(settingsMocks.state.settings.webScraperProvider).toBe("firecrawl");
    expect(settingsMocks.state.settings.firecrawlApiKey).toBe("fc-test-key");
    expect(settingsMocks.state.settings.onboardingComplete).toBe(true);
    expect(typeof settingsMocks.state.settings.onboardingCompletedAt).toBe("string");
    expect(settingsMocks.state.settings.onboardingVersion).toBe(1);
    expect(providersMocks.invalidateProviderCache).toHaveBeenCalledTimes(1);
  });

  it("POST does not clear model fields or invalidate cache when provider is unchanged", async () => {
    settingsMocks.state.settings = buildSettings({
      llmProvider: "codex",
      chatModel: "gpt-5.4",
      researchModel: "gpt-5.4",
      visionModel: "gpt-5.4",
      utilityModel: "gpt-5.4-low",
    });

    await POST(new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ llmProvider: "codex" }),
    }));

    expect(settingsMocks.state.settings.llmProvider).toBe("codex");
    expect(settingsMocks.state.settings.chatModel).toBe("gpt-5.4");
    expect(settingsMocks.state.settings.researchModel).toBe("gpt-5.4");
    expect(settingsMocks.state.settings.visionModel).toBe("gpt-5.4");
    expect(settingsMocks.state.settings.utilityModel).toBe("gpt-5.4-low");
    expect(providersMocks.invalidateProviderCache).not.toHaveBeenCalled();
  });

  it("POST ignores invalid llmProvider values", async () => {
    await POST(new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ llmProvider: "not-a-provider" }),
    }));

    expect(settingsMocks.state.settings.llmProvider).toBe("anthropic");
    expect(settingsMocks.state.settings.chatModel).toBe("claude-sonnet-4-5-20250929");
    expect(providersMocks.invalidateProviderCache).not.toHaveBeenCalled();
  });
});
