import { describe, expect, it } from "vitest";

import { validateGenerativeUISpec, extractGenerativeUISpec } from "@/lib/ai/generative-ui/spec";
import { buildAutoGenerativeUISpec } from "@/lib/ai/generative-ui/auto-spec";
import { getGenerativeUISpecFromResult } from "@/lib/ai/generative-ui/payload";

describe("generative UI spec validation", () => {
  it("accepts a valid open-json-ui spec", () => {
    const candidate = {
      version: "open-json-ui/v1",
      title: "Search",
      root: {
        type: "stack",
        children: [
          {
            type: "card",
            title: "Summary",
            children: [{ type: "text", text: "Hello" }],
          },
        ],
      },
    };

    const validated = validateGenerativeUISpec(candidate);
    expect(validated.valid).toBe(true);
    expect(validated.spec?.title).toBe("Search");
  });

  it("rejects invalid specs", () => {
    const invalid = {
      version: "open-json-ui/v1",
      root: {
        type: "table",
        columns: [],
        rows: [],
      },
    };

    const validated = validateGenerativeUISpec(invalid);
    expect(validated.valid).toBe(false);
    expect(validated.errors.length).toBeGreaterThan(0);
  });

  it("extracts nested spec payloads", () => {
    const extraction = extractGenerativeUISpec({
      uiSpec: {
        version: "open-json-ui/v1",
        root: {
          type: "text",
          text: "Inline",
        },
      },
    });

    expect(extraction.valid).toBe(true);
    expect(extraction.sourcePath).toBe("$.uiSpec");
    expect(extraction.spec?.root.type).toBe("text");
  });
});

describe("auto UI spec generation", () => {
  it("builds webSearch visual spec from tool output", () => {
    const spec = buildAutoGenerativeUISpec("webSearch", {
      query: "istanbul weather",
      answer: "Rainy",
      sources: [
        { title: "A", url: "https://a.test", relevanceScore: 0.9 },
        { title: "B", url: "https://b.test", relevanceScore: 0.8 },
      ],
    });

    expect(spec).toBeDefined();
    expect(spec?.version).toBe("open-json-ui/v1");
    expect(spec?.root.type).toBe("stack");
  });

  it("returns undefined for unsupported tools", () => {
    const spec = buildAutoGenerativeUISpec("readFile", { content: "abc" });
    expect(spec).toBeUndefined();
  });
});

describe("payload parsing", () => {
  it("returns validated spec when payload contains valid uiSpec", () => {
    const { spec, meta } = getGenerativeUISpecFromResult({
      uiSpec: {
        version: "open-json-ui/v1",
        title: "Validated",
        root: {
          type: "text",
          text: "hello",
        },
      },
      uiSpecMeta: {
        valid: true,
        source: "model",
        generatedAt: new Date().toISOString(),
      },
    });

    expect(spec?.title).toBe("Validated");
    expect(meta?.source).toBe("model");
  });

  it("drops invalid payload uiSpec", () => {
    const { spec } = getGenerativeUISpecFromResult({
      uiSpec: {
        version: "open-json-ui/v1",
        root: {
          type: "table",
          columns: [],
          rows: [],
        },
      },
    });

    expect(spec).toBeUndefined();
  });
});
