import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vectordb/search", () => ({
  searchVectorDB: vi.fn(),
}));

vi.mock("@/lib/vectordb/client", () => ({
  getLanceDB: vi.fn(),
}));

vi.mock("@/lib/vectordb/collections", () => ({
  getAgentTableName: vi.fn(() => "agent_test"),
}));

import { searchVectorDB } from "@/lib/vectordb/search";
import { getLanceDB } from "@/lib/vectordb/client";
import { hybridSearchV2 } from "@/lib/vectordb/v2/hybrid-search";
import { resetVectorSearchConfig, updateVectorSearchConfig } from "@/lib/config/vector-search";

const searchVectorDBMock = vi.mocked(searchVectorDB);
const getLanceDBMock = vi.mocked(getLanceDB);

describe("hybridSearchV2", () => {
  beforeEach(() => {
    resetVectorSearchConfig();
    searchVectorDBMock.mockReset();
    getLanceDBMock.mockReset();
  });

  it("should fall back to V1 search when hybrid is disabled", async () => {
    updateVectorSearchConfig({ enableHybridSearch: false, searchMode: "semantic" });

    searchVectorDBMock.mockResolvedValue([
      {
        id: "dense",
        score: 0.8,
        text: "dense hit",
        filePath: "a.ts",
        relativePath: "a.ts",
        chunkIndex: 0,
        folderId: "folder",
      },
    ]);

    const results = await hybridSearchV2({
      characterId: "agent",
      query: "test",
      options: { topK: 5 },
    });

    expect(searchVectorDBMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("dense");
  });

  it("should fuse dense and lexical results when enabled", async () => {
    updateVectorSearchConfig({
      enableHybridSearch: true,
      searchMode: "hybrid",
      enableQueryExpansion: false,
      enableReranking: false,
    });

    searchVectorDBMock.mockResolvedValue([
      {
        id: "dense",
        score: 0.8,
        text: "dense hit",
        filePath: "a.ts",
        relativePath: "a.ts",
        chunkIndex: 0,
        folderId: "folder",
      },
    ]);

    const mockChain = {
      column: vi.fn(),
      distanceType: vi.fn(),
      limit: vi.fn(),
      where: vi.fn(),
      toArray: vi.fn(),
    };

    mockChain.column.mockReturnValue(mockChain);
    mockChain.distanceType.mockReturnValue(mockChain);
    mockChain.limit.mockReturnValue(mockChain);
    mockChain.where.mockReturnValue(mockChain);
    mockChain.toArray.mockResolvedValue([
      {
        id: "lexical",
        text: "lexical hit",
        filePath: "b.ts",
        relativePath: "b.ts",
        chunkIndex: 1,
        folderId: "folder",
        _distance: 0.1,
      },
    ]);

    const mockTable = {
      vectorSearch: vi.fn().mockReturnValue(mockChain),
      schema: vi.fn().mockResolvedValue({
        fields: [{ name: "lexicalVector" }],
      }),
    };

    const mockDb = {
      tableNames: vi.fn().mockResolvedValue(["agent_test"]),
      openTable: vi.fn().mockResolvedValue(mockTable),
    };

    getLanceDBMock.mockResolvedValue(mockDb as never);

    const results = await hybridSearchV2({
      characterId: "agent",
      query: "getUserById",
      options: { topK: 2 },
    });

    expect(results).toHaveLength(2);
    const ids = results.map((result) => result.id);
    expect(ids).toEqual(expect.arrayContaining(["dense", "lexical"]));
  });
});
