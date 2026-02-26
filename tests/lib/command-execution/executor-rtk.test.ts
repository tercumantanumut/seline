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

import { wrapWithRTK } from "@/lib/command-execution/executor-rtk";

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
});
