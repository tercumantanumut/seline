import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function extractRegisteredToolNames(definitionsSource: string): string[] {
  const re = /registry\.register\(\s*"([^"]+)"/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(definitionsSource)) !== null) {
    names.push(match[1]);
  }

  return names;
}

function extractRendererKeys(rendererSource: string): string[] {
  const mapMatch = rendererSource.match(
    /ASSISTANT_TOOL_RENDERERS_BY_NAME\s*=\s*\{([\s\S]*?)\}\s*satisfies\s*Record<\s*string\s*,\s*AnyToolRenderer\s*>/
  );
  if (!mapMatch) {
    throw new Error("Could not locate ASSISTANT_TOOL_RENDERERS_BY_NAME object literal.");
  }

  const body = mapMatch[1];
  const keys: string[] = [];
  const keyRegex = /^\s*([A-Za-z0-9_]+)\s*:/gm;
  let keyMatch: RegExpExecArray | null;

  while ((keyMatch = keyRegex.exec(body)) !== null) {
    keys.push(keyMatch[1]);
  }

  return keys;
}

describe("assistant tool renderer coverage", () => {
  it("covers all statically registered tools", () => {
    const projectRoot = process.cwd();
    const toolDefinitionsPath = path.join(projectRoot, "lib/ai/tool-registry/tool-definitions.ts");
    const renderersPath = path.join(projectRoot, "components/assistant-ui/tool-renderers.tsx");

    const definitionsSource = fs.readFileSync(toolDefinitionsPath, "utf8");
    const rendererSource = fs.readFileSync(renderersPath, "utf8");

    const registeredTools = extractRegisteredToolNames(definitionsSource);
    const rendererKeys = extractRendererKeys(rendererSource);

    const missing = registeredTools.filter((toolName) => !rendererKeys.includes(toolName));

    expect(missing, `Missing renderer entries for tools: ${missing.join(", ")}`).toEqual([]);
  });
});
