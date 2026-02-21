import { describe, expect, it, vi } from "vitest";

const ddgsMock = vi.hoisted(() => ({
  createDDGS: vi.fn(),
}));

vi.mock("@/lib/ai/web-search/ddgs", () => ({
  createDDGS: ddgsMock.createDDGS,
}));

import { DuckDuckGoProvider } from "@/lib/ai/web-search/providers";

describe("DuckDuckGoProvider URL normalization", () => {
  it("keeps absolute URLs and resolves /l/?uddg redirect URLs", async () => {
    const provider = new DuckDuckGoProvider();

    const fakeRows = [
      {
        title: "OpenAI",
        href: "https://openai.com/",
        body: "Absolute URL row",
      },
      {
        title: "Wikipedia",
        href: "/l/?kh=-1&uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FOpenAI",
        body: "Relative DDG redirect row",
      },
    ];

    ddgsMock.createDDGS.mockResolvedValue({
      text: vi.fn().mockResolvedValue(fakeRows),
    });

    const result = await provider.search("openai", { maxResults: 5 });
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]?.url).toBe("https://openai.com/");
    expect(result.sources[1]?.url).toBe("https://en.wikipedia.org/wiki/OpenAI");
  });
});
