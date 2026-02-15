import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";

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

import { createEditFileTool } from "@/lib/ai/tools/edit-file-tool";
import { recordFileRead } from "@/lib/ai/filesystem/file-history";

describe("edit-file-tool", () => {
  const SESSION_ID = "test-session-edit-" + Date.now();
  const CHAR_ID = "char-123";
  
  // Use platform-specific paths
  const FOLDER = path.resolve(process.cwd(), "test-workspace");
  const FILE = path.join(FOLDER, "src", "index.ts");

  beforeEach(() => {
    vi.clearAllMocks();

    syncServiceMocks.getSyncFolders.mockResolvedValue([
      { folderPath: FOLDER },
    ]);

    fsMocks.stat.mockResolvedValue({ mtimeMs: 0 }); // Not stale
    diagnosticsMocks.runPostWriteDiagnostics.mockResolvedValue(null);
  });

  function createTool() {
    return createEditFileTool({ sessionId: SESSION_ID, characterId: CHAR_ID });
  }

  describe("security", () => {
    it("rejects paths outside synced folders", async () => {
      const tool = createTool();
      const outsidePath = path.resolve(process.cwd(), "outside", "passwd");
      const result = await tool.execute(
        { filePath: outsidePath, oldString: "root", newString: "hacked" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("not within any synced folder");
    });

    it("rejects path traversal attacks", async () => {
      const tool = createTool();
      const traversalPath = path.join(FOLDER, "..", "..", "etc", "passwd");
      const result = await tool.execute(
        { filePath: traversalPath, oldString: "root", newString: "hacked" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("not within any synced folder");
    });

    it("returns error when no character context", async () => {
      const tool = createEditFileTool({ sessionId: SESSION_ID, characterId: null });
      const result = await tool.execute(
        { filePath: FILE, oldString: "old", newString: "new" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("No agent context");
    });
  });

  describe("edit mode", () => {
    it("requires file to be read first", async () => {
      const tool = createTool();
      // Don't call recordFileRead
      const result = await tool.execute(
        { filePath: FILE, oldString: "old code", newString: "new code" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("must read");
    });

    it("requires oldString to appear exactly once", async () => {
      recordFileRead(SESSION_ID, FILE);
      fsMocks.readFile.mockResolvedValue("hello world hello world");

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, oldString: "hello", newString: "bye" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("appears 2 times");
    });

    it("returns error when oldString not found", async () => {
      recordFileRead(SESSION_ID, FILE);
      fsMocks.readFile.mockResolvedValue("hello world");

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, oldString: "goodbye", newString: "hi" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("not found");
    });

    it("rejects no-op edits", async () => {
      recordFileRead(SESSION_ID, FILE);
      fsMocks.readFile.mockResolvedValue("hello world");

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, oldString: "hello", newString: "hello" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("identical");
    });

    it("successfully edits when oldString is unique", async () => {
      recordFileRead(SESSION_ID, FILE);
      fsMocks.readFile.mockResolvedValue("const x = 1;\nconst y = 2;\n");
      fsMocks.writeFile.mockResolvedValue(undefined);

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, oldString: "const x = 1;", newString: "const x = 42;" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("success");
      expect(result.filePath).toBe(FILE);
      expect(result.diff).toContain("--- index.ts");
      expect(result.diff).toContain("+++ index.ts");
      expect(result.diff).toContain("- const x = 1;");
      expect(result.diff).toContain("+ const x = 42;");
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        FILE,
        "const x = 42;\nconst y = 2;\n",
        "utf-8"
      );
    });
  });

  describe("create mode", () => {
    it("creates a new file when oldString is empty", async () => {
      fsMocks.access.mockRejectedValue(new Error("ENOENT")); // File doesn't exist
      fsMocks.writeFile.mockResolvedValue(undefined);
      fsMocks.mkdir.mockResolvedValue(undefined);

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, oldString: "", newString: "// new file content\n" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("created");
      expect(result.filePath).toBe(FILE);
      expect(result.diff).toContain("--- index.ts");
      expect(result.diff).toContain("+++ index.ts");
      expect(result.diff).toContain("+ // new file content");
    });

    it("rejects creation when file already exists", async () => {
      fsMocks.access.mockResolvedValue(undefined); // File exists

      const tool = createTool();
      const result = await tool.execute(
        { filePath: FILE, oldString: "", newString: "content" },
        { toolCallId: "tc-1", messages: [], abortSignal: new AbortController().signal }
      );
      expect(result.status).toBe("error");
      expect(result.error).toContain("already exists");
    });
  });
});
