import { describe, expect, it } from "vitest";
import { getCanonicalToolName } from "@/components/assistant-ui/tool-name-utils";

describe("getCanonicalToolName", () => {
  it("strips MCP server prefix from tool names", () => {
    expect(getCanonicalToolName("mcp__seline-platform__calculator")).toBe("calculator");
    expect(getCanonicalToolName("mcp__seline-platform__searchTools")).toBe("searchTools");
  });

  it("returns non-MCP tool names unchanged", () => {
    expect(getCanonicalToolName("calculator")).toBe("calculator");
    expect(getCanonicalToolName("executeCommand")).toBe("executeCommand");
  });
});

