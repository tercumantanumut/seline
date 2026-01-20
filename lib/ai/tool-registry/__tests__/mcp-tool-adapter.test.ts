import { describe, it, expect } from "vitest";
import {
    mcpToolToMetadata,
    type MCPToolLoadingPreference
} from "../mcp-tool-adapter";
import type { MCPDiscoveredTool } from "@/lib/mcp/types";

// Mock MCP tool for testing
const createMockMCPTool = (name: string): MCPDiscoveredTool => ({
    name,
    description: `Test tool: ${name}`,
    inputSchema: {
        type: "object",
        properties: {
            input: { type: "string", description: "Test input" },
        },
        required: ["input"],
    },
    serverName: "test-server",
});

describe("mcpToolToMetadata", () => {
    describe("without preferences (default behavior)", () => {
        it("should default to deferred loading when no preference provided", () => {
            const tool = createMockMCPTool("test-tool");
            const metadata = mcpToolToMetadata(tool);

            expect(metadata.loading.deferLoading).toBe(true);
            expect(metadata.loading.alwaysLoad).toBe(false);
        });

        it("should include correct display name", () => {
            const tool = createMockMCPTool("my-tool");
            const metadata = mcpToolToMetadata(tool);

            expect(metadata.displayName).toBe("my-tool (test-server)");
            expect(metadata.shortDescription).toBe("Test tool: my-tool");
        });

        it("should set category to MCP", () => {
            const tool = createMockMCPTool("category-tool");
            const metadata = mcpToolToMetadata(tool);

            expect(metadata.category).toBe("mcp");
        });
    });

    describe("with preferences", () => {
        it("should set alwaysLoad: true when loadingMode is 'always'", () => {
            const tool = createMockMCPTool("always-tool");
            const preference: MCPToolLoadingPreference = {
                enabled: true,
                loadingMode: "always",
            };

            const metadata = mcpToolToMetadata(tool, preference);

            expect(metadata.loading.alwaysLoad).toBe(true);
            expect(metadata.loading.deferLoading).toBe(false);
        });

        it("should set deferLoading: true when loadingMode is 'deferred'", () => {
            const tool = createMockMCPTool("deferred-tool");
            const preference: MCPToolLoadingPreference = {
                enabled: true,
                loadingMode: "deferred",
            };

            const metadata = mcpToolToMetadata(tool, preference);

            expect(metadata.loading.deferLoading).toBe(true);
            expect(metadata.loading.alwaysLoad).toBe(false);
        });

        it("should handle enabled: false preference", () => {
            const tool = createMockMCPTool("disabled-tool");
            const preference: MCPToolLoadingPreference = {
                enabled: false,
                loadingMode: "always",
            };

            // Note: mcpToolToMetadata doesn't filter - that happens in loadMCPToolsForCharacter
            // This test just verifies it doesn't crash with enabled: false
            const metadata = mcpToolToMetadata(tool, preference);
            expect(metadata).toBeDefined();
            expect(metadata.loading.alwaysLoad).toBe(true);
        });
    });

    describe("edge cases", () => {
        it("should handle undefined preference gracefully", () => {
            const tool = createMockMCPTool("edge-tool");
            const metadata = mcpToolToMetadata(tool, undefined);

            expect(metadata.loading.deferLoading).toBe(true);
            expect(metadata.loading.alwaysLoad).toBe(false);
        });

        it("should include keywords from tool name and server", () => {
            const tool = createMockMCPTool("search-tool");
            const metadata = mcpToolToMetadata(tool);

            expect(metadata.keywords).toContain("search-tool");
            expect(metadata.keywords).toContain("test-server");
            expect(metadata.keywords).toContain("mcp");
            expect(metadata.keywords).toContain("external");
        });

        it("should not require session", () => {
            const tool = createMockMCPTool("session-tool");
            const metadata = mcpToolToMetadata(tool);

            expect(metadata.requiresSession).toBe(false);
        });
    });
});
