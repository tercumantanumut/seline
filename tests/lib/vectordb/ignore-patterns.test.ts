import { describe, expect, it } from "vitest";
import {
  DEFAULT_IGNORE_PATTERNS,
  createAggressiveIgnore,
  createIgnoreMatcher,
} from "@/lib/vectordb/ignore-patterns";

describe("vectordb ignore patterns", () => {
  const basePath = "/workspace/demo";

  it("ignores python virtualenvs and caches during sync discovery", () => {
    const shouldIgnore = createIgnoreMatcher(DEFAULT_IGNORE_PATTERNS, basePath);

    expect(shouldIgnore("/workspace/demo/.venv/lib/python3.12/site-packages/pip/__init__.py")).toBe(true);
    expect(shouldIgnore("/workspace/demo/src/__pycache__/module.cpython-312.pyc")).toBe(true);
    expect(shouldIgnore("/workspace/demo/env/bin/python")).toBe(true);
  });

  it("aggressively ignores binary asset files unless explicitly included", () => {
    const shouldIgnore = createAggressiveIgnore(DEFAULT_IGNORE_PATTERNS, basePath, ["md", "ts"]);

    expect(shouldIgnore("/workspace/demo/public/images/hero.png")).toBe(true);
    expect(shouldIgnore("/workspace/demo/public/fonts/brand.woff2")).toBe(true);
    expect(shouldIgnore("/workspace/demo/docs/readme.md")).toBe(false);
  });

  it("keeps explicitly included asset extensions watchable", () => {
    const shouldIgnore = createAggressiveIgnore(DEFAULT_IGNORE_PATTERNS, basePath, ["md", "png"]);

    expect(shouldIgnore("/workspace/demo/assets/diagram.png")).toBe(false);
  });
});
