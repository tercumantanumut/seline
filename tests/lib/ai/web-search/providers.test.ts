import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMock = vi.hoisted(() => ({
  loadSettings: vi.fn(() => ({})),
}));

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: settingsMock.loadSettings,
}));

import {
  getSearchProvider,
  getWebSearchProviderStatus,
  isAnySearchProviderAvailable,
} from "@/lib/ai/web-search/providers";

describe("web search provider status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TAVILY_API_KEY;
    delete process.env.WEB_SEARCH_PROVIDER;
  });

  it("uses DuckDuckGo fallback by default when Tavily is not configured", () => {
    const status = getWebSearchProviderStatus();

    expect(status).toMatchObject({
      configuredProvider: "auto",
      activeProvider: "duckduckgo",
      available: true,
      tavilyConfigured: false,
      enhanced: false,
      supportsAnswerSummary: false,
      isFallback: true,
    });

    expect(getSearchProvider().name).toBe("duckduckgo");
    expect(isAnySearchProviderAvailable()).toBe(true);
  });

  it("uses Tavily in auto mode when API key is set", () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";

    const status = getWebSearchProviderStatus();

    expect(status).toMatchObject({
      configuredProvider: "auto",
      activeProvider: "tavily",
      available: true,
      tavilyConfigured: true,
      enhanced: true,
      supportsAnswerSummary: true,
      isFallback: false,
    });

    expect(getSearchProvider().name).toBe("tavily");
    expect(isAnySearchProviderAvailable()).toBe(true);
  });

  it("stays on DuckDuckGo when explicitly configured", () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    process.env.WEB_SEARCH_PROVIDER = "duckduckgo";

    const status = getWebSearchProviderStatus();

    expect(status).toMatchObject({
      configuredProvider: "duckduckgo",
      activeProvider: "duckduckgo",
      available: true,
      tavilyConfigured: true,
      enhanced: false,
      supportsAnswerSummary: false,
      isFallback: false,
    });

    expect(getSearchProvider().name).toBe("duckduckgo");
    expect(isAnySearchProviderAvailable()).toBe(true);
  });

  it("reports unavailable when Tavily is forced without an API key", () => {
    process.env.WEB_SEARCH_PROVIDER = "tavily";

    const status = getWebSearchProviderStatus();

    expect(status).toMatchObject({
      configuredProvider: "tavily",
      activeProvider: "tavily",
      available: false,
      tavilyConfigured: false,
      enhanced: false,
      supportsAnswerSummary: false,
      isFallback: false,
    });

    expect(getSearchProvider().name).toBe("tavily");
    expect(isAnySearchProviderAvailable()).toBe(false);
  });
});
