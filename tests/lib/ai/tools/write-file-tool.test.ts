import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoist all mocks
const syncServiceMocks = vi.hoisted(() => ({
  getSyncFolders: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
}));

const diagnosticsMocks = vi.hoisted(() => ({
  runPostWriteDiagnostics: vi.fn(),
}));

vi.mock("@/lib/vectordb/sync-service", () => ({
  getSyncFolders: syncServiceMocks.getSyncFolders,
}));

vi.mock("@/lib/db/sqlite-client", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/db/sqlite-character-schema", () => ({
  agentSyncFiles: {
    characterId: "characterId",
    relativePath: "relativePath",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  like: vi.fn(),
  and: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  readFile: fsMocks.readFile,
  writeFile: fsMocks.writeFile,
  access: fsMocks.access,
  stat: fsMocks.stat,
  mkdir: fsMocks.mkdir,
}));

vi.mock("@/lib/ai/filesystem/diagnostics", () => ({
  runPostWriteDiagnostics: diagnosticsMocks.runPostWriteDiagnostics,
}));

import { createWriteFileTool } from "@/lib/ai/tools/write-file-tool";
import { recordFileRead } from "@/lib/ai/filesystem/file-history";

describe("write-file-tool", () => {
  const SESSION_ID = "test-session-write-" + Date.now();
  const CHAR_ID = "char-456";
  const FOLDER = "/home/user/workspace";
  const FILE = "/home/user/workspace/src/new-file.ts";

  beforeEach(() => {
    vi.clearAllMocks();

    syncServiceMocks.getSyncFolders.mockResolvedValue([
      { folderPath: FOLDER },
    ]);

    fsMocks.stat.mockResolvedValue({ mtimeMs: 0 }); // Not stale
    diagnosticsMocks.runPostWriteDiagnostics.mockResolvedValue(null);
  });

  function createTool() {
    return createWriteFileTool({ sessionId: SESSION_ID, characterId: CHAR_ID });
  }

  describe("security", () => {
    it("rejects paths outside synced folders", async () => {
      const tool = createTool();
      const result = await tool.execute(
        { filePath: "/etc/shadow", content: "malicious" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("not within any synced folder");
    });

    it("returns error when no character context", async () => {
      const tool = createWriteFileTool({ sessionId: SESSION_ID, characterId: null });
      const result = await tool.execute(
        { filePath: FILE, content: "test" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("No agent context");
    });
  });

  describe("create new file", () => {
    it("creates a new file when it does not exist", async () => {
      fsMocks.access.mockRejectedValue(new Error("ENOENT"));
      fsMocks.writeFile.mockResolvedValue(undefined);
      fsMocks.mkdir.mockResolvedValue(undefined);

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, content: "const x = 1;\nconst y = 2;\n" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("success");
      expect(result.created).toBe(true);
      expect(result.lineCount).toBe(3);
    });
  });

  describe("overwrite existing file", () => {
    it("overwrites an existing file that was previously read", async () => {
      fsMocks.access.mockResolvedValue(undefined); // File exists
      fsMocks.readFile.mockResolvedValue("old content");
      fsMocks.writeFile.mockResolvedValue(undefined);

      recordFileRead(SESSION_ID, FILE);

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, content: "new content" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("success");
    });

    it("rejects no-op writes (identical content)", async () => {
      fsMocks.access.mockResolvedValue(undefined);
      fsMocks.readFile.mockResolvedValue("same content");

      recordFileRead(SESSION_ID, FILE);

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, content: "same content" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("identical");
    });
  });

  describe("size limits", () => {
    it("rejects content exceeding 1MB", async () => {
      fsMocks.access.mockRejectedValue(new Error("ENOENT"));
      fsMocks.mkdir.mockResolvedValue(undefined);

      const tool = createTool();
      const bigContent = "x".repeat(1024 * 1024 + 1); // Just over 1MB
      const result = await tool.execute(
        { filePath: FILE, content: bigContent },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("1024KB");
    });
  });
});
