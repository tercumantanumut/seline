import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const foldersByCharacter = new Map<string, any[]>();
  const workflowByAgentId = new Map<string, any>();
  const membersByWorkflowId = new Map<string, any[]>();
  const metadataByCharacter = new Map<string, Record<string, unknown> | null>();
  const sharedFolderRows: any[] = [];

  const reset = () => {
    foldersByCharacter.clear();
    workflowByAgentId.clear();
    membersByWorkflowId.clear();
    metadataByCharacter.clear();
    sharedFolderRows.length = 0;
  };

  return {
    foldersByCharacter,
    workflowByAgentId,
    membersByWorkflowId,
    metadataByCharacter,
    sharedFolderRows,
    reset,
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...conditions: any[]) => ({ kind: "and", conditions }),
  eq: (column: any, value: any) => ({ kind: "eq", column, value }),
  inArray: (column: any, values: any[]) => ({ kind: "inArray", column, values }),
  isNull: (column: any) => ({ kind: "isNull", column }),
}));

vi.mock("@/lib/agents/workflows", () => ({
  getWorkflowByAgentId: vi.fn(async (agentId: string) => mocks.workflowByAgentId.get(agentId) ?? null),
  getWorkflowMembers: vi.fn(async (workflowId: string) => mocks.membersByWorkflowId.get(workflowId) ?? []),
}));

vi.mock("@/lib/agents/workflow-types", () => ({
  toObject: (value: unknown) => (value && typeof value === "object" ? value : {}),
}));

vi.mock("@/lib/db/sqlite-character-schema", () => ({
  agentSyncFolders: {
    characterId: { name: "characterId" },
    inheritedFromWorkflowId: { name: "inheritedFromWorkflowId" },
  },
  characters: {
    id: { name: "id" },
    metadata: { name: "metadata" },
  },
}));

vi.mock("@/lib/vectordb/path-validation", () => ({
  normalizeFolderPath: (value: string) => value.toLowerCase(),
}));

vi.mock("@/lib/vectordb/sync-folder-crud", () => ({
  getSyncFolders: vi.fn(async (characterId: string) => mocks.foldersByCharacter.get(characterId) ?? []),
}));

vi.mock("@/lib/db/sqlite-client", () => ({
  db: {
    select(selection?: any) {
      return {
        from(table: any) {
          if (selection?.metadata) {
            return {
              where(condition: any) {
                const id = condition.value;
                const metadata = mocks.metadataByCharacter.get(id) ?? null;
                return {
                  limit() {
                    return Promise.resolve(metadata == null ? [] : [{ metadata }]);
                  },
                };
              },
            };
          }

          return {
            where() {
              return Promise.resolve(mocks.sharedFolderRows);
            },
          };
        },
      };
    },
  },
}));

import { getAccessibleSyncFolders } from "@/lib/vectordb/accessible-sync-folders";

describe("getAccessibleSyncFolders", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("returns own folders when agent is not in a workflow", async () => {
    mocks.foldersByCharacter.set("agent-a", [{ id: "own-1", folderPath: "C:/repo" }]);

    await expect(getAccessibleSyncFolders("agent-a")).resolves.toEqual([{ id: "own-1", folderPath: "C:/repo" }]);
  });

  it("includes other members' own folders when shared folders are allowed", async () => {
    mocks.foldersByCharacter.set("agent-a", [{ id: "own-1", folderPath: "C:/repo" }]);
    mocks.workflowByAgentId.set("agent-a", { workflow: { id: "wf-1" } });
    mocks.membersByWorkflowId.set("wf-1", [
      { agentId: "agent-a" },
      { agentId: "agent-b" },
      { agentId: "agent-c" },
    ]);
    mocks.metadataByCharacter.set("agent-a", {});
    mocks.sharedFolderRows.push(
      { id: "shared-1", characterId: "agent-b", folderPath: "C:/other", inheritedFromWorkflowId: null },
      { id: "shared-2", characterId: "agent-c", folderPath: "C:/repo", inheritedFromWorkflowId: null }
    );

    const result = await getAccessibleSyncFolders("agent-a");
    expect(result.map((folder) => folder.id)).toEqual(["own-1", "shared-1"]);
  });

  it("respects workflow sandbox policy disabling shared folders", async () => {
    mocks.foldersByCharacter.set("agent-a", [{ id: "own-1", folderPath: "C:/repo" }]);
    mocks.workflowByAgentId.set("agent-a", { workflow: { id: "wf-1" } });
    mocks.membersByWorkflowId.set("wf-1", [{ agentId: "agent-a" }, { agentId: "agent-b" }]);
    mocks.metadataByCharacter.set("agent-a", { workflowSandboxPolicy: { allowSharedFolders: false } });
    mocks.sharedFolderRows.push({ id: "shared-1", characterId: "agent-b", folderPath: "C:/other", inheritedFromWorkflowId: null });

    await expect(getAccessibleSyncFolders("agent-a")).resolves.toEqual([{ id: "own-1", folderPath: "C:/repo" }]);
  });
});
