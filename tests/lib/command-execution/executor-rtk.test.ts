import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { getRtkFallbackReason, wrapWithRTK } from "@/lib/command-execution/executor-rtk";

describe("wrapWithRTK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rtkManagerMocks.getRTKBinary.mockReturnValue("rtk");
    rtkManagerMocks.getRTKFlags.mockReturnValue([]);
    rtkManagerMocks.getRTKEnvironment.mockImplementation((env: NodeJS.ProcessEnv) => ({
      ...env,
      RTK_DB_PATH: "/tmp/rtk.db",
    }));
    rtkManagerMocks.shouldUseRTK.mockReturnValue(true);
  });

  it("does not wrap npm commands so install keeps exact semantics", () => {
    const result = wrapWithRTK("npm", ["install"], { PATH: "/usr/bin" });

    expect(result).toMatchObject({
      command: "npm",
      args: ["install"],
      usingRTK: false,
    });
    expect(rtkManagerMocks.shouldUseRTK).not.toHaveBeenCalled();
  });

  it("still wraps non-package-manager commands when RTK is enabled", () => {
    const result = wrapWithRTK("git", ["status"], { PATH: "/usr/bin" });

    expect(result.usingRTK).toBe(true);
    expect(result.command).toBe("rtk");
    expect(result.args).toEqual(["git", "status"]);
    expect(rtkManagerMocks.shouldUseRTK).toHaveBeenCalledWith("git");
  });

  it("falls back to direct execution when RTK binary is unavailable", () => {
    rtkManagerMocks.getRTKBinary.mockReturnValue(null);

    const result = wrapWithRTK("git", ["status"], { PATH: "/usr/bin" });

    expect(result).toMatchObject({
      command: "git",
      args: ["status"],
      usingRTK: false,
    });
  });
});

describe("getRtkFallbackReason", () => {
  it("keeps rg-specific fallback reasons for ripgrep commands", () => {
    expect(
      getRtkFallbackReason({
        command: "rg",
        wrappedByRTK: true,
        stderr: "error: unrecognized subcommand 'rg'",
      })
    ).toBe("rtk_rg_unrecognized_subcommand");
  });

  it("returns generic fallback reasons for non-rg commands", () => {
    expect(
      getRtkFallbackReason({
        command: "cat",
        wrappedByRTK: true,
        stderr: "error: unrecognized subcommand 'cat'",
      })
    ).toBe("rtk_unrecognized_subcommand");
  });

  it("returns undefined when RTK is not involved", () => {
    expect(
      getRtkFallbackReason({
        command: "cat",
        wrappedByRTK: false,
        stderr: "error: unrecognized subcommand 'cat'",
      })
    ).toBeUndefined();
  });
});
