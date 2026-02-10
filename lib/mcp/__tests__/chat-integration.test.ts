import { describe, it, expect } from "vitest";
import { mcpToolToMetadata, getMCPToolId, type MCPToolLoadingPreference } from "../../ai/tool-registry/mcp-tool-adapter";
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

        it("should use the actual getMCPToolId function consistently", () => {
            expect(getMCPToolId("github", "create_issue")).toBe("mcp_github_create_issue");
            expect(getMCPToolId("my-server", "my-tool")).toBe("mcp_my_server_my_tool");
            expect(getMCPToolId("server.with.dots", "tool/with/slashes")).toBe("mcp_server_with_dots_tool_with_slashes");
        });
    });

    // =========================================================================
    // Tests for missing preferences and tool removal during runtime
    // =========================================================================

    describe("Missing preferences resilience", () => {
        it("should produce valid metadata when preferences are undefined", () => {
            const tool = createMockTool("orphan-tool", "removed-server");

            // Simulates the exact fallback path in chat-integration.ts
            const mcpToolPreferences: Record<string, MCPToolLoadingPreference> = {};
            const toolKey = `${tool.serverName}:${tool.name}`;
            const preference = mcpToolPreferences[toolKey] ?? {
                enabled: true,
                loadingMode: "deferred" as const,
            };

            const metadata = mcpToolToMetadata(tool, preference);

            expect(metadata.loading.deferLoading).toBe(true);
            expect(metadata.loading.alwaysLoad).toBe(false);
            expect(metadata.displayName).toContain("orphan-tool");
            expect(metadata.category).toBe("mcp");
            expect(metadata.shortDescription).toBeTruthy();
        });

        it("should handle preferences referencing deleted tools gracefully", () => {
            // Preferences exist for tools that were removed from the server
            const stalePreferences: Record<string, MCPToolLoadingPreference> = {
                "old-server:deleted-tool": { enabled: true, loadingMode: "always" },
                "old-server:another-deleted": { enabled: false, loadingMode: "deferred" },
            };

            // Simulate the chat-integration loop: only tools returned by getMCPToolsForAgent
            // are iterated. Stale preference keys are simply never accessed.
            const availableTools = [createMockTool("surviving-tool", "old-server")];

            const alwaysLoad: string[] = [];
            const deferred: string[] = [];

            for (const mcpTool of availableTools) {
                const toolKey = `${mcpTool.serverName}:${mcpTool.name}`;
                const preference = stalePreferences[toolKey] ?? {
                    enabled: true,
                    loadingMode: "deferred" as const,
                };

                if (!preference.enabled) continue;

                if (preference.loadingMode === "always") {
                    alwaysLoad.push(mcpTool.name);
                } else {
                    deferred.push(mcpTool.name);
                }
            }

            // The surviving tool gets default deferred since it has no preference entry
            expect(deferred).toEqual(["surviving-tool"]);
            expect(alwaysLoad).toEqual([]);
        });

        it("should detect stale tool references in enabledTools", () => {
            // Agent metadata references tools that no longer exist
            const enabledTools = [
                "server-1:tool-a",
                "server-1:tool-b",
                "server-1:deleted-tool",
            ];

            // Only these tools are actually available from the MCP manager
            const availableTools = [
                createMockTool("tool-a", "server-1"),
                createMockTool("tool-b", "server-1"),
            ];

            const loadedToolKeys = new Set(
                availableTools.map(t => `${t.serverName}:${t.name}`)
            );
            const staleRefs = enabledTools.filter(t => !loadedToolKeys.has(t));

            expect(staleRefs).toEqual(["server-1:deleted-tool"]);
            expect(staleRefs.length).toBe(1);
        });
    });

    describe("Tool removal during runtime", () => {
        it("should build allTools only from available tools, ignoring deleted ones", () => {
            // Simulates the runtime scenario where metadata references 3 tools
            // but only 2 are actually available from the MCP server
            const enabledTools = [
                "github:create_issue",
                "github:list_repos",
                "github:deleted_action",  // This was removed mid-session
            ];

            const availableFromServer = [
                createMockTool("create_issue", "github"),
                createMockTool("list_repos", "github"),
                // "deleted_action" is NOT returned by the server anymore
            ];

            // Filter like getMCPToolsForAgent does
            const toolSet = new Set(enabledTools);
            const filteredTools = availableFromServer.filter(
                t => toolSet.has(`${t.serverName}:${t.name}`)
            );

            const allTools: Record<string, boolean> = {};
            for (const mcpTool of filteredTools) {
                const toolId = getMCPToolId(mcpTool.serverName, mcpTool.name);
                allTools[toolId] = true;
            }

            expect(Object.keys(allTools)).toEqual([
                "mcp_github_create_issue",
                "mcp_github_list_repos",
            ]);
            // The deleted tool is silently excluded
            expect(allTools["mcp_github_deleted_action"]).toBeUndefined();
        });

        it("should skip tools with missing critical fields", () => {
            // Simulates a partially corrupted tool entry
            const tools: MCPDiscoveredTool[] = [
                createMockTool("valid-tool", "server-1"),
                { name: "", description: "empty name", inputSchema: {}, serverName: "server-1" },
                { name: "no-server", description: "missing server", inputSchema: {}, serverName: "" },
            ];

            // Apply the defensive filter from getMCPToolsForAgent
            const validTools = tools.filter(t => t && t.name && t.serverName);

            expect(validTools).toHaveLength(1);
            expect(validTools[0].name).toBe("valid-tool");
        });

        it("should produce valid metadata for tools with missing description", () => {
            const toolWithoutDesc: MCPDiscoveredTool = {
                name: "bare-tool",
                serverName: "test-server",
                inputSchema: { type: "object", properties: {} },
                // description is undefined
            };

            const metadata = mcpToolToMetadata(toolWithoutDesc);

            expect(metadata.shortDescription).toBe("MCP tool from test-server");
            expect(metadata.fullInstructions).toBeUndefined();
            expect(metadata.displayName).toBe("bare-tool (test-server)");
            expect(metadata.keywords).toContain("bare-tool");
            expect(metadata.keywords).toContain("test-server");
            // Should not contain empty strings from splitting undefined description
            expect(metadata.keywords.every((k: string) => k.length > 0)).toBe(true);
        });

        it("should correctly categorize tools when some preferences are stale", () => {
            // User had 4 tools configured; 2 were removed from the server
            const preferences: Record<string, MCPToolLoadingPreference> = {
                "server:tool-a": { enabled: true, loadingMode: "always" },
                "server:tool-b": { enabled: true, loadingMode: "deferred" },
                "server:removed-1": { enabled: true, loadingMode: "always" },
                "server:removed-2": { enabled: false, loadingMode: "deferred" },
            };

            // Only tool-a and tool-b still exist
            const currentTools = [
                createMockTool("tool-a", "server"),
                createMockTool("tool-b", "server"),
            ];

            const alwaysLoad: string[] = [];
            const deferred: string[] = [];

            for (const mcpTool of currentTools) {
                const toolKey = `${mcpTool.serverName}:${mcpTool.name}`;
                const preference = preferences[toolKey] ?? {
                    enabled: true,
                    loadingMode: "deferred" as const,
                };

                if (!preference.enabled) continue;

                if (preference.loadingMode === "always") {
                    alwaysLoad.push(mcpTool.name);
                } else {
                    deferred.push(mcpTool.name);
                }
            }

            // Only existing tools are categorized; stale preferences are harmless
            expect(alwaysLoad).toEqual(["tool-a"]);
            expect(deferred).toEqual(["tool-b"]);
        });

        it("should handle the case where ALL tools are removed", () => {
            const enabledTools = [
                "server:tool-x",
                "server:tool-y",
            ];

            // Server returns no tools at all (all were removed)
            const availableFromServer: MCPDiscoveredTool[] = [];

            const toolSet = new Set(enabledTools);
            const filteredTools = availableFromServer.filter(
                t => toolSet.has(`${t.serverName}:${t.name}`)
            );

            expect(filteredTools).toEqual([]);

            // The allTools map should be empty, not throw
            const allTools: Record<string, boolean> = {};
            for (const mcpTool of filteredTools) {
                const toolId = getMCPToolId(mcpTool.serverName, mcpTool.name);
                allTools[toolId] = true;
            }

            expect(Object.keys(allTools)).toEqual([]);
        });
    });
});
