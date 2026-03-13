import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const folderEventListeners: Array<(characterId: string, event: any) => void | Promise<void>> = [];

  const state = {
    folders: [] as any[],
    workflowByAgentId: new Map<string, any>(),
    membersByWorkflowId: new Map<string, any[]>(),
    workflowById: new Map<string, any>(),
    notifications: [] as Array<{ characterId: string; event: any }>,
  };

  const resetState = () => {
    state.folders = [];
    state.workflowByAgentId.clear();
    state.membersByWorkflowId.clear();
    state.workflowById.clear();
    state.notifications = [];
    folderEventListeners.length = 0;
  };

  const cloneRow = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

  const makeFolder = (overrides: Partial<any> = {}) => ({
    id: overrides.id ?? crypto.randomUUID(),
    userId: overrides.userId ?? "user-1",
    characterId: overrides.characterId ?? "agent-a",
    folderPath: overrides.folderPath ?? "C:/repo",
    displayName: overrides.displayName ?? "repo",
    isPrimary: overrides.isPrimary ?? false,
    recursive: overrides.recursive ?? true,
    includeExtensions: overrides.includeExtensions ?? ["ts"],
    excludePatterns: overrides.excludePatterns ?? ["node_modules"],
    status: overrides.status ?? "synced",
    lastSyncedAt: overrides.lastSyncedAt ?? null,
    lastError: overrides.lastError ?? null,
    fileCount: overrides.fileCount ?? 0,
    chunkCount: overrides.chunkCount ?? 0,
    embeddingModel: overrides.embeddingModel ?? "text-embedding-3-small",
    indexingMode: overrides.indexingMode ?? "auto",
    syncMode: overrides.syncMode ?? "auto",
    syncCadenceMinutes: overrides.syncCadenceMinutes ?? 60,
    fileTypeFilters: overrides.fileTypeFilters ?? [],
    maxFileSizeBytes: overrides.maxFileSizeBytes ?? 1024,
    chunkPreset: overrides.chunkPreset ?? "balanced",
    chunkSizeOverride: overrides.chunkSizeOverride ?? null,
    chunkOverlapOverride: overrides.chunkOverlapOverride ?? null,
    reindexPolicy: overrides.reindexPolicy ?? "smart",
    skippedCount: overrides.skippedCount ?? 0,
    skipReasons: overrides.skipReasons ?? {},
    lastRunMetadata: overrides.lastRunMetadata ?? {},
    lastRunTrigger: overrides.lastRunTrigger ?? null,
    inheritedFromWorkflowId: overrides.inheritedFromWorkflowId ?? null,
    inheritedFromAgentId: overrides.inheritedFromAgentId ?? null,
    inheritedFromFolderId: overrides.inheritedFromFolderId ?? null,
    updatedAt: overrides.updatedAt ?? "2026-03-13T00:00:00.000Z",
  });

  const evaluateCondition = (condition: any, row: any): boolean => {
    if (!condition) return true;
    switch (condition.kind) {
      case "eq": {
        const rowValue = row[condition.column.name];
        if (Array.isArray(rowValue)) {
          return rowValue.some((value) => value === condition.value);
        }
        return rowValue === condition.value;
      }
      case "isNull":
        return row[condition.column.name] == null;
      case "inArray":
        return condition.values.includes(row[condition.column.name]);
      case "and":
        return condition.conditions.every((child: any) => evaluateCondition(child, row));
      default:
        return true;
    }
  };

  const makeSelectResult = (getRows: () => any[], project?: (row: any) => any) => ({
    from() {
      return {
        where(condition: any) {
          const filtered = getRows().filter((row) => evaluateCondition(condition, row));
          const projected = filtered.map((row) => (project ? project(row) : row));
          return {
            limit(count: number) {
              return Promise.resolve(projected.slice(0, count).map(cloneRow));
            },
            orderBy() {
              return Promise.resolve(projected.map(cloneRow));
            },
            then(resolve: (value: any[]) => unknown) {
              return Promise.resolve(projected.map(cloneRow)).then(resolve);
            },
          };
        },
        limit(count: number) {
          const projected = getRows().map((row) => (project ? project(row) : row));
          return Promise.resolve(projected.slice(0, count).map(cloneRow));
        },
      };
    },
  });

  const projectSelection = (selection: any, row: any) => {
    if (!selection) return row;
    const projected: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(selection)) {
      projected[key] = row[(column as any).name];
    }
    return projected;
  };

  return {
    folderEventListeners,
    state,
    resetState,
    cloneRow,
    makeFolder,
    evaluateCondition,
    makeSelectResult,
    projectSelection,
    refreshWorkflowSharedResources: vi.fn(),
    getWorkflowByAgentId: vi.fn(async (agentId: string) => state.workflowByAgentId.get(agentId) ?? null),
    getWorkflowMembers: vi.fn(async (workflowId: string) => state.membersByWorkflowId.get(workflowId) ?? []),
    getWorkflowById: vi.fn(async (workflowId: string) => state.workflowById.get(workflowId) ?? null),
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...conditions: any[]) => ({ kind: "and", conditions }),
  eq: (column: any, value: any) => ({ kind: "eq", column, value }),
  inArray: (column: any, values: any[]) => ({ kind: "inArray", column, values }),
  isNull: (column: any) => ({ kind: "isNull", column }),
}));

vi.mock("@/lib/db/sqlite-character-schema", () => ({
  agentSyncFolders: {
    id: { name: "id" },
    userId: { name: "userId" },
    characterId: { name: "characterId" },
    folderPath: { name: "folderPath" },
    inheritedFromWorkflowId: { name: "inheritedFromWorkflowId" },
    inheritedFromAgentId: { name: "inheritedFromAgentId" },
    inheritedFromFolderId: { name: "inheritedFromFolderId" },
  },
}));

vi.mock("@/lib/db/sqlite-workflows-schema", () => ({
  agentWorkflows: {
    id: { name: "id" },
    userId: { name: "userId" },
  },
  agentWorkflowMembers: {
    workflowId: { name: "workflowId" },
    agentId: { name: "agentId" },
    role: { name: "role" },
  },
}));

vi.mock("@/lib/vectordb/folder-events", () => ({
  onFolderChange: (listener: any) => {
    mocks.folderEventListeners.push(listener);
    return () => {
      const index = mocks.folderEventListeners.indexOf(listener);
      if (index >= 0) mocks.folderEventListeners.splice(index, 1);
    };
  },
  notifyFolderChange: (characterId: string, event: any) => {
    mocks.state.notifications.push({ characterId, event });
  },
}));

vi.mock("@/lib/agents/workflow-db-helpers", () => ({
  refreshWorkflowSharedResources: mocks.refreshWorkflowSharedResources,
}));

vi.mock("@/lib/agents/workflows", () => ({
  getWorkflowByAgentId: mocks.getWorkflowByAgentId,
  getWorkflowMembers: mocks.getWorkflowMembers,
  getWorkflowById: mocks.getWorkflowById,
}));

vi.mock("@/lib/db/sqlite-client", () => ({
  db: {
    select(selection?: any) {
      return mocks.makeSelectResult(
        () => mocks.state.folders,
        (row) => mocks.projectSelection(selection, row)
      );
    },
    insert() {
      return {
        values(values: any) {
          const row = { ...values, id: values.id ?? crypto.randomUUID() };
          mocks.state.folders.push(row);
          return {
            returning() {
              return Promise.resolve([mocks.cloneRow(row)]);
            },
          };
        },
      };
    },
    update() {
      return {
        set(values: any) {
          return {
            where(condition: any) {
              for (const row of mocks.state.folders) {
                if (mocks.evaluateCondition(condition, row)) {
                  Object.assign(row, values);
                }
              }
              return Promise.resolve();
            },
          };
        },
      };
    },
    delete() {
      return {
        where(condition: any) {
          mocks.state.folders = mocks.state.folders.filter((row) => !mocks.evaluateCondition(condition, row));
          return Promise.resolve();
        },
      };
    },
  },
}));

import {
  propagateWorkflowFolderChange,
  registerWorkflowFolderPropagation,
  resetWorkflowFolderPropagationForTests,
} from "@/lib/agents/workflow-folder-sharing";

describe("workflow folder propagation", () => {
  beforeEach(() => {
    mocks.resetState();
    mocks.refreshWorkflowSharedResources.mockClear();
    mocks.getWorkflowByAgentId.mockClear();
    mocks.getWorkflowMembers.mockClear();
    mocks.getWorkflowById.mockClear();
    resetWorkflowFolderPropagationForTests();
  });

  it("propagates newly added own folder to other workflow members", async () => {
    const workflow = { id: "wf-1", initiatorId: "agent-a", status: "active" };
    mocks.state.workflowByAgentId.set("agent-a", { workflow, member: { agentId: "agent-a", role: "initiator" } });
    mocks.state.workflowById.set("wf-1", workflow);
    mocks.state.membersByWorkflowId.set("wf-1", [
      { agentId: "agent-a", role: "initiator" },
      { agentId: "agent-b", role: "subagent" },
      { agentId: "agent-c", role: "subagent" },
    ]);
    mocks.state.folders.push(mocks.makeFolder({ id: "folder-a", characterId: "agent-a", folderPath: "C:/repo" }));

    await propagateWorkflowFolderChange("agent-a", { type: "added", folderId: "folder-a" });

    const inherited = mocks.state.folders.filter((row) => row.inheritedFromAgentId === "agent-a");
    expect(inherited).toHaveLength(2);
    expect(inherited.map((row) => row.characterId).sort()).toEqual(["agent-b", "agent-c"]);
    expect(inherited.every((row) => row.inheritedFromWorkflowId === "wf-1")).toBe(true);
    expect(mocks.refreshWorkflowSharedResources).toHaveBeenCalledWith("wf-1", "agent-a", mocks.getWorkflowById);
  });

  it("does not propagate inherited folders again", async () => {
    const workflow = { id: "wf-1", initiatorId: "agent-a", status: "active" };
    mocks.state.workflowByAgentId.set("agent-b", { workflow, member: { agentId: "agent-b", role: "subagent" } });
    mocks.state.workflowById.set("wf-1", workflow);
    mocks.state.membersByWorkflowId.set("wf-1", [
      { agentId: "agent-a", role: "initiator" },
      { agentId: "agent-b", role: "subagent" },
    ]);
    mocks.state.folders.push(
      mocks.makeFolder({
        id: "inherited-folder",
        characterId: "agent-b",
        folderPath: "C:/repo",
        inheritedFromWorkflowId: "wf-1",
        inheritedFromAgentId: "agent-a",
      })
    );

    await propagateWorkflowFolderChange("agent-b", { type: "added", folderId: "inherited-folder" });

    expect(mocks.state.folders).toHaveLength(1);
    expect(mocks.refreshWorkflowSharedResources).not.toHaveBeenCalled();
  });

  it("removes inherited copies from other members when source folder is removed", async () => {
    const workflow = { id: "wf-1", initiatorId: "agent-a", status: "active" };
    mocks.state.workflowByAgentId.set("agent-a", { workflow, member: { agentId: "agent-a", role: "initiator" } });
    mocks.state.workflowById.set("wf-1", workflow);
    mocks.state.membersByWorkflowId.set("wf-1", [
      { agentId: "agent-a", role: "initiator" },
      { agentId: "agent-b", role: "subagent" },
    ]);
    mocks.state.folders.push(
      mocks.makeFolder({ id: "copy-1", characterId: "agent-b", folderPath: "C:/repo", inheritedFromWorkflowId: "wf-1", inheritedFromAgentId: "agent-a" }),
      mocks.makeFolder({ id: "own-b", characterId: "agent-b", folderPath: "C:/own-b" })
    );

    await propagateWorkflowFolderChange("agent-a", { type: "removed", folderId: "source-folder", folderPath: "C:/repo" });

    expect(mocks.state.folders.map((row) => row.id)).toEqual(["own-b"]);
    expect(mocks.state.notifications).toContainEqual({
      characterId: "agent-b",
      event: { type: "removed", folderId: "copy-1", wasPrimary: false },
    });
    expect(mocks.refreshWorkflowSharedResources).toHaveBeenCalledWith("wf-1", "agent-a", mocks.getWorkflowById);
  });

  it("updates inherited copies when source folder settings change", async () => {
    const workflow = { id: "wf-1", initiatorId: "agent-a", status: "active" };
    mocks.state.workflowByAgentId.set("agent-a", { workflow, member: { agentId: "agent-a", role: "initiator" } });
    mocks.state.workflowById.set("wf-1", workflow);
    mocks.state.membersByWorkflowId.set("wf-1", [
      { agentId: "agent-a", role: "initiator" },
      { agentId: "agent-b", role: "subagent" },
    ]);
    mocks.state.folders.push(
      mocks.makeFolder({ id: "folder-a", characterId: "agent-a", folderPath: "C:/repo", displayName: "new-name", recursive: false, includeExtensions: ["md"] }),
      mocks.makeFolder({ id: "copy-1", characterId: "agent-b", folderPath: "C:/repo", displayName: "old-name", recursive: true, includeExtensions: ["ts"], inheritedFromWorkflowId: "wf-1", inheritedFromAgentId: "agent-a" })
    );

    await propagateWorkflowFolderChange("agent-a", { type: "updated", folderId: "folder-a" });

    const copy = mocks.state.folders.find((row) => row.id === "copy-1");
    expect(copy?.displayName).toBe("new-name");
    expect(copy?.recursive).toBe(false);
    expect(copy?.includeExtensions).toEqual(["md"]);
    expect(mocks.state.notifications).toContainEqual({
      characterId: "agent-b",
      event: { type: "updated", folderId: "copy-1" },
    });
    expect(mocks.refreshWorkflowSharedResources).toHaveBeenCalledWith("wf-1", "agent-a", mocks.getWorkflowById);
  });

  it("registers a single folder-change listener once", async () => {
    registerWorkflowFolderPropagation();
    registerWorkflowFolderPropagation();

    expect(mocks.folderEventListeners).toHaveLength(1);
  });
});
