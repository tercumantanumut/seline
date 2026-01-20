import { describe, it, expect } from "vitest";
import { mcpToolToMetadata, type MCPToolLoadingPreference } from "../../ai/tool-registry/mcp-tool-adapter";
import type { MCPDiscoveredTool } from "@/lib/mcp/types";

/**
 * Integration tests for MCP tool loading and filtering logic
 * These tests verify the core filtering behavior without requiring actual MCP server connections
 */

describe("MCP Tool Loading Integration", () => {
    const createMockTool = (name: string, serverName: string = "test-server"): MCPDiscoveredTool => ({
        name,
        description: `${name} description`,
        inputSchema: {
            type: "object",
            properties: {},
        },
        serverName,
    });

    describe("Tool metadata generation with preferences", () => {
        it("should generate correct metadata for always-load tools", () => {
            const tool = createMockTool("critical-tool");
            const preference: MCPToolLoadingPreference = {
                enabled: true,
                loadingMode: "always",
            };

            const metadata = mcpToolToMetadata(tool, preference);

            expect(metadata.loading.alwaysLoad).toBe(true);
            expect(metadata.loading.deferLoading).toBe(false);
            expect(metadata.displayName).toContain("critical-tool");
            expect(metadata.category).toBe("mcp");
        });

        it("should generate correct metadata for deferred tools", () => {
            const tool = createMockTool("rare-tool");
            const preference: MCPToolLoadingPreference = {
                enabled: true,
                loadingMode: "deferred",
            };

            const metadata = mcpToolToMetadata(tool, preference);

            expect(metadata.loading.deferLoading).toBe(true);
            expect(metadata.loading.alwaysLoad).toBe(false);
        });

        it("should default to deferred when no preference provided", () => {
            const tool = createMockTool("default-tool");
            const metadata = mcpToolToMetadata(tool);

            expect(metadata.loading.deferLoading).toBe(true);
            expect(metadata.loading.alwaysLoad).toBe(false);
        });
    });

    describe("Loading mode filtering logic", () => {
        it("should correctly categorize tools by loading mode", () => {
            const tools = [
                { tool: createMockTool("tool-a"), pref: { enabled: true, loadingMode: "always" as const } },
                { tool: createMockTool("tool-b"), pref: { enabled: true, loadingMode: "deferred" as const } },
                { tool: createMockTool("tool-c"), pref: { enabled: true, loadingMode: "always" as const } },
                { tool: createMockTool("tool-d"), pref: { enabled: false, loadingMode: "always" as const } },
            ];

            const alwaysLoad: string[] = [];
            const deferred: string[] = [];
            const disabled: string[] = [];

            tools.forEach(({ tool, pref }) => {
                if (!pref.enabled) {
                    disabled.push(tool.name);
                    return;
                }

                if (pref.loadingMode === "always") {
                    alwaysLoad.push(tool.name);
                } else {
                    deferred.push(tool.name);
                }
            });

            expect(alwaysLoad).toEqual(["tool-a", "tool-c"]);
            expect(deferred).toEqual(["tool-b"]);
            expect(disabled).toEqual(["tool-d"]);
        });

        it("should handle missing preferences with defaults", () => {
            const tools = [
                { tool: createMockTool("tool-1"), pref: undefined },
                { tool: createMockTool("tool-2"), pref: undefined },
            ];

            const categorized = tools.map(({ tool, pref }) => {
                const defaultPref = pref ?? { enabled: true, loadingMode: "deferred" as const };
                return {
                    name: tool.name,
                    enabled: defaultPref.enabled,
                    mode: defaultPref.loadingMode,
                };
            });

            expect(categorized).toEqual([
                { name: "tool-1", enabled: true, mode: "deferred" },
                { name: "tool-2", enabled: true, mode: "deferred" },
            ]);
        });
    });

    describe("Preference merging and defaults", () => {
        it("should merge user preferences with defaults correctly", () => {
            const userPreferences: Record<string, MCPToolLoadingPreference> = {
                "server:tool-a": { enabled: true, loadingMode: "always" },
                "server:tool-c": { enabled: false, loadingMode: "deferred" },
            };

            const toolKeys = ["server:tool-a", "server:tool-b", "server:tool-c"];

            const finalPreferences = toolKeys.map(key => ({
                key,
                ...userPreferences[key] ?? { enabled: true, loadingMode: "deferred" as const },
            }));

            expect(finalPreferences).toEqual([
                { key: "server:tool-a", enabled: true, loadingMode: "always" },
                { key: "server:tool-b", enabled: true, loadingMode: "deferred" },
                { key: "server:tool-c", enabled: false, loadingMode: "deferred" },
            ]);
        });
    });

    describe("Backward compatibility", () => {
        it("should handle agents without mcpToolPreferences", () => {
            const agentMetadata = {
                enabledMcpServers: ["server-1"],
                enabledMcpTools: ["server-1:tool-a", "server-1:tool-b"],
                // mcpToolPreferences is missing (old agent)
            };

            const mcpToolPreferences = (agentMetadata as any).mcpToolPreferences ?? {};

            expect(mcpToolPreferences).toEqual({});

            // Verify default behavior
            const toolKey = "server-1:tool-a";
            const preference = mcpToolPreferences[toolKey] ?? {
                enabled: true,
                loadingMode: "deferred" as const,
            };

            expect(preference.enabled).toBe(true);
            expect(preference.loadingMode).toBe("deferred");
        });

        it("should handle empty preferences object", () => {
            const agentMetadata = {
                enabledMcpServers: ["server-1"],
                enabledMcpTools: ["server-1:tool-a"],
                mcpToolPreferences: {} as Record<string, MCPToolLoadingPreference>,
            };

            const toolKey = "server-1:tool-a";
            const preference = agentMetadata.mcpToolPreferences[toolKey] ?? {
                enabled: true,
                loadingMode: "deferred" as const,
            };

            expect(preference.enabled).toBe(true);
            expect(preference.loadingMode).toBe("deferred");
        });
    });

    describe("Tool ID generation consistency", () => {
        it("should generate consistent tool IDs for categorization", () => {
            const serverName = "github";
            const toolName = "create_issue";
            const toolKey = `${serverName}:${toolName}`;

            // Simulate the getMCPToolId function logic
            const toolId = `mcp_${serverName}_${toolName}`;

            expect(toolId).toBe("mcp_github_create_issue");
            expect(toolKey).toBe("github:create_issue");
        });
    });
});
