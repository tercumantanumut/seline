/**
 * MCP Client Manager
 * 
 * Singleton manager for MCP client connections.
 * Handles connection lifecycle, tool discovery, and execution.
 * Supports both HTTP/SSE and stdio transports.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@/lib/mcp/stdio-transport";
import type { MCPServerConfig, ResolvedMCPServer, MCPDiscoveredTool, MCPServerStatus } from "./types";
import { getSyncFolders, getPrimarySyncFolder } from "@/lib/vectordb/sync-service";
import { onFolderChange } from "@/lib/vectordb/folder-events";
import path from "path";

function validateFolderPath(folderPath: string): boolean {
    const resolved = path.resolve(folderPath);
    const allowedBases = [
        process.env.USER_DATA_DIR,
        "/app/data",
        process.env.HOME // For local development compatibility
    ].filter(Boolean) as string[];

    return allowedBases.some(base => resolved.startsWith(path.resolve(base)));
}

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
    private characterMcpServers: Map<string, string[]> = new Map(); // Track which servers belong to which character
    private serverCharacterContext: Map<string, string | undefined> = new Map(); // Track characterId used for each server connection

    /** Default timeout for tool calls in milliseconds (5 minutes) */
    private readonly toolCallTimeoutMs: number = 300000;

    /** Track reload state per character */
    private reloadState: Map<string, {
        isReloading: boolean;
        startedAt: Date | null;
        totalServers: number;
        completedServers: number;
        failedServers: string[];
    }> = new Map();

    private constructor() {
        // Register folder change listener for auto-reconnection
        onFolderChange(async (characterId, event) => {
            console.log(`[MCP] Folder change detected for character ${characterId}:`, event);

            // Reconnect on any change (added, removed, or primary_changed) 
            // because SYNCED_FOLDERS_ARRAY and SYNCED_FOLDERS change on any folder update.
            await this.reconnectForCharacter(characterId);
        });
    }

    static getInstance(): MCPClientManager {
        if (!globalForMCP.mcpClientManager) {
            globalForMCP.mcpClientManager = new MCPClientManager();
        }
        return globalForMCP.mcpClientManager;
    }

    /**
     * Connect to an MCP server and discover its tools
     */
    async connect(
        serverName: string,
        config: ResolvedMCPServer,
        characterId?: string
    ): Promise<MCPServerStatus> {
        // Track character association
        if (characterId) {
            const servers = this.characterMcpServers.get(characterId) || [];
            if (!servers.includes(serverName)) {
                servers.push(serverName);
                this.characterMcpServers.set(characterId, servers);
            }
        }
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
                console.log(`[MCP] Working directory access/arguments:`, config.args); // NEW: Debug log

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

            // Validate filesystem args if applicable
            if (config.command && (serverName === "filesystem" || serverName === "filesystem-multi")) {
                const hasValidPath = config.args?.some(arg =>
                    arg && arg.length > 0 && arg !== "<no-primary-folder>" && arg !== "<no-folders>"
                );

                if (!hasValidPath) {
                    throw new Error(
                        `Filesystem MCP server requires synced folder paths. ` +
                        `Please sync a folder in Settings → Vector Search before enabling this server.`
                    );
                }
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

            // Store client, transport, tools, and context
            this.clients.set(serverName, client);
            this.transports.set(serverName, transport);
            this.tools.set(serverName, discoveredTools);
            this.serverCharacterContext.set(serverName, characterId);

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

        this.serverCharacterContext.delete(serverName);
        this.tools.delete(serverName);
        this.status.delete(serverName);

        // Clean up character tracking
        for (const [characterId, servers] of this.characterMcpServers.entries()) {
            const index = servers.indexOf(serverName);
            if (index > -1) {
                servers.splice(index, 1);
                if (servers.length === 0) {
                    this.characterMcpServers.delete(characterId);
                }
            }
        }
    }

    /**
     * Reconnect all MCP servers for a specific character
     */
    private async reconnectForCharacter(characterId: string): Promise<void> {
        const serverNames = this.characterMcpServers.get(characterId) || [];

        if (serverNames.length === 0) {
            console.log(`[MCP] No servers to reconnect for character ${characterId}`);
            return;
        }

        // Initialize reload state
        this.reloadState.set(characterId, {
            isReloading: true,
            startedAt: new Date(),
            totalServers: serverNames.length,
            completedServers: 0,
            failedServers: [],
        });

        // Emit reload started event
        const { notifyFolderChange } = await import("@/lib/vectordb/folder-events");
        notifyFolderChange(characterId, {
            type: "mcp_reload_started",
            folderId: "", // Not folder-specific
            totalServers: serverNames.length,
            estimatedDuration: serverNames.length * 5000, // 5s per server estimate
        });

        console.log(`[MCP] Reconnecting ${serverNames.length} servers for character ${characterId} due to folder change...`);

        // Dynamic imports to avoid circular dependencies
        const { loadSettings } = await import("@/lib/settings/settings-manager");
        const { getCharacter } = await import("@/lib/characters");

        const settings = loadSettings();
        const character = await getCharacter(characterId);

        if (!character) {
            console.warn(`[MCP] Character ${characterId} not found for reconnection`);
            return;
        }

        const metadata = character.metadata as any;
        const globalConfig = settings.mcpServers?.mcpServers || {};
        const agentConfig = metadata?.mcpServers?.mcpServers || {};
        const combinedConfig = { ...globalConfig, ...agentConfig };
        const env = settings.mcpEnvironment || {};

        for (const serverName of serverNames) {
            try {
                // Disconnect existing
                await this.disconnect(serverName);

                // Reconnect with updated config
                const config = combinedConfig[serverName];
                if (config) {
                    const resolved = await resolveMCPConfig(serverName, config, env, characterId);
                    await this.connect(serverName, resolved, characterId);
                    console.log(`[MCP] Successfully reconnected ${serverName} for ${characterId}`);

                    // Update progress
                    const state = this.reloadState.get(characterId);
                    if (state) {
                        state.completedServers++;

                        // Emit progress update
                        notifyFolderChange(characterId, {
                            type: "mcp_reload_started", // Use same type for progress updates
                            folderId: "",
                            serverName,
                            totalServers: state.totalServers,
                            completedServers: state.completedServers,
                        });
                    }
                }
            } catch (error) {
                console.error(`[MCP] Failed to reconnect ${serverName}:`, error);

                // Track failed servers
                const state = this.reloadState.get(characterId);
                if (state) {
                    state.failedServers.push(serverName);
                    state.completedServers++; // Count as completed (failed)
                }
            }
        }

        // Mark reload as complete
        const state = this.reloadState.get(characterId);
        if (state) {
            state.isReloading = false;

            notifyFolderChange(characterId, {
                type: state.failedServers.length > 0 ? "mcp_reload_failed" : "mcp_reload_completed",
                folderId: "",
                totalServers: state.totalServers,
                completedServers: state.completedServers,
                error: state.failedServers.length > 0
                    ? `Failed to reload: ${state.failedServers.join(", ")}`
                    : undefined,
            });
        }
    }

    /**
     * Execute a tool on an MCP server with timeout protection
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

        // Create timeout promise with cleanup
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(
                    `MCP tool call timed out after ${this.toolCallTimeoutMs}ms: ${serverName}:${toolName}`
                ));
            }, this.toolCallTimeoutMs);
        });

        try {
            const result = await Promise.race([
                client.callTool({
                    name: toolName,
                    arguments: args,
                }),
                timeoutPromise,
            ]);
            return result;
        } finally {
            // Clear timeout to prevent timer leaks
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
            }
        }
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
     * Get the character ID a server was connected for
     */
    getConnectedCharacterId(serverName: string): string | undefined {
        return this.serverCharacterContext.get(serverName);
    }

    /**
     * Get current reload status for a character
     */
    getReloadStatus(characterId: string): {
        isReloading: boolean;
        progress: number; // 0-100
        estimatedTimeRemaining: number; // milliseconds
        failedServers: string[];
        totalServers: number;
        completedServers: number;
    } {
        const state = this.reloadState.get(characterId);
        if (!state || !state.isReloading) {
            return {
                isReloading: false,
                progress: 100,
                estimatedTimeRemaining: 0,
                failedServers: [],
                totalServers: 0,
                completedServers: 0,
            };
        }

        const progress = state.totalServers > 0
            ? (state.completedServers / state.totalServers) * 100
            : 0;

        const elapsed = Date.now() - (state.startedAt?.getTime() || 0);
        const avgTimePerServer = state.completedServers > 0
            ? elapsed / state.completedServers
            : 5000; // Default 5s per server

        const remaining = (state.totalServers - state.completedServers) * avgTimePerServer;

        return {
            isReloading: true,
            progress: Math.min(progress, 100),
            estimatedTimeRemaining: Math.max(remaining, 0),
            failedServers: state.failedServers,
            totalServers: state.totalServers,
            completedServers: state.completedServers,
        };
    }

    /**
     * Check if ANY character is currently reloading (for global indicator)
     */
    isAnyReloading(): boolean {
        for (const state of this.reloadState.values()) {
            if (state.isReloading) return true;
        }
        return false;
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
 * Supports ${SYNCED_FOLDER} (primary) and ${SYNCED_FOLDERS} (all, comma-separated)
 */
export async function resolveMCPConfig(
    serverName: string,
    config: MCPServerConfig,
    env: Record<string, string>,
    characterId?: string
): Promise<ResolvedMCPServer> {
    console.log(`[MCP] Resolving config for ${serverName}:`, {
        hasCharacterId: !!characterId,
        configArgs: config.args,
    });

    const resolveValue = async (value: string): Promise<string> => {
        let resolved = value;

        // Handle ${SYNCED_FOLDER} - primary folder only
        if (resolved.includes("${SYNCED_FOLDER}") && characterId) {
            const primaryFolder = await getPrimarySyncFolder(characterId);
            const primaryPath = primaryFolder?.folderPath || "";

            if (!primaryPath) {
                throw new Error(
                    `Cannot resolve \${SYNCED_FOLDER}: No synced folders for character ${characterId}. ` +
                    `Please sync a folder in Settings → Vector Search.`
                );
            }

            if (!validateFolderPath(primaryPath)) {
                throw new Error(`Invalid folder path: ${primaryPath}`);
            }

            resolved = resolved.replace(/\$\{SYNCED_FOLDER\}/g, primaryPath);
        }

        // Handle ${SYNCED_FOLDERS} - all folders, comma-separated (for single-arg tools)
        if (resolved.includes("${SYNCED_FOLDERS}") && characterId) {
            const folders = await getSyncFolders(characterId);

            if (folders.length === 0) {
                throw new Error(
                    `Cannot resolve \${SYNCED_FOLDERS}: No synced folders for character ${characterId}.`
                );
            }

            for (const folder of folders) {
                if (!validateFolderPath(folder.folderPath)) {
                    throw new Error(`Invalid folder path in list: ${folder.folderPath}`);
                }
            }

            const allPaths = folders.map(f => f.folderPath).join(",");
            resolved = resolved.replace(/\$\{SYNCED_FOLDERS\}/g, allPaths);
        }

        // Handle standard environment variables
        return resolved.replace(/\$\{([^}]+)\}/g, (_, varName) => {
            return env[varName] || "";
        });
    };

    // Determine transport type
    const transportType: "http" | "sse" | "stdio" = config.command
        ? "stdio"
        : (config.type || "sse");

    if (transportType === "stdio") {
        // Stdio transport
        const resolvedEnv: Record<string, string> = {};
        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                resolvedEnv[key] = await resolveValue(value);
            }
        }

        // Resolve arguments with special handling for ${SYNCED_FOLDERS_ARRAY}
        const resolvedArgs: string[] = [];
        if (config.args) {
            for (const arg of config.args) {
                if (arg === "${SYNCED_FOLDERS_ARRAY}" && characterId) {
                    const folders = await getSyncFolders(characterId);

                    if (folders.length === 0) {
                        throw new Error(`Cannot resolve \${SYNCED_FOLDERS_ARRAY}: No synced folders for character ${characterId}.`);
                    }

                    for (const folder of folders) {
                        if (!validateFolderPath(folder.folderPath)) {
                            throw new Error(`Invalid folder path in expansion: ${folder.folderPath}`);
                        }
                    }

                    const paths = folders.map(f => f.folderPath);
                    console.log(`[MCP] Expanding ${arg} to ${paths.length} directories`);
                    resolvedArgs.push(...paths); // Multi-arg expansion!
                } else {
                    resolvedArgs.push(await resolveValue(arg));
                }
            }
        }

        console.log(`[MCP] ✅ Resolved ${serverName}:`, {
            command: config.command,
            args: resolvedArgs,
            env: Object.keys(resolvedEnv),
        });

        return {
            name: serverName,
            type: "stdio",
            command: config.command ? await resolveValue(config.command) : undefined,
            args: resolvedArgs,
            env: resolvedEnv,
            timeout: config.timeout || 30000,
        };
    }

    // HTTP/SSE transport
    const resolvedHeaders: Record<string, string> = {};
    if (config.headers) {
        for (const [key, value] of Object.entries(config.headers)) {
            resolvedHeaders[key] = await resolveValue(value);
        }
    }

    return {
        name: serverName,
        type: transportType,
        url: config.url ? await resolveValue(config.url) : undefined,
        headers: resolvedHeaders,
        timeout: config.timeout || 30000,
    };
}
