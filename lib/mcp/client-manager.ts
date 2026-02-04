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
import { getAllSyncFolders, getSyncFolders, getPrimarySyncFolder } from "@/lib/vectordb/sync-service";
import { onFolderChange } from "@/lib/vectordb/folder-events";
import { taskRegistry } from "@/lib/background-tasks/registry";
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

function isFilesystemPathArg(arg: string): boolean {
    if (!arg || arg.startsWith("-")) {
        return false;
    }
    if (arg === "@modelcontextprotocol/server-filesystem" || arg === "server-filesystem") {
        return false;
    }
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
        return false;
    }
    // Recognize synced folder variables as valid path placeholders
    if (arg === "${SYNCED_FOLDER}" || arg === "${SYNCED_FOLDERS_ARRAY}" || arg === "${SYNCED_FOLDERS}") {
        return true;
    }
    return true;
}

function hasFilesystemPathArg(args?: string[]): boolean {
    if (!args || args.length === 0) {
        return false;
    }
    return args.some(isFilesystemPathArg);
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
    
    /** Track servers currently being connected to prevent race conditions */
    private connectingServers: Map<string, Promise<MCPServerStatus>> = new Map();

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
    private pendingReconnects: Map<string, NodeJS.Timeout> = new Map();
    private pendingConfigSync: {
        configuredServers: Set<string>;
        timeoutId: NodeJS.Timeout;
    } | null = null;

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
        // CRITICAL: Prevent double-spawning race condition
        // If already connecting to this server, wait for that connection to complete
        const existingConnection = this.connectingServers.get(serverName);
        if (existingConnection) {
            console.log(`[MCP] Connection to ${serverName} already in progress, waiting...`);
            return existingConnection;
        }

        // Create a promise that will be resolved when connection completes
        const connectionPromise = this._doConnect(serverName, config, characterId);
        this.connectingServers.set(serverName, connectionPromise);
        
        try {
            return await connectionPromise;
        } finally {
            this.connectingServers.delete(serverName);
        }
    }

    /**
     * Internal connection logic - called by connect() with race protection
     */
    private async _doConnect(
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
        
        // Skip if already connected with same context
        if (this.isConnected(serverName)) {
            const existingContext = this.serverCharacterContext.get(serverName);
            // If connected with same character context (or both undefined), skip reconnection
            if (existingContext === characterId) {
                console.log(`[MCP] Server ${serverName} already connected with same context, skipping`);
                return this.status.get(serverName) || {
                    serverName,
                    connected: true,
                    toolCount: this.tools.get(serverName)?.length || 0,
                    tools: this.tools.get(serverName)?.map(t => t.name) || [],
                };
            }
        }
        
        // Disconnect existing connection if any
        await this.disconnect(serverName);

        // Wait a brief moment for OS to reclaim resources (ports/files)
        // This helps with servers like Linear that bind local ports
        await new Promise(resolve => setTimeout(resolve, 500));

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
                const hasValidPath = hasFilesystemPathArg(config.args);
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

            try {
                await client.connect(transport);
            } catch (error: any) {
                // Check for ENOENT specifically (command not found)
                if (error?.code === "ENOENT" || error?.message?.includes("ENOENT")) {
                    const command = config.command || "npx";
                    throw new Error(
                        `Failed to start MCP server "${serverName}": Could not find "${command}". ` +
                        `This usually means Node.js is not installed or not in the system PATH. ` +
                        `\n\nTo fix this:\n` +
                        `1. Install Node.js from https://nodejs.org\n` +
                        `2. If using nvm/volta, ensure it's properly configured\n` +
                        `3. Restart Seline after installation\n` +
                        `\nOriginal error: ${error.message}`
                    );
                }
                throw error;
            }

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

        if (this.hasActiveScheduledTasks(characterId)) {
            this.deferReconnect(characterId);
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
     * Sync connections with config with scheduled-task safety.
     * Defers disconnects while scheduled tasks are running.
     */
    async syncWithConfigSafely(configuredServers: Set<string>): Promise<{
        disconnectedServers: string[];
        deferred: boolean;
    }> {
        if (this.hasActiveScheduledTasks()) {
            this.deferConfigSync(configuredServers);
            return { disconnectedServers: [], deferred: true };
        }

        if (this.pendingConfigSync) {
            clearTimeout(this.pendingConfigSync.timeoutId);
            this.pendingConfigSync = null;
        }

        const disconnectedServers = await this.syncWithConfig(configuredServers);
        return { disconnectedServers, deferred: false };
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

    private hasActiveScheduledTasks(characterId?: string): boolean {
        const { tasks } = taskRegistry.list({
            type: "scheduled",
            ...(characterId ? { characterId } : {}),
        });
        return tasks.some((task) => task.status === "running");
    }

    private deferReconnect(characterId: string): void {
        if (this.pendingReconnects.has(characterId)) {
            return;
        }
        console.log(`[MCP] Deferring reconnect for character ${characterId} until scheduled tasks complete`);
        const timeoutId = setTimeout(() => {
            this.pendingReconnects.delete(characterId);
            this.reconnectForCharacter(characterId).catch((error) => {
                console.error(`[MCP] Deferred reconnect failed for ${characterId}:`, error);
            });
        }, 60_000);
        this.pendingReconnects.set(characterId, timeoutId);
    }

    private deferConfigSync(configuredServers: Set<string>): void {
        if (this.pendingConfigSync) {
            clearTimeout(this.pendingConfigSync.timeoutId);
        }

        console.log("[MCP] Deferring config sync until scheduled tasks complete");
        const timeoutId = setTimeout(() => {
            const pending = this.pendingConfigSync;
            this.pendingConfigSync = null;
            if (!pending) return;
            this.syncWithConfigSafely(pending.configuredServers).catch((error) => {
                console.error("[MCP] Deferred config sync failed:", error);
            });
        }, 60_000);

        this.pendingConfigSync = { configuredServers, timeoutId };
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

        const getMcpFolders = async () => {
            return characterId ? await getSyncFolders(characterId) : await getAllSyncFolders();
        };

        // Handle ${SYNCED_FOLDER} - primary folder only
        if (resolved.includes("${SYNCED_FOLDER}")) {
            const primaryFolder = characterId
                ? await getPrimarySyncFolder(characterId)
                : (await getAllSyncFolders()).find(f => f.isPrimary);
            const primaryPath = primaryFolder?.folderPath || "";

            if (!primaryPath) {
                throw new Error(
                    "Cannot resolve ${SYNCED_FOLDER}: No synced folders found. " +
                    `Please sync a folder in Settings → Vector Search.`
                );
            }

            if (!validateFolderPath(primaryPath)) {
                throw new Error(`Invalid folder path: ${primaryPath}`);
            }

            resolved = resolved.replace(/\$\{SYNCED_FOLDER\}/g, primaryPath);
        }

        // Handle ${SYNCED_FOLDERS} - all folders, comma-separated (for single-arg tools)
        if (resolved.includes("${SYNCED_FOLDERS}")) {
            const folders = await getMcpFolders();

            if (folders.length === 0) {
                throw new Error(
                    "Cannot resolve ${SYNCED_FOLDERS}: No synced folders found."
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
        let resolvedArgs: string[] = [];
        if (config.args) {
            for (const arg of config.args) {
                if (arg === "${SYNCED_FOLDERS_ARRAY}") {
                    const folders = characterId ? await getSyncFolders(characterId) : await getAllSyncFolders();

                    if (folders.length === 0) {
                        throw new Error("Cannot resolve ${SYNCED_FOLDERS_ARRAY}: No synced folders found.");
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

        // Resolve ${SYNCED_FOLDER} and ${SYNCED_FOLDERS_ARRAY} variables
        {
            const hasVariables = resolvedArgs.some(arg =>
                arg?.includes("${SYNCED_FOLDER}") ||
                arg?.includes("${SYNCED_FOLDERS_ARRAY}") ||
                arg?.includes("${SYNCED_FOLDERS}")
            );

            if (hasVariables) {
                const folders = characterId ? await getSyncFolders(characterId) : await getAllSyncFolders();
                const primaryFolder = folders.find(f => f.isPrimary)?.folderPath || folders[0]?.folderPath || "";

                // Resolve each arg
                const newArgs: string[] = [];
                for (const arg of resolvedArgs) {
                    if (arg === "${SYNCED_FOLDER}") {
                        if (!primaryFolder) {
                            throw new Error("Cannot resolve ${SYNCED_FOLDER}: No synced folders found.");
                        }
                        newArgs.push(primaryFolder);
                    } else if (arg === "${SYNCED_FOLDERS_ARRAY}") {
                        if (folders.length === 0) {
                            throw new Error("Cannot resolve ${SYNCED_FOLDERS_ARRAY}: No synced folders found.");
                        }
                        // Expand array into multiple args
                        newArgs.push(...folders.map(f => f.folderPath));
                    } else if (arg === "${SYNCED_FOLDERS}") {
                        if (folders.length === 0) {
                            throw new Error("Cannot resolve ${SYNCED_FOLDERS}: No synced folders found.");
                        }
                        // Join as comma-separated string
                        newArgs.push(folders.map(f => f.folderPath).join(","));
                    } else {
                        newArgs.push(arg);
                    }
                }
                resolvedArgs = newArgs;
                console.log(`[MCP] Resolved synced folder variables for ${serverName}`);
            }
        }

        // Auto-inject paths for filesystem servers if still missing
        if (serverName === "filesystem" || serverName === "filesystem-multi") {
            const needsAutoPaths = !hasFilesystemPathArg(resolvedArgs);
            if (needsAutoPaths) {
                const folders = characterId ? await getSyncFolders(characterId) : await getAllSyncFolders();
                if (folders.length === 0) {
                    throw new Error(
                        "Cannot resolve filesystem MCP paths: No synced folders found."
                    );
                }

                const paths = serverName === "filesystem"
                    ? [folders.find(f => f.isPrimary)?.folderPath || folders[0].folderPath]
                    : folders.map(f => f.folderPath);

                for (const folderPath of paths) {
                    if (!validateFolderPath(folderPath)) {
                        throw new Error(`Invalid folder path in auto-attach: ${folderPath}`);
                    }
                }

                resolvedArgs.push(...paths);
                console.log(`[MCP] Auto-attached ${paths.length} synced folder(s) for ${serverName}`);
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
