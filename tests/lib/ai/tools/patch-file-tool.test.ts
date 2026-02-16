import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";

const syncServiceMocks = vi.hoisted(() => ({
  getSyncFolders: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  realpath: vi.fn(),
  rename: vi.fn(),
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
  unlink: fsMocks.unlink,
  stat: fsMocks.stat,
  mkdir: fsMocks.mkdir,
  realpath: fsMocks.realpath,
  rename: fsMocks.rename,
}));

vi.mock("@/lib/ai/filesystem/diagnostics", () => ({
  runPostWriteDiagnostics: diagnosticsMocks.runPostWriteDiagnostics,
}));

import { createPatchFileTool } from "@/lib/ai/tools/patch-file-tool";
import { recordFileRead } from "@/lib/ai/filesystem/file-history";

describe("patch-file-tool", () => {
  const SESSION_ID = "test-session-patch-" + Date.now();
  const CHAR_ID = "char-789";

  const FOLDER = path.resolve(process.cwd(), "test-workspace");
  const UPDATE_FILE = path.join(FOLDER, "src", "index.ts");
  const CREATE_FILE = path.join(FOLDER, "src", "new-file.ts");

  beforeEach(() => {
    vi.clearAllMocks();

    syncServiceMocks.getSyncFolders.mockResolvedValue([{ folderPath: FOLDER }]);
    fsMocks.stat.mockResolvedValue({ mtimeMs: 0 });
    fsMocks.realpath.mockImplementation((path: string) => Promise.resolve(path)); // Mock realpath to return the path as-is
    diagnosticsMocks.runPostWriteDiagnostics.mockResolvedValue(null);
  });

  function createTool() {
    return createPatchFileTool({ sessionId: SESSION_ID, characterId: CHAR_ID });
  }

  it("returns diff for update operation", async () => {
    fsMocks.access.mockResolvedValue(undefined);
    fsMocks.readFile.mockResolvedValue("const x = 1;\nconst y = 2;\n");
    fsMocks.writeFile.mockResolvedValue(undefined);

    recordFileRead(SESSION_ID, UPDATE_FILE);

    const tool = createTool();
    const result = await tool.execute(
      {
        operations: [
          {
            action: "update",
            filePath: UPDATE_FILE,
            oldString: "const x = 1;",
            newString: "const x = 42;",
          },
        ],
      },
      {
        toolCallId: "tc-1",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    expect(result.status).toBe("success");
    expect(result.operations?.[0].diff).toContain("--- index.ts");
    expect(result.operations?.[0].diff).toContain("+++ index.ts");
    expect(result.operations?.[0].diff).toContain("- const x = 1;");
    expect(result.operations?.[0].diff).toContain("+ const x = 42;");
  });

  it("returns diff for create operation", async () => {
    fsMocks.access.mockRejectedValue(new Error("ENOENT"));
    fsMocks.writeFile.mockResolvedValue(undefined);
    fsMocks.mkdir.mockResolvedValue(undefined);

    const tool = createTool();
    const result = await tool.execute(
      {
        operations: [
          {
            action: "create",
            filePath: CREATE_FILE,
            newString: "const created = true;\n",
          },
        ],
      },
      {
        toolCallId: "tc-2",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    expect(result.status).toBe("success");
    expect(result.operations?.[0].diff).toContain("--- new-file.ts");
    expect(result.operations?.[0].diff).toContain("+++ new-file.ts");
    expect(result.operations?.[0].diff).toContain("+ const created = true;");
  });
});
