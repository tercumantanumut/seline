import { describe, expect, it } from "vitest";

import { providerSupportsFeatureForProvider } from "@/lib/ai/providers";

describe("provider generative UI feature gate", () => {
  it("enables generativeUi for major hosted providers", () => {
    expect(providerSupportsFeatureForProvider("anthropic", "generativeUi")).toBe(true);
    expect(providerSupportsFeatureForProvider("openrouter", "generativeUi")).toBe(true);
    expect(providerSupportsFeatureForProvider("codex", "generativeUi")).toBe(true);
  });

  it("disables generativeUi for ollama by default", () => {
    expect(providerSupportsFeatureForProvider("ollama", "generativeUi")).toBe(false);
  });
});
