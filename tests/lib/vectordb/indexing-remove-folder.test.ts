import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLanceDB: vi.fn(),
}));

vi.mock("@/lib/vectordb/client", () => ({
  getLanceDB: mocks.getLanceDB,
}));

vi.mock("@/lib/vectordb/collections", async () => {
  const actual = await vi.importActual<typeof import("@/lib/vectordb/collections")>("@/lib/vectordb/collections");
  return {
    ...actual,
    ensureAgentTable: vi.fn(),
  };
});

vi.mock("@/lib/ai/providers", () => ({
  getEmbeddingModel: vi.fn(),
  getEmbeddingModelId: vi.fn(() => "test-model"),
}));

vi.mock("@/lib/ai/embedding-utils", () => ({
  normalizeEmbeddings: vi.fn((embeddings: number[][]) => embeddings),
}));

vi.mock("@/lib/documents/chunking", () => ({
  chunkText: vi.fn(() => []),
}));

vi.mock("@/lib/documents/v2/token-chunking", () => ({
  chunkByTokens: vi.fn(() => []),
}));

vi.mock("@/lib/documents/parser", () => ({
  extractTextFromDocument: vi.fn(),
}));

vi.mock("@/lib/vectordb/v2/lexical-vectors", () => ({
  generateLexicalVector: vi.fn(() => []),
}));

vi.mock("@/lib/config/vector-search", () => ({
  getVectorSearchConfig: vi.fn(() => ({
    enableTokenChunking: false,
    enableHybridSearch: false,
    chunkingStrategy: "character",
    maxChunksPerFile: 0,
    tokenChunkSize: 256,
    tokenChunkStride: 128,
    embeddingBatchSize: 16,
  })),
}));

vi.mock("@/lib/settings/settings-manager", () => ({
  loadSettings: vi.fn(() => ({ embeddingProvider: "openrouter" })),
}));

vi.mock("ai", () => ({
  embedMany: vi.fn(),
}));

import { removeFolderFromVectorDB } from "@/lib/vectordb/indexing";

describe("removeFolderFromVectorDB", () => {
  const deleteMock = vi.fn();
  const openTableMock = vi.fn();
  const tableNamesMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    deleteMock.mockResolvedValue(undefined);
    openTableMock.mockResolvedValue({ delete: deleteMock });
    tableNamesMock.mockResolvedValue(["agent_char_1"]);

    mocks.getLanceDB.mockResolvedValue({
      tableNames: tableNamesMock,
      openTable: openTableMock,
    });
  });

  it("uses quoted folderId column in delete filter", async () => {
    await removeFolderFromVectorDB({
      characterId: "char-1",
      folderId: "folder-abc",
    });

    expect(openTableMock).toHaveBeenCalledWith("agent_char_1");
    expect(deleteMock).toHaveBeenCalledWith("\"folderId\" = 'folder-abc'");
  });

  it("skips delete when table does not exist", async () => {
    tableNamesMock.mockResolvedValue(["agent_other"]);

    await removeFolderFromVectorDB({
      characterId: "char-1",
      folderId: "folder-abc",
    });

    expect(openTableMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
