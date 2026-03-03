import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLanceDB: vi.fn(),
}));

vi.mock("@/lib/vectordb/client", () => ({
  getLanceDB: mocks.getLanceDB,
}));

vi.mock("@/lib/config/vector-search", () => ({
  getVectorSearchConfig: vi.fn(() => ({
    enableHybridSearch: false,
    enableTokenChunking: false,
  })),
}));

vi.mock("@/lib/vectordb/v2/lexical-vectors", () => ({
  LEX_DIM: 64,
}));

import { compactAgentTable, compactAllAgentTables } from "@/lib/vectordb/collections";

describe("LanceDB compaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when VectorDB is not available", async () => {
    mocks.getLanceDB.mockResolvedValue(null);

    const result = await compactAgentTable("char-1");

    expect(result).toBeNull();
  });

  it("returns non-compacted result when table does not exist", async () => {
    mocks.getLanceDB.mockResolvedValue({
      tableNames: vi.fn().mockResolvedValue(["agent_other"]),
      openTable: vi.fn(),
    });

    const result = await compactAgentTable("char-1");

    expect(result).toEqual({
      compacted: false,
      fragmentsRemoved: 0,
      fragmentsAdded: 0,
    });
  });

  it("compacts an existing table via optimize", async () => {
    const optimizeMock = vi.fn().mockResolvedValue({
      compaction: { fragmentsRemoved: 17, fragmentsAdded: 1 },
    });

    const openTableMock = vi.fn().mockResolvedValue({ optimize: optimizeMock });

    mocks.getLanceDB.mockResolvedValue({
      tableNames: vi.fn().mockResolvedValue(["agent_char_1"]),
      openTable: openTableMock,
    });

    const result = await compactAgentTable("char-1");

    expect(openTableMock).toHaveBeenCalledWith("agent_char_1");
    expect(optimizeMock).toHaveBeenCalledWith({
      cleanupOlderThan: expect.any(Date),
    });
    expect(result).toEqual({
      compacted: true,
      fragmentsRemoved: 17,
      fragmentsAdded: 1,
    });
  });

  it("aggregates compaction across all agent tables", async () => {
    const optimizeA = vi.fn().mockResolvedValue({
      compaction: { fragmentsRemoved: 10, fragmentsAdded: 1 },
    });
    const optimizeB = vi.fn().mockResolvedValue({
      compaction: { fragmentsRemoved: 4, fragmentsAdded: 1 },
    });

    const db = {
      tableNames: vi.fn().mockResolvedValue(["agent_char_1", "agent_char_2"]),
      openTable: vi.fn(async (tableName: string) => {
        if (tableName === "agent_char_1") return { optimize: optimizeA };
        return { optimize: optimizeB };
      }),
    };
    mocks.getLanceDB.mockResolvedValue(db);

    const summary = await compactAllAgentTables();

    expect(summary).toEqual({
      tablesCompacted: 2,
      totalFragmentsRemoved: 14,
    });
  });
});
