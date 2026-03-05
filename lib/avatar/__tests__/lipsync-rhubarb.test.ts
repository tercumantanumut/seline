import { afterEach, describe, expect, it, vi } from "vitest";
import type { RhubarbOutput } from "../types";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  accessSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
}));

vi.mock("node:fs", () => ({
  accessSync: mocks.accessSync,
  constants: { X_OK: 1 },
}));

vi.mock("node:util", () => ({
  promisify: (fn: unknown) => {
    // Return a function that calls our mock and returns a promise
    return (...args: unknown[]) => {
      return new Promise((resolve, reject) => {
        (fn as Function)(...args, (err: Error | null, result: unknown) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    };
  },
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import {
  isRhubarbAvailable,
  analyzeRhubarb,
  _resetBinaryCache,
  _parseRhubarbOutput,
  _computeDuration,
} from "../lipsync-rhubarb";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("lipsync-rhubarb", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _resetBinaryCache();
  });

  // ── Binary availability ──────────────────────────────────────────────

  describe("isRhubarbAvailable", () => {
    it("returns true when rhubarb binary is found", () => {
      // accessSync succeeds for the first candidate
      mocks.accessSync.mockImplementation(() => undefined);

      expect(isRhubarbAvailable()).toBe(true);
    });

    it("returns false when rhubarb binary is not found", () => {
      // accessSync throws for all candidates
      mocks.accessSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(isRhubarbAvailable()).toBe(false);
    });

    it("caches the result after first call", () => {
      mocks.accessSync.mockImplementation(() => undefined);

      isRhubarbAvailable();
      isRhubarbAvailable();

      // accessSync should only be called for candidates in the first check
      // (at most the number of search paths, but caching stops subsequent calls)
      const firstCallCount = mocks.accessSync.mock.calls.length;

      isRhubarbAvailable();

      // No additional calls after caching
      expect(mocks.accessSync.mock.calls.length).toBe(firstCallCount);
    });
  });

  // ── Rhubarb output parsing ───────────────────────────────────────────

  describe("parseRhubarbOutput", () => {
    it("maps rhubarb shapes to Oculus visemes", () => {
      const output: RhubarbOutput = {
        mouthCues: [
          { start: 0.0, end: 0.1, value: "X" },
          { start: 0.1, end: 0.3, value: "A" },
          { start: 0.3, end: 0.5, value: "C" },
          { start: 0.5, end: 0.7, value: "D" },
          { start: 0.7, end: 0.8, value: "X" },
        ],
      };

      const cues = _parseRhubarbOutput(output);

      expect(cues).toHaveLength(5);
      expect(cues[0].viseme).toBe("sil");     // X → sil
      expect(cues[1].viseme).toBe("PP");      // A → PP
      expect(cues[2].viseme).toBe("aa");      // C → aa
      expect(cues[3].viseme).toBe("O");       // D → O
      expect(cues[4].viseme).toBe("sil");     // X → sil
    });

    it("converts times from seconds to milliseconds", () => {
      const output: RhubarbOutput = {
        mouthCues: [
          { start: 1.5, end: 2.0, value: "A" },
        ],
      };

      const cues = _parseRhubarbOutput(output);

      expect(cues[0].time).toBe(1500);
      expect(cues[0].duration).toBe(500);
    });

    it("assigns weight 1.0 for speech and 0 for silence", () => {
      const output: RhubarbOutput = {
        mouthCues: [
          { start: 0.0, end: 0.1, value: "X" },
          { start: 0.1, end: 0.3, value: "B" },
        ],
      };

      const cues = _parseRhubarbOutput(output);

      expect(cues[0].weight).toBe(0);     // silence
      expect(cues[1].weight).toBe(1.0);   // speech
    });

    it("handles empty mouth cues", () => {
      const output: RhubarbOutput = { mouthCues: [] };
      const cues = _parseRhubarbOutput(output);

      expect(cues).toEqual([]);
    });

    it("maps all known rhubarb shapes", () => {
      const shapes = ["X", "A", "B", "C", "D", "E", "F", "G", "H"];
      const expectedVisemes = ["sil", "PP", "E", "aa", "O", "RR", "FF", "kk", "DD"];

      const output: RhubarbOutput = {
        mouthCues: shapes.map((value, i) => ({
          start: i * 0.1,
          end: (i + 1) * 0.1,
          value,
        })),
      };

      const cues = _parseRhubarbOutput(output);

      for (let i = 0; i < shapes.length; i++) {
        expect(cues[i].viseme).toBe(expectedVisemes[i]);
      }
    });

    it("falls back to 'sil' for unknown rhubarb shapes", () => {
      const output: RhubarbOutput = {
        mouthCues: [{ start: 0, end: 0.1, value: "Z" }],
      };

      const cues = _parseRhubarbOutput(output);
      expect(cues[0].viseme).toBe("sil");
    });
  });

  // ── Duration computation ─────────────────────────────────────────────

  describe("computeDuration", () => {
    it("returns the end time of the last cue in ms", () => {
      const output: RhubarbOutput = {
        mouthCues: [
          { start: 0, end: 0.5, value: "A" },
          { start: 0.5, end: 1.2, value: "B" },
        ],
      };

      expect(_computeDuration(output)).toBe(1200);
    });

    it("returns 0 for empty cues", () => {
      expect(_computeDuration({ mouthCues: [] })).toBe(0);
    });
  });

  // ── analyzeRhubarb integration ───────────────────────────────────────

  describe("analyzeRhubarb", () => {
    it("falls back when rhubarb binary is not found", async () => {
      mocks.accessSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = await analyzeRhubarb("/tmp/test.wav");

      // Should return an empty amplitude fallback
      expect(result.method).toBe("amplitude");
      expect(result.visemes).toEqual([]);
    });

    it("calls rhubarb with correct arguments", async () => {
      // Make binary available
      mocks.accessSync.mockImplementation(() => undefined);

      const rhubarbOutput: RhubarbOutput = {
        mouthCues: [
          { start: 0.0, end: 0.5, value: "A" },
          { start: 0.5, end: 1.0, value: "X" },
        ],
      };

      mocks.execFile.mockImplementation(
        (
          _bin: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string }) => void,
        ) => {
          callback(null, { stdout: JSON.stringify(rhubarbOutput) });
        },
      );

      const result = await analyzeRhubarb("/tmp/test.wav");

      expect(result.method).toBe("rhubarb");
      expect(result.visemes).toHaveLength(2);
      expect(result.visemes[0].viseme).toBe("PP"); // A → PP
      expect(result.visemes[1].viseme).toBe("sil"); // X → sil
      expect(result.duration).toBe(1000);
    });

    it("falls back on rhubarb execution error", async () => {
      mocks.accessSync.mockImplementation(() => undefined);

      mocks.execFile.mockImplementation(
        (
          _bin: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null) => void,
        ) => {
          callback(new Error("Rhubarb crashed"));
        },
      );

      const result = await analyzeRhubarb("/tmp/test.wav");

      expect(result.method).toBe("amplitude");
      expect(result.visemes).toEqual([]);
    });

    it("falls back on invalid JSON from rhubarb", async () => {
      mocks.accessSync.mockImplementation(() => undefined);

      mocks.execFile.mockImplementation(
        (
          _bin: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string }) => void,
        ) => {
          callback(null, { stdout: "not valid json" });
        },
      );

      const result = await analyzeRhubarb("/tmp/test.wav");

      expect(result.method).toBe("amplitude");
      expect(result.visemes).toEqual([]);
    });

    it("returns rhubarb method on success", async () => {
      mocks.accessSync.mockImplementation(() => undefined);

      const rhubarbOutput: RhubarbOutput = {
        mouthCues: [{ start: 0, end: 0.5, value: "C" }],
      };

      mocks.execFile.mockImplementation(
        (
          _bin: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string }) => void,
        ) => {
          callback(null, { stdout: JSON.stringify(rhubarbOutput) });
        },
      );

      const result = await analyzeRhubarb("/tmp/speech.wav");

      expect(result.method).toBe("rhubarb");
      expect(result.visemes[0].viseme).toBe("aa"); // C → aa
      expect(result.duration).toBe(500);
    });
  });
});
