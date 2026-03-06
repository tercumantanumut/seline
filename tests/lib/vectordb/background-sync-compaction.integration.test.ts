import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  syncStaleFolders: vi.fn(),
  restartAllWatchers: vi.fn(),
  recoverStuckSyncingFolders: vi.fn(),
  getAllSyncFolders: vi.fn(),
  cleanupOrphanedVectorTables: vi.fn(),
  isDangerousPath: vi.fn(),
  stopAllWatchers: vi.fn(),
  compactAllAgentTables: vi.fn(),
  dbUpdateWhere: vi.fn(),
  dbUpdateSet: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock("@/lib/settings/settings-manager", () => ({
  getSetting: mocks.getSetting,
}));

vi.mock("@/lib/vectordb/sync-service", () => ({
  syncStaleFolders: mocks.syncStaleFolders,
  restartAllWatchers: mocks.restartAllWatchers,
  recoverStuckSyncingFolders: mocks.recoverStuckSyncingFolders,
  getAllSyncFolders: mocks.getAllSyncFolders,
  cleanupOrphanedVectorTables: mocks.cleanupOrphanedVectorTables,
}));

vi.mock("@/lib/vectordb/dangerous-paths", () => ({
  isDangerousPath: mocks.isDangerousPath,
}));

vi.mock("@/lib/vectordb/sync-mode-resolver", () => ({
  resolveFolderSyncBehavior: vi.fn(() => ({
    syncMode: "auto",
    allowsWatcherEvents: true,
  })),
  shouldRunForTrigger: vi.fn(() => true),
}));

vi.mock("@/lib/db/sqlite-client", () => ({
  db: {
    update: mocks.dbUpdate,
  },
}));

vi.mock("@/lib/db/sqlite-character-schema", () => ({
  agentSyncFolders: {
    id: "id-column",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq-condition"),
}));

vi.mock("@/lib/vectordb/file-watcher", () => ({
  stopAllWatchers: mocks.stopAllWatchers,
}));

vi.mock("@/lib/vectordb/collections", () => ({
  compactAllAgentTables: mocks.compactAllAgentTables,
}));

describe("initializeVectorSync integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete (globalThis as { vectorSyncInitialized?: boolean }).vectorSyncInitialized;
    delete (globalThis as { vectorSyncIntervalId?: NodeJS.Timeout | null }).vectorSyncIntervalId;

    mocks.getSetting.mockImplementation((key: string) => {
      if (key === "vectorAutoSyncEnabled") {
        return false;
      }
      return undefined;
    });

    mocks.syncStaleFolders.mockResolvedValue([]);
    mocks.restartAllWatchers.mockResolvedValue(undefined);
    mocks.recoverStuckSyncingFolders.mockResolvedValue(0);
    mocks.getAllSyncFolders.mockResolvedValue([]);
    mocks.cleanupOrphanedVectorTables.mockResolvedValue(undefined);
    mocks.isDangerousPath.mockReturnValue(null);
    mocks.stopAllWatchers.mockResolvedValue(undefined);
    mocks.compactAllAgentTables.mockResolvedValue({
      tablesCompacted: 1,
      totalFragmentsRemoved: 9,
    });

    mocks.dbUpdateWhere.mockResolvedValue(undefined);
    mocks.dbUpdateSet.mockReturnValue({ where: mocks.dbUpdateWhere });
    mocks.dbUpdate.mockReturnValue({ set: mocks.dbUpdateSet });
  });

  it("starts compaction in fire-and-forget mode during initialization", async () => {
    let resolveCompaction: (() => void) | null = null;
    const compactionPromise = new Promise<void>((resolve) => {
      resolveCompaction = resolve;
    });
    mocks.compactAllAgentTables.mockReturnValue(compactionPromise);

    const { initializeVectorSync } = await import("@/lib/vectordb/background-sync");

    await initializeVectorSync();
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(mocks.recoverStuckSyncingFolders).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupOrphanedVectorTables).toHaveBeenCalledTimes(1);
    expect(mocks.restartAllWatchers).toHaveBeenCalledTimes(1);
    expect(mocks.compactAllAgentTables).toHaveBeenCalledTimes(1);

    resolveCompaction?.();
    await compactionPromise;
  });

  it("does not fail initialization when compaction rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.compactAllAgentTables.mockRejectedValue(new Error("compaction failed"));

    const { initializeVectorSync } = await import("@/lib/vectordb/background-sync");

    await expect(initializeVectorSync()).resolves.toBeUndefined();
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(errorSpy).toHaveBeenCalledWith(
      "[BackgroundSync] LanceDB compaction error:",
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });
});
