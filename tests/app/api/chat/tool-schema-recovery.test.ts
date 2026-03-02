import { describe, expect, it } from "vitest";
import {
  disableToolForSchemaRecovery,
  parseInvalidToolSchemaError,
} from "@/app/api/chat/tool-schema-recovery";

describe("tool-schema-recovery", () => {
  it("parses provider invalid-schema errors with tool name and reason", () => {
    const parsed = parseInvalidToolSchemaError(
      "Invalid schema for function 'readFile': schema must have type 'object' and not have 'oneOf'/'anyOf'"
    );

    expect(parsed).toEqual({
      toolName: "readFile",
      reason: "schema must have type 'object' and not have 'oneOf'/'anyOf'",
      message:
        "Invalid schema for function 'readFile': schema must have type 'object' and not have 'oneOf'/'anyOf'",
    });
  });

  it("returns null for unrelated errors", () => {
    expect(parseInvalidToolSchemaError("Tool execution failed")).toBeNull();
  });

  it("disables tool and removes it from active/discovered state", () => {
    const allToolsWithMCP: Record<string, unknown> = {
      searchTools: {},
      readFile: {},
      localGrep: {},
    };
    const initialActiveToolNames = ["searchTools", "readFile"];
    const initialActiveTools = new Set(["searchTools", "readFile"]);
    const discoveredTools = new Set(["readFile"]);
    const previouslyDiscoveredTools = new Set(["readFile"]);

    const recovered = disableToolForSchemaRecovery(
      {
        allToolsWithMCP,
        initialActiveToolNames,
        initialActiveTools,
        discoveredTools,
        previouslyDiscoveredTools,
      },
      "readFile"
    );

    expect(recovered).toBe(true);
    expect(allToolsWithMCP.readFile).toBeUndefined();
    expect(initialActiveToolNames).toEqual(["searchTools"]);
    expect(initialActiveTools.has("readFile")).toBe(false);
    expect(discoveredTools.has("readFile")).toBe(false);
    expect(previouslyDiscoveredTools.has("readFile")).toBe(false);
  });

  it("returns false when the tool is not present", () => {
    const recovered = disableToolForSchemaRecovery(
      {
        allToolsWithMCP: { searchTools: {} },
        initialActiveToolNames: ["searchTools"],
      },
      "readFile"
    );

    expect(recovered).toBe(false);
  });
});

