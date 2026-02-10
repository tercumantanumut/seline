import { describe, expect, it, vi } from "vitest";

// Mock DB-dependent imports to prevent better-sqlite3 from loading
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

vi.mock("@/lib/vectordb/sync-service", () => ({
  getSyncFolders: vi.fn(),
}));

import { isPathAllowed } from "@/lib/ai/filesystem/path-utils";

describe("isPathAllowed", () => {
  const allowedFolders = ["/home/user/workspace", "/tmp/project"];

  describe("absolute paths", () => {
    it("allows paths within a synced folder", () => {
      expect(isPathAllowed("/home/user/workspace/src/index.ts", allowedFolders))
        .toBe("/home/user/workspace/src/index.ts");
    });

    it("allows the folder root itself", () => {
      expect(isPathAllowed("/home/user/workspace", allowedFolders))
        .toBe("/home/user/workspace");
    });

    it("allows paths in any synced folder", () => {
      expect(isPathAllowed("/tmp/project/readme.md", allowedFolders))
        .toBe("/tmp/project/readme.md");
    });

    it("rejects paths outside all synced folders", () => {
      expect(isPathAllowed("/etc/passwd", allowedFolders)).toBeNull();
    });

    it("rejects paths that share a prefix but aren't inside the folder", () => {
      expect(isPathAllowed("/home/user/workspace-other/file.txt", allowedFolders)).toBeNull();
    });

    it("rejects path traversal attacks in absolute paths", () => {
      expect(isPathAllowed("/home/user/workspace/../../../etc/passwd", allowedFolders)).toBeNull();
    });
  });

  describe("relative paths", () => {
    it("resolves relative paths against synced folders", () => {
      const result = isPathAllowed("src/index.ts", allowedFolders);
      expect(result).toBe("/home/user/workspace/src/index.ts");
    });

    it("resolves simple file names", () => {
      const result = isPathAllowed("readme.md", allowedFolders);
      expect(result).toBe("/home/user/workspace/readme.md");
    });

    it("blocks path traversal via relative paths", () => {
      expect(isPathAllowed("../../etc/passwd", allowedFolders)).toBeNull();
    });

    it("blocks path traversal with nested traversal", () => {
      expect(isPathAllowed("src/../../../etc/passwd", allowedFolders)).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns null for empty allowed folders", () => {
      expect(isPathAllowed("/any/path", [])).toBeNull();
    });

    it("handles paths with double slashes", () => {
      const result = isPathAllowed("/home/user/workspace//src//file.ts", allowedFolders);
      // normalize() handles double slashes
      expect(result).not.toBeNull();
    });
  });
});
