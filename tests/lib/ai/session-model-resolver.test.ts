import { beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  getModelByName: vi.fn((modelId: string) => ({ id: modelId })),
  getUtilityModel: vi.fn(() => ({ id: "global-utility" })),
  getChatModel: vi.fn(() => ({ id: "global-chat" })),
  getLanguageModel: vi.fn(() => ({ id: "global-language" })),
  getResearchModel: vi.fn(() => ({ id: "global-research" })),
  getVisionModel: vi.fn(() => ({ id: "global-vision" })),
  getConfiguredProvider: vi.fn(() => "anthropic"),
  getConfiguredModel: vi.fn(() => "claude-sonnet-4-5-20250929"),
  getProviderDisplayName: vi.fn(() => "Anthropic (global)"),
  getProviderTemperature: vi.fn((temp: number) => temp),
}));

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(() => ({ chatModel: "global-chat-model" })),
}));

vi.mock("@/lib/ai/providers", () => providerMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);

import {
  buildSessionModelMetadata,
  clearSessionModelMetadata,
  extractSessionModelConfig,
  getSessionProviderTemperature,
  resolveSessionUtilityModel,
} from "@/lib/ai/session-model-resolver";

describe("session-model-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves session utility override when metadata has sessionUtilityModel", () => {
    const sessionMetadata = {
      sessionProvider: "codex",
      sessionUtilityModel: "gpt-5.3-codex-medium",
    };

    const model = resolveSessionUtilityModel(sessionMetadata);

    expect(providerMocks.getModelByName).toHaveBeenCalledWith("gpt-5.3-codex-medium");
    expect(model).toEqual({ id: "gpt-5.3-codex-medium" });
    expect(providerMocks.getUtilityModel).not.toHaveBeenCalled();
  });

  it("falls back to global utility model when no session utility override exists", () => {
    const model = resolveSessionUtilityModel({ sessionProvider: "anthropic" });

    expect(providerMocks.getModelByName).not.toHaveBeenCalled();
    expect(providerMocks.getUtilityModel).toHaveBeenCalledTimes(1);
    expect(model).toEqual({ id: "global-utility" });
  });

  it("falls back to global utility model for invalid session model id", () => {
    providerMocks.getModelByName.mockImplementationOnce(() => {
      throw new Error("invalid model");
    });

    const model = resolveSessionUtilityModel({
      sessionProvider: "codex",
      sessionUtilityModel: "bad-model-id",
    });

    expect(providerMocks.getUtilityModel).toHaveBeenCalledTimes(1);
    expect(model).toEqual({ id: "global-utility" });
  });

  it("uses session provider temperature rules (kimi fixed value)", () => {
    const temperature = getSessionProviderTemperature(
      { sessionProvider: "kimi", sessionUtilityModel: "kimi-k2.5" },
      0.3
    );

    expect(temperature).toBe(1);
  });

  it("uses requested temperature when session provider does not override", () => {
    const temperature = getSessionProviderTemperature(
      { sessionProvider: "codex", sessionUtilityModel: "gpt-5.1-codex" },
      0.3
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
