import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateSyncFolderPath: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock("@/lib/vectordb/file-watcher", () => ({
  startWatching: vi.fn(),
  isWatching: vi.fn(() => false),
}));

vi.mock("@/lib/vectordb/path-validation", () => ({
  normalizeFolderPath: (folderPath: string) => folderPath,
  validateSyncFolderPath: mocks.validateSyncFolderPath,
}));

vi.mock("@/lib/vectordb/sync-mode-resolver", () => ({
  resolveFolderSyncBehavior: vi.fn(() => ({
    syncMode: "auto",
    allowsWatcherEvents: true,
  })),
  shouldRunForTrigger: vi.fn(() => true),
}));

vi.mock("@/lib/vectordb/sync-helpers", () => ({
  parseJsonArray: vi.fn(() => []),
  normalizeExtensions: vi.fn((extensions: string[]) => extensions),
}));

vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
  or: mocks.or,
}));

vi.mock("@/lib/db/sqlite-client", () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}));

vi.mock("@/lib/db/sqlite-character-schema", () => ({
  agentSyncFolders: {
    id: "id-column",
    status: "status-column",
  },
}));

import { recoverStuckSyncingFolders, syncingFolders } from "@/lib/vectordb/sync-scheduler";

describe("recoverStuckSyncingFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncingFolders.clear();

    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.select.mockReturnValue({ from: mocks.selectFrom });

    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.update.mockReturnValue({ set: mocks.updateSet });

    mocks.selectWhere.mockResolvedValue([]);
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.validateSyncFolderPath.mockResolvedValue({
      normalizedPath: "/safe/path",
      error: null,
    });
  });

  it("recovers an orphaned syncing folder immediately even when updatedAt is recent", async () => {
    const recentTimestamp = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago

    mocks.selectWhere.mockResolvedValue([
      {
        id: "folder-1",
        folderPath: "/repo",
        status: "syncing",
        fileCount: 3,
        updatedAt: recentTimestamp,
        createdAt: recentTimestamp,
      },
    ]);

    const recovered = await recoverStuckSyncingFolders();

    expect(recovered).toBe(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "synced",
        lastError: null,
      })
    );
    expect(mocks.validateSyncFolderPath).toHaveBeenCalledWith("/repo");
  });

  it("does not recover a folder actively tracked in memory", async () => {
    const staleTimestamp = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    mocks.selectWhere.mockResolvedValue([
      {
        id: "folder-2",
        folderPath: "/repo-2",
        status: "syncing",
        fileCount: 2,
        updatedAt: staleTimestamp,
        createdAt: staleTimestamp,
      },
    ]);

    syncingFolders.add("folder-2");

    const recovered = await recoverStuckSyncingFolders();

    expect(recovered).toBe(0);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.validateSyncFolderPath).not.toHaveBeenCalled();
  });

  it("marks recovered folders as paused when path validation fails", async () => {
    const recentTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    mocks.selectWhere.mockResolvedValue([
      {
        id: "folder-3",
        folderPath: "/blocked",
        status: "syncing",
        fileCount: 9,
        updatedAt: recentTimestamp,
        createdAt: recentTimestamp,
      },
    ]);
    mocks.validateSyncFolderPath.mockResolvedValue({
      normalizedPath: "/blocked",
      error: "Path is dangerous",
    });

    const recovered = await recoverStuckSyncingFolders();

    expect(recovered).toBe(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paused",
        lastError: "Paused: Path is dangerous",
      })
    );
  });
});
