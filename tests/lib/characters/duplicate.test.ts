import { describe, expect, it } from "vitest";
import {
  buildDuplicateCharacterName,
  buildDuplicateDisplayName,
  buildDuplicateMetadata,
} from "@/lib/characters/duplicate";

describe("character duplicate helpers", () => {
  it("appends (copy) without accumulating suffixes", () => {
    expect(buildDuplicateCharacterName("ResearchBot")).toBe("ResearchBot (copy)");
    expect(buildDuplicateCharacterName("ResearchBot (copy)")).toBe("ResearchBot (copy)");
  });

  it("duplicates display name when present", () => {
    expect(buildDuplicateDisplayName("Planner")).toBe("Planner (copy)");
    expect(buildDuplicateDisplayName("Planner (copy)")).toBe("Planner (copy)");
    expect(buildDuplicateDisplayName(null)).toBeNull();
  });

  it("clears workflow linkage keys from metadata", () => {
    const source = {
      purpose: "Assist",
      workflowId: "wf-1",
      workflowRole: "subagent",
      inheritedResources: { syncFolders: true },
    };

    const duplicated = buildDuplicateMetadata(source);
    expect(duplicated.purpose).toBe("Assist");
    expect(duplicated.workflowId).toBeUndefined();
    expect(duplicated.workflowRole).toBeUndefined();
    expect(duplicated.inheritedResources).toBeUndefined();
    expect(source.workflowId).toBe("wf-1");
  });
});
