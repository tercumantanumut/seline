import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Use vi.hoisted so the mock factory can reference the variable after hoisting.
const { mockCreateOpenAICompatible } = vi.hoisted(() => ({
  mockCreateOpenAICompatible: vi.fn(),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mockCreateOpenAICompatible,
}));

vi.mock("@/lib/ai/providers/openrouter-client", () => ({
  getAppUrl: vi.fn(() => "http://localhost:3000"),
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER mocks are wired
// ---------------------------------------------------------------------------

import {
  getMiniMaxApiKey,
  getMiniMaxClient,
  invalidateMiniMaxClient,
} from "@/lib/ai/providers/minimax-client";
import { MINIMAX_CONFIG } from "@/lib/auth/minimax-models";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("minimax-client", () => {
  const FAKE_KEY = "mm-test-key-abc123";

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMiniMaxClient();
    setEnv("MINIMAX_API_KEY", undefined);

    // Make the mock return a callable stub so getMiniMaxClient works end-to-end
    mockCreateOpenAICompatible.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    setEnv("MINIMAX_API_KEY", undefined);
  });

  // ---- getMiniMaxApiKey ---------------------------------------------------

  describe("getMiniMaxApiKey", () => {
    it("returns undefined when MINIMAX_API_KEY is not set", () => {
      expect(getMiniMaxApiKey()).toBeUndefined();
    });

    it("returns the API key from MINIMAX_API_KEY env var", () => {
      setEnv("MINIMAX_API_KEY", FAKE_KEY);
      expect(getMiniMaxApiKey()).toBe(FAKE_KEY);
    });
  });

  // ---- getMiniMaxClient ---------------------------------------------------

  describe("getMiniMaxClient", () => {
    it("creates an OpenAI-compatible client with correct base URL", () => {
      setEnv("MINIMAX_API_KEY", FAKE_KEY);
      getMiniMaxClient();

      expect(mockCreateOpenAICompatible).toHaveBeenCalledOnce();
      const callArgs = mockCreateOpenAICompatible.mock.calls[0][0];
      expect(callArgs.baseURL).toBe(MINIMAX_CONFIG.BASE_URL);
    });

    it("uses 'minimax' as the provider name", () => {
      setEnv("MINIMAX_API_KEY", FAKE_KEY);
      getMiniMaxClient();

      const callArgs = mockCreateOpenAICompatible.mock.calls[0][0];
      expect(callArgs.name).toBe("minimax");
    });

    it("passes the API key to the client", () => {
      setEnv("MINIMAX_API_KEY", FAKE_KEY);
      getMiniMaxClient();

      const callArgs = mockCreateOpenAICompatible.mock.calls[0][0];
      expect(callArgs.apiKey).toBe(FAKE_KEY);
    });

    it("passes empty string when no API key is set", () => {
      getMiniMaxClient();

      const callArgs = mockCreateOpenAICompatible.mock.calls[0][0];
      expect(callArgs.apiKey).toBe("");
    });

    it("includes HTTP-Referer and X-Title headers", () => {
      setEnv("MINIMAX_API_KEY", FAKE_KEY);
      getMiniMaxClient();

      const callArgs = mockCreateOpenAICompatible.mock.calls[0][0];
      expect(callArgs.headers).toEqual({
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Seline Agent",
      });
    });

    it("reuses cached client on subsequent calls", () => {
      setEnv("MINIMAX_API_KEY", FAKE_KEY);
      const client1 = getMiniMaxClient();
      const client2 = getMiniMaxClient();

      expect(mockCreateOpenAICompatible).toHaveBeenCalledOnce();
      expect(client1).toBe(client2);
    });

    it("recreates client when API key changes", () => {
      setEnv("MINIMAX_API_KEY", FAKE_KEY);
      getMiniMaxClient();

      setEnv("MINIMAX_API_KEY", "mm-different-key");
      getMiniMaxClient();

      expect(mockCreateOpenAICompatible).toHaveBeenCalledTimes(2);
    });
  });

  // ---- invalidateMiniMaxClient --------------------------------------------

  describe("invalidateMiniMaxClient", () => {
    it("forces a new client to be created on next call", () => {
      setEnv("MINIMAX_API_KEY", FAKE_KEY);
      getMiniMaxClient();
      expect(mockCreateOpenAICompatible).toHaveBeenCalledOnce();

      invalidateMiniMaxClient();
      getMiniMaxClient();
      expect(mockCreateOpenAICompatible).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Base URL verification ----------------------------------------------

  describe("base URL", () => {
    it("uses https://api.minimax.chat/v1 as the base URL", () => {
      expect(MINIMAX_CONFIG.BASE_URL).toBe("https://api.minimax.chat/v1");
    });
  });
});

// ---------------------------------------------------------------------------
// minimax-models
// ---------------------------------------------------------------------------

import {
  MINIMAX_MODEL_IDS,
  MINIMAX_DEFAULT_MODELS,
  getMiniMaxModels,
  getMiniMaxModelDisplayName,
} from "@/lib/auth/minimax-models";

describe("minimax-models", () => {
  it("exports expected model IDs", () => {
    expect(MINIMAX_MODEL_IDS).toContain("MiniMax-M2.1");
    expect(MINIMAX_MODEL_IDS).toContain("MiniMax-M2.1-lightning");
    expect(MINIMAX_MODEL_IDS).toContain("MiniMax-M2");
  });

  it("defines default chat model as MiniMax-M2.1", () => {
    expect(MINIMAX_DEFAULT_MODELS.chat).toBe("MiniMax-M2.1");
  });

  it("defines default utility model as MiniMax-M2.1-lightning", () => {
    expect(MINIMAX_DEFAULT_MODELS.utility).toBe("MiniMax-M2.1-lightning");
  });

  it("getMiniMaxModels returns id/name pairs for all models", () => {
    const models = getMiniMaxModels();
    expect(models).toHaveLength(MINIMAX_MODEL_IDS.length);
    for (const m of models) {
      expect(m).toHaveProperty("id");
      expect(m).toHaveProperty("name");
      expect(typeof m.name).toBe("string");
    }
  });

  it("getMiniMaxModelDisplayName returns a human-readable name", () => {
    expect(getMiniMaxModelDisplayName("MiniMax-M2.1")).toBe("MiniMax M2.1");
    expect(getMiniMaxModelDisplayName("MiniMax-M2.1-lightning")).toBe("MiniMax M2.1 Lightning");
    expect(getMiniMaxModelDisplayName("MiniMax-M2")).toBe("MiniMax M2");
  });

  it("getMiniMaxModelDisplayName falls back to the raw ID for unknown models", () => {
    expect(getMiniMaxModelDisplayName("MiniMax-M99")).toBe("MiniMax-M99");
  });
});
