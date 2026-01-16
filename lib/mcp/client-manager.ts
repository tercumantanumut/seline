/**
 * MCP Client Manager
 * 
 * Singleton manager for MCP client connections.
 * Handles connection lifecycle, tool discovery, and execution.
 * Supports both HTTP/SSE and stdio transports.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig, ResolvedMCPServer, MCPDiscoveredTool, MCPServerStatus } from "./types";

// Re-export types for convenience
export type { MCPDiscoveredTool, MCPServerStatus };

/**
 * Singleton manager for MCP client connections
 * Handles connection lifecycle, tool discovery, and execution
 */
// Use global var to persist across HMR in development
const globalForMCP = globalThis as unknown as {
    mcpClientManager: MCPClientManager | undefined;
};

class MCPClientManager {
    private clients: Map<string, Client> = new Map();
    private tools: Map<string, MCPDiscoveredTool[]> = new Map();
    private status: Map<string, MCPServerStatus> = new Map();
    private transports: Map<string, StdioClientTransport | SSEClientTransport> = new Map();

    private constructor() { }

    static getInstance(): MCPClientManager {
        if (!globalForMCP.mcpClientManager) {
            globalForMCP.mcpClientManager = new MCPClientManager();
        }
        return globalForMCP.mcpClientManager;
    }

    /**
     * Connect to an MCP server and discover its tools
     */
    async connect(serverName: string, config: ResolvedMCPServer): Promise<MCPServerStatus> {
        // Disconnect existing connection if any
        await this.disconnect(serverName);

        // Wait a brief moment for OS to reclaim resources (ports/files)
        // This helps with servers like Linear that bind local ports
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            let transport: StdioClientTransport | SSEClientTransport;

            if (config.type === "stdio") {
                // Stdio transport - run command as subprocess
                if (!config.command) {
                    throw new Error("Stdio transport requires 'command' to be specified");
                }

                console.log(`[MCP] Starting stdio transport: ${config.command} ${config.args?.join(" ") || ""}`);

                transport = new StdioClientTransport({
                    command: config.command,
                    args: config.args || [],
                    env: config.env,
                });
            } else {
                // HTTP/SSE transport
                if (!config.url) {
                    throw new Error("HTTP/SSE transport requires 'url' to be specified");
                }

                console.log(`[MCP] Connecting to SSE endpoint: ${config.url}`);

                transport = new SSEClientTransport(new URL(config.url), {
                    requestInit: {
                        headers: config.headers,
                        signal: AbortSignal.timeout(config.timeout),
                    },
                });
            }

            // Create and connect client
            const client = new Client({
                name: "seline-mcp-client",
                version: "1.0.0",
            }, {
                capabilities: {},
            });

            await client.connect(transport);

            // Discover tools
            const toolsResponse = await client.listTools();
            const discoveredTools: MCPDiscoveredTool[] = toolsResponse.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema as Record<string, unknown>,
                serverName,
            }));

            // Store client, transport, and tools
            this.clients.set(serverName, client);
            this.transports.set(serverName, transport);
            this.tools.set(serverName, discoveredTools);

            const status: MCPServerStatus = {
                serverName,
                connected: true,
                lastConnected: new Date(),
                toolCount: discoveredTools.length,
                tools: discoveredTools.map(t => t.name),
            };
            this.status.set(serverName, status);

            console.log(`[MCP] Connected to ${serverName}: ${discoveredTools.length} tools discovered`);
            console.log(`[MCP] Tools: ${discoveredTools.map(t => t.name).join(", ")}`);
            return status;

        } catch (error) {
            const status: MCPServerStatus = {
                serverName,
                connected: false,
                lastError: error instanceof Error ? error.message : String(error),
                toolCount: 0,
                tools: [],
            };
            this.status.set(serverName, status);
            console.error(`[MCP] Failed to connect to ${serverName}:`, error);
            return status;
        }
    }

    /**
     * Disconnect from an MCP server
     */
    async disconnect(serverName: string): Promise<void> {
        const client = this.clients.get(serverName);
        const transport = this.transports.get(serverName);

        if (client) {
            try {
                await client.close();
            } catch (error) {
                console.warn(`[MCP] Error closing client for ${serverName}:`, error);
            }
            this.clients.delete(serverName);
        }

        if (transport) {
            try {
                await transport.close();
            } catch (error) {
                console.warn(`[MCP] Error closing transport for ${serverName}:`, error);
            }
            this.transports.delete(serverName);
        }

        this.tools.delete(serverName);
        this.status.delete(serverName);
    }

    /**
     * Execute a tool on an MCP server
     */
    async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ): Promise<unknown> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" is not connected`);
        }

        console.log(`[MCP] Executing ${serverName}:${toolName} with args:`, args);

        const result = await client.callTool({
            name: toolName,
            arguments: args,
        });

        return result;
    }

    /**
     * Get all discovered tools from connected servers
     */
    getAllTools(): MCPDiscoveredTool[] {
        const allTools: MCPDiscoveredTool[] = [];
        for (const tools of this.tools.values()) {
            allTools.push(...tools);
        }
        return allTools;
    }

    /**
     * Get tools from a specific server
     */
    getServerTools(serverName: string): MCPDiscoveredTool[] {
        return this.tools.get(serverName) || [];
    }

    /**
     * Get status of all servers
     */
    getAllStatus(): MCPServerStatus[] {
        return Array.from(this.status.values());
    }

    /**
     * Check if a server is connected
     */
    isConnected(serverName: string): boolean {
        return this.clients.has(serverName);
    }

    /**
     * Get all connected server names
     */
    getConnectedServers(): string[] {
        return Array.from(this.clients.keys());
    }

    /**
     * Disconnect all MCP servers and clear all cached tools/status
     */
    async disconnectAll(): Promise<void> {
        const serverNames = this.getConnectedServers();
        console.log(`[MCP] Disconnecting all ${serverNames.length} servers`);

        for (const serverName of serverNames) {
            await this.disconnect(serverName);
        }

        // Clear any remaining state (in case disconnect didn't clean everything)
        this.clients.clear();
        this.tools.clear();
        this.status.clear();
        this.transports.clear();

        console.log("[MCP] All servers disconnected and state cleared");
    }

    /**
     * Sync connections with config - disconnect servers not in the provided config
     * and clear their tools
     *
     * @param configuredServers - Set of server names that should remain connected
     * @returns Names of servers that were disconnected
     */
    async syncWithConfig(configuredServers: Set<string>): Promise<string[]> {
        const disconnectedServers: string[] = [];
        const connectedServers = this.getConnectedServers();

        for (const serverName of connectedServers) {
            if (!configuredServers.has(serverName)) {
                console.log(`[MCP] Server "${serverName}" is no longer in config, disconnecting`);
                await this.disconnect(serverName);
                disconnectedServers.push(serverName);
            }
        }

        if (disconnectedServers.length > 0) {
            console.log(`[MCP] Disconnected ${disconnectedServers.length} servers no longer in config: ${disconnectedServers.join(", ")}`);
        }

        return disconnectedServers;
    }
}

export { MCPClientManager };

/**
 * Resolve environment variables and determine transport type in MCP config
 */
export function resolveMCPConfig(
    serverName: string,
    config: MCPServerConfig,
    env: Record<string, string>
): ResolvedMCPServer {
    const resolveValue = (value: string): string => {
        return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
            return env[varName] || "";
        });
    };

    // Determine transport type
    // If command is present, it's stdio; otherwise use specified type or default to sse
    const transportType: "http" | "sse" | "stdio" = config.command
        ? "stdio"
        : (config.type || "sse");

    if (transportType === "stdio") {
        // Stdio transport
        return {
            name: serverName,
            type: "stdio",
            command: config.command!,
            args: config.args || [],
            env: config.env,
            timeout: config.timeout || 30000,
        };
    }

    // HTTP/SSE transport
    const resolvedHeaders: Record<string, string> = {};
    if (config.headers) {
        for (const [key, value] of Object.entries(config.headers)) {
            resolvedHeaders[key] = resolveValue(value);
        }
    }

    return {
        name: serverName,
        type: transportType,
        url: config.url ? resolveValue(config.url) : undefined,
        headers: resolvedHeaders,
        timeout: config.timeout || 30000,
    };
}
