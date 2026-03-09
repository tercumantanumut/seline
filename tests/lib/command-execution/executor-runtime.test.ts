import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shell-env/resolver", () => ({
    getResolvedShellEnvironment: vi.fn(() => ({})),
}));

import * as shellEnvResolver from "@/lib/shell-env/resolver";
import { buildSafeEnvironment, type BundledRuntimeInfo } from "@/lib/command-execution/executor-runtime";

const baseRuntime: BundledRuntimeInfo = {
    resourcesPath: "/tmp/resources",
    isProductionBuild: true,
    nodeBinDir: null,
    toolsBinDir: null,
    bundledBinDirs: [],
    bundledNodePath: null,
    bundledNpmCliPath: null,
    bundledNpxCliPath: null,
};

describe("buildSafeEnvironment", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        vi.mocked(shellEnvResolver.getResolvedShellEnvironment).mockReturnValue({});
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("merges resolved shell environment over process.env", () => {
        process.env.TEST_BASE_ENV = "base";
        vi.mocked(shellEnvResolver.getResolvedShellEnvironment).mockReturnValue({
            TEST_BASE_ENV: "shell",
            TEST_ONLY_SHELL: "yes",
        });

        const env = buildSafeEnvironment(baseRuntime);

        expect(env.TEST_BASE_ENV).toBe("shell");
        expect(env.TEST_ONLY_SHELL).toBe("yes");
    });

    it("prepends bundled binary dirs to the resolved PATH", () => {
        vi.mocked(shellEnvResolver.getResolvedShellEnvironment).mockReturnValue({
            PATH: "/usr/local/bin:/usr/bin",
        });

        const env = buildSafeEnvironment({
            ...baseRuntime,
            bundledBinDirs: ["/bundle/node/.bin", "/bundle/tools/bin"],
        });

        expect(env.PATH).toBe("/bundle/node/.bin:/bundle/tools/bin:/usr/local/bin:/usr/bin");
    });

    it("preserves important defaults when shell env is sparse", () => {
        vi.mocked(shellEnvResolver.getResolvedShellEnvironment).mockReturnValue({});
        process.env.USERPROFILE = "/Users/test";
        delete process.env.HOME;
        delete process.env.USER;
        process.env.USERNAME = "tester";

        const env = buildSafeEnvironment(baseRuntime);

        expect(env.HOME).toBe("/Users/test");
        expect(env.USER).toBe("tester");
        expect(env.TERM).toBe("xterm-256color");
    });

    it("removes Electron-only env keys from resolved shell env", () => {
        vi.mocked(shellEnvResolver.getResolvedShellEnvironment).mockReturnValue({
            ELECTRON_RUN_AS_NODE: "1",
            ELECTRON_NO_ATTACH_CONSOLE: "1",
            SAFE_KEY: "ok",
        });

        const env = buildSafeEnvironment(baseRuntime);

        expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
        expect(env.ELECTRON_NO_ATTACH_CONSOLE).toBeUndefined();
        expect(env.SAFE_KEY).toBe("ok");
    });

    it("removes runtime identity vars inherited from the app process", () => {
        process.env.NODE_ENV = "production";
        process.env.SELENE_PRODUCTION_BUILD = "1";

        const env = buildSafeEnvironment(baseRuntime);

        expect(env.NODE_ENV).toBeUndefined();
        expect(env.SELENE_PRODUCTION_BUILD).toBeUndefined();
    });

    it("removes runtime identity vars resolved from the login shell", () => {
        vi.mocked(shellEnvResolver.getResolvedShellEnvironment).mockReturnValue({
            NODE_ENV: "production",
            SELENE_PRODUCTION_BUILD: "1",
            SAFE_KEY: "ok",
        });

        const env = buildSafeEnvironment(baseRuntime);

        expect(env.NODE_ENV).toBeUndefined();
        expect(env.SELENE_PRODUCTION_BUILD).toBeUndefined();
        expect(env.SAFE_KEY).toBe("ok");
    });
});
