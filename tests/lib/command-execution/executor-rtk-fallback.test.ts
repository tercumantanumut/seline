import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";

const childProcessMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    spawn: childProcessMocks.spawn,
  };
});

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
  };
});

const rtkManagerMocks = vi.hoisted(() => ({
  getRTKBinary: vi.fn(() => "rtk"),
  getRTKEnvironment: vi.fn((env: NodeJS.ProcessEnv) => ({ ...env, RTK_DB_PATH: "/tmp/rtk.db" })),
  getRTKFlags: vi.fn(() => []),
  shouldUseRTK: vi.fn(() => true),
}));

vi.mock("@/lib/rtk", () => ({
  getRTKBinary: rtkManagerMocks.getRTKBinary,
  getRTKEnvironment: rtkManagerMocks.getRTKEnvironment,
  getRTKFlags: rtkManagerMocks.getRTKFlags,
  shouldUseRTK: rtkManagerMocks.shouldUseRTK,
}));

import { executeCommand } from "@/lib/command-execution/executor";

describe("executeCommand RTK direct fallback", () => {
  beforeEach(() => {
    childProcessMocks.spawn.mockReset();
    rtkManagerMocks.getRTKBinary.mockReturnValue("rtk");
    rtkManagerMocks.getRTKFlags.mockReturnValue([]);
    rtkManagerMocks.getRTKEnvironment.mockImplementation((env: NodeJS.ProcessEnv) => ({
      ...env,
      RTK_DB_PATH: "/tmp/rtk.db",
    }));
    rtkManagerMocks.shouldUseRTK.mockReturnValue(true);
  });

  it("retries direct execution when RTK rejects a wrapped command", async () => {
    const makeChild = (stderrText: string, code: number) => {
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { end: ReturnType<typeof vi.fn> };
        kill: ReturnType<typeof vi.fn>;
      };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = { end: vi.fn() };
      proc.kill = vi.fn(() => true);

      queueMicrotask(() => {
        if (stderrText) proc.stderr.emit("data", Buffer.from(stderrText));
        proc.emit("close", code, null);
      });

      return proc;
    };

    childProcessMocks.spawn
      .mockImplementationOnce(() => makeChild("error: unrecognized subcommand 'cat'", 2))
      .mockImplementationOnce(() => makeChild("", 0));

    const result = await executeCommand({
      command: "cat",
      args: ["/tmp/file.txt"],
      cwd: process.cwd(),
      characterId: "test",
    });

    expect(result.success).toBe(true);
    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(2);
    expect(childProcessMocks.spawn.mock.calls[0]?.[0]).toBe("rtk");
    expect(childProcessMocks.spawn.mock.calls[1]?.[0]).toBe("cat");
  });
});
