import { describe, expect, it } from "vitest";
import {
  buildDuplicateCharacterName,
  buildDuplicateDisplayName,
  buildDuplicateMetadata,
  filterDuplicableFolders,
  mapDuplicateFolderStatus,
  type SyncFolderLike,
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

  it("clears system agent flags from metadata", () => {
    const source = {
      purpose: "Search sessions",
      isSystemAgent: true,
      systemAgentType: "session-search",
      workflowId: "wf-1",
    };

    const duplicated = buildDuplicateMetadata(source);
    expect(duplicated.purpose).toBe("Search sessions");
    expect(duplicated.isSystemAgent).toBeUndefined();
    expect(duplicated.systemAgentType).toBeUndefined();
    expect(duplicated.workflowId).toBeUndefined();
  });

  it("handles null metadata", () => {
    const duplicated = buildDuplicateMetadata(null);
    expect(duplicated).toEqual({});
  });
});

describe("filterDuplicableFolders", () => {
  const stubPathCheck = (existing: Set<string>) => (path: string) => existing.has(path);

  it("excludes inherited workflow folders", () => {
    const folders: SyncFolderLike[] = [
      { folderPath: "/own/folder", inheritedFromWorkflowId: null, status: "synced" },
      { folderPath: "/inherited/folder", inheritedFromWorkflowId: "wf-1", status: "synced" },
    ];

    const result = filterDuplicableFolders(
      folders,
      stubPathCheck(new Set(["/own/folder", "/inherited/folder"])),
    );
    expect(result).toHaveLength(1);
    expect(result[0].folderPath).toBe("/own/folder");
  });

  it("excludes folders with non-existent paths", () => {
    const folders: SyncFolderLike[] = [
      { folderPath: "/exists", inheritedFromWorkflowId: null, status: "synced" },
      { folderPath: "/stale-worktree", inheritedFromWorkflowId: null, status: "synced" },
    ];

    const result = filterDuplicableFolders(
      folders,
      stubPathCheck(new Set(["/exists"])),
    );
    expect(result).toHaveLength(1);
    expect(result[0].folderPath).toBe("/exists");
  });

  it("excludes both inherited and non-existent in one pass", () => {
    const folders: SyncFolderLike[] = [
      { folderPath: "/good", inheritedFromWorkflowId: null, status: "synced" },
      { folderPath: "/inherited", inheritedFromWorkflowId: "wf-1", status: "synced" },
      { folderPath: "/gone", inheritedFromWorkflowId: null, status: "paused" },
    ];

    const result = filterDuplicableFolders(
      folders,
      stubPathCheck(new Set(["/good", "/inherited"])),
    );
    expect(result).toHaveLength(1);
    expect(result[0].folderPath).toBe("/good");
  });

  it("returns empty array when all folders are excluded", () => {
    const folders: SyncFolderLike[] = [
      { folderPath: "/inherited", inheritedFromWorkflowId: "wf-1", status: "synced" },
      { folderPath: "/gone", inheritedFromWorkflowId: null, status: "paused" },
    ];

    const result = filterDuplicableFolders(
      folders,
      stubPathCheck(new Set()),
    );
    expect(result).toHaveLength(0);
  });
});

describe("mapDuplicateFolderStatus", () => {
  it("maps synced to paused", () => {
    expect(mapDuplicateFolderStatus("synced")).toBe("paused");
  });

  it("maps syncing to paused", () => {
    expect(mapDuplicateFolderStatus("syncing")).toBe("paused");
  });

  it("preserves paused as-is", () => {
    expect(mapDuplicateFolderStatus("paused")).toBe("paused");
  });

  it("preserves pending as-is", () => {
    expect(mapDuplicateFolderStatus("pending")).toBe("pending");
  });

  it("preserves error as-is", () => {
    expect(mapDuplicateFolderStatus("error")).toBe("error");
  });

  it("defaults null to pending", () => {
    expect(mapDuplicateFolderStatus(null)).toBe("pending");
  });
});
