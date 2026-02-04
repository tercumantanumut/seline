import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

describe("Electron bundle (integration)", () => {
  const bundlePath = path.join(process.cwd(), "electron-dist", "main.js");
  const preloadPath = path.join(process.cwd(), "electron-dist", "preload.js");

  beforeAll(() => {
    // Build the bundle before running tests
    execSync("npm run electron:bundle", {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 120000,
    });
  }, 180000);

  it("produces a bundled main.js file", () => {
    expect(fs.existsSync(bundlePath)).toBe(true);
    const stats = fs.statSync(bundlePath);
    // Bundle should be at least 100KB (includes @huggingface/hub)
    expect(stats.size).toBeGreaterThan(100 * 1024);
  });

  it("includes @huggingface/hub code inline", () => {
    const content = fs.readFileSync(bundlePath, "utf8");
    // Check for distinctive code patterns from @huggingface/hub
    expect(content).toContain("huggingface.co");
    // Should NOT have dynamic require for the package
    expect(content).not.toMatch(/require\s*\(\s*["']@huggingface\/hub["']\s*\)/);
  });

  it("keeps electron as external", () => {
    const content = fs.readFileSync(bundlePath, "utf8");
    // electron should remain as external require
    expect(content).toMatch(/require\s*\(\s*["']electron["']\s*\)/);
  });

  it("keeps native modules as external", () => {
    const content = fs.readFileSync(bundlePath, "utf8");
    // Native modules should remain external
    expect(content).toMatch(/require\s*\(\s*["']better-sqlite3["']\s*\)/);
  });

  it("produces a preload.js file", () => {
    expect(fs.existsSync(preloadPath)).toBe(true);
  });

  it("preload.js keeps electron as external", () => {
    const content = fs.readFileSync(preloadPath, "utf8");
    expect(content).toMatch(/require\s*\(\s*["']electron["']\s*\)/);
  });
});
