/**
 * Event system for folder changes
 * Separated to avoid pulling in heavy server-side dependencies (fs, chokidar) 
 * into other modules like MCPClientManager.
 */

export type FolderChangeEvent = {
    type: "added" | "removed" | "updated" | "primary_changed"
    | "mcp_reload_started" | "mcp_reload_completed" | "mcp_reload_failed";
    folderId: string;
    wasPrimary?: boolean;
    // MCP reload tracking fields
    serverName?: string;
    totalServers?: number;
    completedServers?: number;
    estimatedDuration?: number; // milliseconds
    error?: string;
};

type FolderChangeListener = (characterId: string, event: FolderChangeEvent) => void;

const folderChangeListeners: FolderChangeListener[] = [];

/**
 * Subscribe to folder changes
 */
export function onFolderChange(listener: FolderChangeListener) {
    folderChangeListeners.push(listener);
    return () => {
        const index = folderChangeListeners.indexOf(listener);
        if (index > -1) folderChangeListeners.splice(index, 1);
    };
}

/**
 * Notify listeners of a folder change
 */
export function notifyFolderChange(characterId: string, event: FolderChangeEvent) {
    folderChangeListeners.forEach(listener => {
        try {
            listener(characterId, event);
        } catch (error) {
            console.error("[FolderEvents] Listener error:", error);
        }
    });
}
