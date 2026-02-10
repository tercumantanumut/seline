import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs/promises.stat for isFileStale tests
const fsMocks = vi.hoisted(() => ({
  stat: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  stat: fsMocks.stat,
}));

import {
  recordFileRead,
  recordFileWrite,
  getLastReadTime,
  getLastWriteTime,
  wasFileReadBefore,
  isFileStale,
} from "@/lib/ai/filesystem/file-history";

describe("file-history", () => {
  const SESSION = "test-session-" + Date.now();
  const FILE = "/home/user/workspace/test.ts";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordFileRead / getLastReadTime", () => {
    it("returns null for a file never read", () => {
      expect(getLastReadTime(SESSION + "-never", FILE)).toBeNull();
    });

    it("records and retrieves read time", () => {
      const before = Date.now();
      recordFileRead(SESSION, FILE);
      const readTime = getLastReadTime(SESSION, FILE);
      expect(readTime).not.toBeNull();
      expect(readTime!).toBeGreaterThanOrEqual(before);
      expect(readTime!).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("recordFileWrite / getLastWriteTime", () => {
    it("returns null for a file never written", () => {
      expect(getLastWriteTime(SESSION + "-never", FILE)).toBeNull();
    });

    it("records and retrieves write time", () => {
      const before = Date.now();
      recordFileWrite(SESSION, FILE);
      const writeTime = getLastWriteTime(SESSION, FILE);
      expect(writeTime).not.toBeNull();
      expect(writeTime!).toBeGreaterThanOrEqual(before);
    });
  });

  describe("wasFileReadBefore", () => {
    it("returns false for unread files", () => {
      expect(wasFileReadBefore(SESSION + "-unread", FILE)).toBe(false);
    });

    it("returns true after reading", () => {
      const s = SESSION + "-wasread";
      recordFileRead(s, FILE);
      expect(wasFileReadBefore(s, FILE)).toBe(true);
    });
  });

  describe("isFileStale", () => {
    it("returns false if file was never read", async () => {
      expect(await isFileStale(SESSION + "-stale-never", FILE)).toBe(false);
    });

    it("returns true if file mtime is newer than last read", async () => {
      const s = SESSION + "-stale-yes";
      recordFileRead(s, FILE);

      // Simulate file being modified after read
      fsMocks.stat.mockResolvedValue({ mtimeMs: Date.now() + 1000 });

      expect(await isFileStale(s, FILE)).toBe(true);
    });

    it("returns false if file mtime is older than last read", async () => {
      const s = SESSION + "-stale-no";
      recordFileRead(s, FILE);

      // Simulate file not being modified (mtime before read time)
      fsMocks.stat.mockResolvedValue({ mtimeMs: Date.now() - 10000 });

      expect(await isFileStale(s, FILE)).toBe(false);
    });

    it("returns false if stat fails (file deleted)", async () => {
      const s = SESSION + "-stale-err";
      recordFileRead(s, FILE);

      fsMocks.stat.mockRejectedValue(new Error("ENOENT"));

      expect(await isFileStale(s, FILE)).toBe(false);
    });
  });

  describe("session isolation", () => {
    it("different sessions have independent tracking", () => {
      const s1 = SESSION + "-iso1";
      const s2 = SESSION + "-iso2";

      recordFileRead(s1, FILE);
      expect(wasFileReadBefore(s1, FILE)).toBe(true);
      expect(wasFileReadBefore(s2, FILE)).toBe(false);
    });
  });
});
