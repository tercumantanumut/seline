import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveMCPConfig } from "@/lib/mcp/client-manager";
import * as syncService from "@/lib/vectordb/sync-service";

// Mock the sync service
vi.mock("@/lib/vectordb/sync-service", () => ({
    getSyncFolders: vi.fn(),
    getAllSyncFolders: vi.fn(),
    getPrimarySyncFolder: vi.fn(),
    onFolderChange: vi.fn(),
}));

describe("MCP Synced Folders Variable Resolution", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should resolve ${SYNCED_FOLDER} to the primary folder path", async () => {
        const characterId = "char-123";
        const primaryPath = "/app/data/primary";

        (syncService.getPrimarySyncFolder as any).mockResolvedValue({
            folderPath: primaryPath,
            isPrimary: true,
        });

        const config = {
            command: "ls",
            args: ["${SYNCED_FOLDER}"]
        };

        const resolved = await resolveMCPConfig("test", config as any, {}, characterId);
        expect(resolved.args).toContain(primaryPath);
    });

    it("should resolve ${SYNCED_FOLDERS} to all folder paths comma-separated", async () => {
        const characterId = "char-123";
        const paths = ["/app/data/1", "/app/data/2"];

        (syncService.getSyncFolders as any).mockResolvedValue([
            { folderPath: paths[0], isPrimary: true },
            { folderPath: paths[1], isPrimary: false },
        ]);

        const config = {
            command: "ls",
            args: ["${SYNCED_FOLDERS}"]
        };

        const resolved = await resolveMCPConfig("test", config as any, {}, characterId);
        expect(resolved.args).toContain(paths.join(","));
    });

    it("should expand ${SYNCED_FOLDERS_ARRAY} into multiple arguments", async () => {
        const characterId = "char-123";
        const paths = ["/app/data/1", "/app/data/2", "/app/data/3"];

        (syncService.getSyncFolders as any).mockResolvedValue(
            paths.map((p, i) => ({ folderPath: p, isPrimary: i === 0 }))
        );

        const config = {
            command: "ls",
            args: ["${SYNCED_FOLDERS_ARRAY}"]
        };

        const resolved = await resolveMCPConfig("test", config as any, {}, characterId);

        // Should expand to 3 separate args
        expect(resolved.args).toEqual(paths);
        expect(resolved.args.length).toBe(3);
    });

    it("should resolve environment variables alongside synced folder variables", async () => {
        const characterId = "char-123";
        const primaryPath = "/app/data/primary";
        const apiKey = "sk-12345";

        (syncService.getPrimarySyncFolder as any).mockResolvedValue({
            folderPath: primaryPath,
            isPrimary: true,
        });

        const config = {
            command: "npx",
            args: ["test-tool", "--path", "${SYNCED_FOLDER}"],
            env: {
                "API_KEY": "${MY_ENV_KEY}"
            }
        };

        const env = { "MY_ENV_KEY": apiKey };

        const resolved = await resolveMCPConfig("test", config as any, env, characterId);
        expect(resolved.args).toContain(primaryPath);
        expect(resolved.env?.["API_KEY"]).toBe(apiKey);
    });

    it("should resolve synced folders without characterId using global primary folder", async () => {
        (syncService as any).getAllSyncFolders.mockResolvedValue([
            { folderPath: "/app/data/global-primary", isPrimary: true },
            { folderPath: "/app/data/global-secondary", isPrimary: false },
        ]);

        const config = {
            command: "ls",
            args: ["${SYNCED_FOLDER}", "${SYNCED_FOLDERS}"]
        };

        const resolved = await resolveMCPConfig("test", config as any, {});
        expect(resolved.args).toEqual([
            "/app/data/global-primary",
            "/app/data/global-primary,/app/data/global-secondary",
        ]);
        expect(syncService.getPrimarySyncFolder).not.toHaveBeenCalled();
    });
});
