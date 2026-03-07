import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMocks = vi.hoisted(() => ({
  isElectronProduction: vi.fn(() => false),
}));

const loginMocks = vi.hoisted(() => ({
  getNodeBinary: vi.fn(() => "/usr/local/bin/node"),
}));

const shellEnvMocks = vi.hoisted(() => ({
  getResolvedShellEnvironment: vi.fn(() => ({})),
}));

vi.mock("@/lib/utils/environment", () => ({
  isElectronProduction: envMocks.isElectronProduction,
}));

vi.mock("@/lib/auth/claude-login-process", () => ({
  getNodeBinary: loginMocks.getNodeBinary,
}));

vi.mock("@/lib/shell-env/resolver", () => ({
  getResolvedShellEnvironment: shellEnvMocks.getResolvedShellEnvironment,
}));

import { getSdkExecutableConfig } from "@/lib/auth/claude-agent-sdk-auth";

describe("getSdkExecutableConfig", () => {
  const originalPath = process.env.PATH;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PATH = originalPath;
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.CLAUDECODE = "1";
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDECODE;
  });

  it("always returns executable as 'node' (SDK type constraint)", () => {
    const { executable } = getSdkExecutableConfig();
    expect(executable).toBe("node");
  });

  it("strips ANTHROPIC_API_KEY and CLAUDECODE from env", () => {
    const { env } = getSdkExecutableConfig();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDECODE).toBeUndefined();
  });

  describe("production mode (isElectronProduction = true)", () => {
    beforeEach(() => {
      envMocks.isElectronProduction.mockReturnValue(true);
    });

    it("sets ELECTRON_RUN_AS_NODE=1", () => {
      const { env } = getSdkExecutableConfig();
      expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
    });

    it("uses shell-resolved PATH when available", () => {
      process.env.PATH = "/usr/bin:/bin";
      const shellPath = "/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
      shellEnvMocks.getResolvedShellEnvironment.mockReturnValue({ PATH: shellPath });

      const { env } = getSdkExecutableConfig();

      expect(env.PATH).toBe(shellPath);
      expect(process.env.PATH).toBe(shellPath);
      // Should NOT call getNodeBinary when shell env succeeds
      expect(loginMocks.getNodeBinary).not.toHaveBeenCalled();
    });

    it("falls back to getNodeBinary PATH augmentation when shell env has no PATH", () => {
      process.env.PATH = "/usr/bin:/bin";
      shellEnvMocks.getResolvedShellEnvironment.mockReturnValue({});
      loginMocks.getNodeBinary.mockReturnValue("/opt/homebrew/bin/node");

      const { env } = getSdkExecutableConfig();

      expect(env.PATH).toContain("/opt/homebrew/bin");
      expect(loginMocks.getNodeBinary).toHaveBeenCalled();
    });

    it("falls back to process.execPath dir when no shell env and no system node", () => {
      const execDir = require("path").dirname(process.execPath);
      process.env.PATH = "/usr/bin:/bin";
      shellEnvMocks.getResolvedShellEnvironment.mockReturnValue({});
      loginMocks.getNodeBinary.mockReturnValue(process.execPath);

      const { env } = getSdkExecutableConfig();

      expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
      expect(env.PATH).toContain(execDir);
    });
  });

  describe("development mode (isElectronProduction = false)", () => {
    beforeEach(() => {
      envMocks.isElectronProduction.mockReturnValue(false);
    });

    it("does not set ELECTRON_RUN_AS_NODE", () => {
      const { env } = getSdkExecutableConfig();
      expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    });

    it("does not resolve shell env or modify PATH", () => {
      const pathBefore = process.env.PATH;
      getSdkExecutableConfig();

      expect(shellEnvMocks.getResolvedShellEnvironment).not.toHaveBeenCalled();
      expect(loginMocks.getNodeBinary).not.toHaveBeenCalled();
      expect(process.env.PATH).toBe(pathBefore);
    });
  });
});
