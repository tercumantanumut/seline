import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createReadFileTool } from "@/lib/ai/tools/read-file-tool";
import { readFile, open } from "fs/promises";
import { isPathAllowed, resolveWorkspaceAwarePaths } from "@/lib/ai/filesystem";

// Mock dependencies
vi.mock("fs/promises");
vi.mock("@/lib/ai/filesystem");
vi.mock("@/lib/db/queries", () => ({
  findAgentDocumentByName: vi.fn(),
  getAgentDocumentChunksByDocumentId: vi.fn(),
}));
vi.mock("better-sqlite3", () => ({
  default: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/db/sqlite-client", () => ({
  db: {},
}));

describe("readFile Tool", () => {
  const mockSessionId = "session-123";
  const mockCharacterId = "char-123";
  const mockUserId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    (resolveWorkspaceAwarePaths as any).mockResolvedValue(["/mock/root"]);
    (isPathAllowed as any).mockResolvedValue("/mock/root/file.txt");
  });

  it("should expose provider-compatible object schema without root oneOf/anyOf", () => {
    const tool = createReadFileTool({
      sessionId: mockSessionId,
      characterId: mockCharacterId,
      userId: mockUserId,
    });

    const schema = (tool.inputSchema as any)?.jsonSchema ?? (tool.inputSchema as any);
    expect(schema?.type).toBe("object");
    expect(schema?.oneOf).toBeUndefined();
    expect(schema?.anyOf).toBeUndefined();
  });

  it("should read a text file successfully", async () => {
    const tool = createReadFileTool({ sessionId: mockSessionId, characterId: mockCharacterId, userId: mockUserId });
    
    // Mock text file content
    (readFile as any).mockResolvedValue("line1\nline2\nline3");
    // Mock open for binary check (return non-binary)
    const mockFileHandle = {
      read: vi.fn().mockImplementation((buf) => {
        const content = Buffer.from("hello");
        content.copy(buf);
        return { bytesRead: content.length, buffer: buf };
      }),
      close: vi.fn(),
    };
    (open as any).mockResolvedValue(mockFileHandle);

    const result = await tool.execute({ filePath: "file.txt" });

    expect(result.status).toBe("success");
    expect(result.content).toContain("line1");
    expect(result.totalLines).toBe(3);
  });

  it("should reject binary files", async () => {
    const tool = createReadFileTool({ sessionId: mockSessionId, characterId: mockCharacterId, userId: mockUserId });

    // Mock binary file check (return null byte)
    const buffer = Buffer.alloc(10);
    buffer[0] = 0; // Null byte
    const mockFileHandle = {
      read: vi.fn().mockResolvedValue({ bytesRead: 1, buffer }),
      close: vi.fn(),
    };
    (open as any).mockResolvedValue(mockFileHandle);

    const result = await tool.execute({ filePath: "binary.bin" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("appears to be binary");
  });

  it("should support 'head' parameter", async () => {
    const tool = createReadFileTool({ sessionId: mockSessionId, characterId: mockCharacterId, userId: mockUserId });
    
    (readFile as any).mockResolvedValue("1\n2\n3\n4\n5");
    // Mock non-binary
    const mockFileHandle = {
      read: vi.fn().mockImplementation((buf) => {
        const content = Buffer.from("hello");
        content.copy(buf);
        return { bytesRead: content.length, buffer: buf };
      }),
      close: vi.fn(),
    };
    (open as any).mockResolvedValue(mockFileHandle);

    const result = await tool.execute({ filePath: "file.txt", head: 2 });

    expect(result.status).toBe("success");
    expect(result.content).toContain("1");
    expect(result.content).toContain("2");
    expect(result.content).not.toContain("3");
    expect(result.lineRange).toBe("1-2");
  });

  it("should support 'tail' parameter", async () => {
    const tool = createReadFileTool({ sessionId: mockSessionId, characterId: mockCharacterId, userId: mockUserId });
    
    (readFile as any).mockResolvedValue("1\n2\n3\n4\n5");
    // Mock non-binary
    const mockFileHandle = {
      read: vi.fn().mockImplementation((buf) => {
        const content = Buffer.from("hello");
        content.copy(buf);
        return { bytesRead: content.length, buffer: buf };
      }),
      close: vi.fn(),
    };
    (open as any).mockResolvedValue(mockFileHandle);

    const result = await tool.execute({ filePath: "file.txt", tail: 2 });

    expect(result.status).toBe("success");
    expect(result.content).toContain("4");
    expect(result.content).toContain("5");
    expect(result.content).not.toContain("3");
    expect(result.lineRange).toBe("4-5");
  });

  it("should reject mixed range and head/tail selectors", async () => {
    const tool = createReadFileTool({ sessionId: mockSessionId, characterId: mockCharacterId, userId: mockUserId });

    const result = await tool.execute({
      filePath: "file.txt",
      startLine: 10,
      endLine: 20,
      head: 5,
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("Cannot specify both head/tail and startLine/endLine parameters");
  });

  it("should reject startLine less than 1", async () => {
    const tool = createReadFileTool({ sessionId: mockSessionId, characterId: mockCharacterId, userId: mockUserId });

    const result = await tool.execute({
      filePath: "file.txt",
      startLine: 0,
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("Invalid startLine");
  });

  it("should reject endLine lower than startLine", async () => {
    const tool = createReadFileTool({ sessionId: mockSessionId, characterId: mockCharacterId, userId: mockUserId });

    const result = await tool.execute({
      filePath: "file.txt",
      startLine: 20,
      endLine: 10,
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("must be >= startLine");
  });
});
