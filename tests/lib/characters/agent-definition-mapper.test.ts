import { describe, it, expect } from "vitest";
import {
  mapSelineToolsToSdk,
  templateToAgentDefinition,
  systemAgentsToSdkAgents,
  systemAgentsToSdkAgentsById,
} from "@/lib/characters/templates/agent-definition-mapper";
import { SYSTEM_AGENT_TEMPLATES } from "@/lib/characters/templates/system-agents";
import type { AgentTemplate } from "@/lib/characters/templates/types";

// ---------------------------------------------------------------------------
// mapSelineToolsToSdk
// ---------------------------------------------------------------------------

describe("mapSelineToolsToSdk", () => {
  it("maps known Seline tool names to their SDK equivalents", () => {
    const result = mapSelineToolsToSdk(["readFile", "editFile", "executeCommand"]);
    expect(result).toEqual(["Read", "Edit", "Bash"]);
  });

  it("deduplicates tools that map to the same SDK name", () => {
    // Both editFile and patchFile map to "Edit"
    const result = mapSelineToolsToSdk(["editFile", "patchFile"]);
    expect(result).toEqual(["Edit"]);
  });

  it("returns undefined when no tools have an SDK mapping", () => {
    // Custom Seline tools with no SDK equivalent
    const result = mapSelineToolsToSdk(["vectorSearch", "memorize", "getSkill", "scheduleTask"]);
    expect(result).toBeUndefined();
  });

  it("returns undefined for an empty input array", () => {
    expect(mapSelineToolsToSdk([])).toBeUndefined();
  });

  it("silently ignores unknown tool names and maps the rest", () => {
    const result = mapSelineToolsToSdk(["readFile", "unknownTool", "webSearch"]);
    expect(result).toContain("Read");
    expect(result).toContain("WebSearch");
    expect(result).not.toContain("unknownTool");
  });
});

// ---------------------------------------------------------------------------
// templateToAgentDefinition
// ---------------------------------------------------------------------------

describe("templateToAgentDefinition", () => {
  const baseTemplate: AgentTemplate = {
    id: "test-agent",
    name: "Test Agent",
    tagline: "Does test things",
    purpose: "You are a test agent. Your job is to run tests.",
    enabledTools: ["readFile", "executeCommand"],
    memories: [],
  };

  it("sets description from tagline", () => {
    const def = templateToAgentDefinition(baseTemplate);
    expect(def.description).toBe("Does test things");
  });

  it("sets prompt from purpose", () => {
    const def = templateToAgentDefinition(baseTemplate);
    expect(def.prompt).toBe("You are a test agent. Your job is to run tests.");
  });

  it("sets model to inherit", () => {
    const def = templateToAgentDefinition(baseTemplate);
    expect(def.model).toBe("inherit");
  });

  it("maps enabled tools to SDK tool names", () => {
    const def = templateToAgentDefinition(baseTemplate);
    // readFile → Read, executeCommand → Bash
    expect(def.tools).toContain("Read");
    expect(def.tools).toContain("Bash");
  });

  it("sets tools to undefined when no enabled tools map to SDK names", () => {
    const template: AgentTemplate = {
      ...baseTemplate,
      enabledTools: ["vectorSearch", "memorize"],
    };
    const def = templateToAgentDefinition(template);
    expect(def.tools).toBeUndefined();
  });

  it("returns a valid AgentDefinition shape", () => {
    const def = templateToAgentDefinition(baseTemplate);
    expect(def).toMatchObject({
      description: expect.any(String),
      prompt: expect.any(String),
      model: "inherit",
    });
  });
});

// ---------------------------------------------------------------------------
// systemAgentsToSdkAgents
// ---------------------------------------------------------------------------

describe("systemAgentsToSdkAgents", () => {
  it("returns a non-empty record", () => {
    const agents = systemAgentsToSdkAgents();
    expect(Object.keys(agents).length).toBeGreaterThan(0);
  });

  it("uses system agent IDs as keys", () => {
    const agents = systemAgentsToSdkAgents();
    for (const template of SYSTEM_AGENT_TEMPLATES) {
      expect(agents).toHaveProperty(template.id);
    }
  });

  it("each entry is a valid AgentDefinition", () => {
    const agents = systemAgentsToSdkAgents();
    for (const [, def] of Object.entries(agents)) {
      expect(typeof def.description).toBe("string");
      expect(typeof def.prompt).toBe("string");
      expect(def.model).toBe("inherit");
    }
  });

  it("system-explore agent has Read and Bash tools", () => {
    const agents = systemAgentsToSdkAgents();
    const exploreTools = agents["system-explore"]?.tools ?? [];
    // The explore agent has readFile → Read and executeCommand → Bash
    expect(exploreTools).toContain("Read");
    expect(exploreTools).toContain("Bash");
  });

  it("produces a new object on each call (not a shared reference)", () => {
    const a = systemAgentsToSdkAgents();
    const b = systemAgentsToSdkAgents();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// systemAgentsToSdkAgentsById
// ---------------------------------------------------------------------------

describe("systemAgentsToSdkAgentsById", () => {
  it("returns only the requested agent IDs", () => {
    const agents = systemAgentsToSdkAgentsById(["system-explore", "system-plan"]);
    expect(Object.keys(agents)).toHaveLength(2);
    expect(agents).toHaveProperty("system-explore");
    expect(agents).toHaveProperty("system-plan");
  });

  it("returns an empty object when no IDs match", () => {
    const agents = systemAgentsToSdkAgentsById(["non-existent-agent"]);
    expect(Object.keys(agents)).toHaveLength(0);
  });

  it("silently ignores unknown IDs", () => {
    const agents = systemAgentsToSdkAgentsById(["system-explore", "fake-agent"]);
    expect(Object.keys(agents)).toHaveLength(1);
    expect(agents).toHaveProperty("system-explore");
  });

  it("returns an empty object for an empty array input", () => {
    const agents = systemAgentsToSdkAgentsById([]);
    expect(Object.keys(agents)).toHaveLength(0);
  });
});
