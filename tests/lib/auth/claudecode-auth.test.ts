import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMocks = vi.hoisted(() => {
  const state = { settings: {} as Record<string, any> };
  return {
    state,
    loadSettings: vi.fn(() => state.settings),
    saveSettings: vi.fn((settings: Record<string, any>) => {
      state.settings = settings;
    }),
  };
});

const sdkMocks = vi.hoisted(() => {
  return {
    readClaudeAgentSdkAuthStatus: vi.fn(),
    attemptClaudeAgentSdkLogout: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: settingsMocks.loadSettings,
  saveSettings: settingsMocks.saveSettings,
}));

vi.mock("@/lib/auth/claude-agent-sdk-auth", () => ({
  readClaudeAgentSdkAuthStatus: sdkMocks.readClaudeAgentSdkAuthStatus,
  attemptClaudeAgentSdkLogout: sdkMocks.attemptClaudeAgentSdkLogout,
}));

import {
  clearClaudeCodeAuth,
  getClaudeCodeAuthState,
  getClaudeCodeAuthStatus,
  invalidateClaudeCodeAuthCache,
  isClaudeCodeAuthenticated,
} from "@/lib/auth/claudecode-auth";

describe("claudecode-auth Agent SDK integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMocks.state.settings = {};
    invalidateClaudeCodeAuthCache();
  });

  it("persists SDK auth status and clears legacy token fields", async () => {
    settingsMocks.state.settings = {
      llmProvider: "anthropic",
      claudecodeToken: {
        type: "oauth",
        access_token: "legacy",
        refresh_token: "legacy-refresh",
        expires_at: Date.now() + 1000,
      },
      pendingClaudeCodeOAuth: {
        state: "x",
        verifier: "y",
        origin: "z",
        createdAt: Date.now(),
      },
    };

    sdkMocks.readClaudeAgentSdkAuthStatus.mockResolvedValue({
      authenticated: true,
      isAuthenticating: false,
      output: ["already logged in"],
      email: "user@example.com",
      tokenSource: "oauth_personal",
      apiKeySource: undefined,
      authUrl: undefined,
      error: undefined,
    });

    const status = await getClaudeCodeAuthStatus();

    expect(status.authenticated).toBe(true);
    expect(settingsMocks.state.settings.claudecodeAuth?.isAuthenticated).toBe(true);
    expect(settingsMocks.state.settings.claudecodeAuth?.email).toBe("user@example.com");
    expect(settingsMocks.state.settings.claudecodeToken).toBeUndefined();
    expect(settingsMocks.state.settings.pendingClaudeCodeOAuth).toBeUndefined();
  });

  it("isClaudeCodeAuthenticated reflects SDK status", async () => {
    sdkMocks.readClaudeAgentSdkAuthStatus.mockResolvedValue({
      authenticated: false,
      isAuthenticating: false,
      output: ["login required"],
      email: undefined,
      tokenSource: undefined,
      apiKeySource: undefined,
      authUrl: "https://example.com/auth",
      error: "authentication_failed",
    });

    const authenticated = await isClaudeCodeAuthenticated();

    expect(authenticated).toBe(false);
    const state = getClaudeCodeAuthState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.authUrl).toBe("https://example.com/auth");
  });

  it("clearClaudeCodeAuth resets local state and triggers best-effort SDK logout", () => {
    settingsMocks.state.settings = {
      claudecodeAuth: {
        isAuthenticated: true,
        email: "user@example.com",
      },
      claudecodeToken: {
        type: "oauth",
        access_token: "legacy",
        refresh_token: "legacy-refresh",
        expires_at: Date.now() + 1000,
      },
      pendingClaudeCodeOAuth: {
        state: "x",
        verifier: "y",
        origin: "z",
        createdAt: Date.now(),
      },
    };

    clearClaudeCodeAuth();

    expect(settingsMocks.state.settings.claudecodeAuth?.isAuthenticated).toBe(false);
    expect(settingsMocks.state.settings.claudecodeToken).toBeUndefined();
    expect(settingsMocks.state.settings.pendingClaudeCodeOAuth).toBeUndefined();
    expect(sdkMocks.attemptClaudeAgentSdkLogout).toHaveBeenCalledTimes(1);
  });
});
