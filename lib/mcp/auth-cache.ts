/**
 * MCP Auth Cache Management
 * 
 * Handles clearing OAuth credentials cached by mcp-remote.
 * mcp-remote stores credentials in ~/.mcp-auth directory (or MCP_REMOTE_CONFIG_DIR).
 * 
 * This is necessary to force re-authentication when:
 * - User wants to switch to a different account
 * - OAuth tokens have expired or been revoked
 * - Authentication is in a broken state
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

/**
 * Get the mcp-remote auth cache directory
 * Default is ~/.mcp-auth but can be overridden by MCP_REMOTE_CONFIG_DIR
 */
function getMCPAuthCacheDir(): string {
    return process.env.MCP_REMOTE_CONFIG_DIR || path.join(os.homedir(), ".mcp-auth");
}

/**
 * Generate the hash that mcp-remote uses for server-specific cache files
 * mcp-remote uses SHA-256 hash of the server URL to create unique cache files
 */
function getServerHash(serverUrl: string): string {
    return crypto.createHash("sha256").update(serverUrl).digest("hex").substring(0, 16);
}

/**
 * Clear all MCP auth cache (equivalent to rm -rf ~/.mcp-auth)
 * This will force re-authentication for all MCP servers
 */
export async function clearMCPAuthCache(): Promise<{ success: boolean; error?: string }> {
    const cacheDir = getMCPAuthCacheDir();
    
    try {
        // Check if directory exists
        try {
            await fs.access(cacheDir);
        } catch {
            // Directory doesn't exist, nothing to clear
            console.log("[MCP Auth] Cache directory doesn't exist, nothing to clear");
            return { success: true };
        }

        // Read directory contents
        const files = await fs.readdir(cacheDir);
        
        // Delete all files in the cache directory
        for (const file of files) {
            const filePath = path.join(cacheDir, file);
            try {
                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    // Recursively remove subdirectories
                    await fs.rm(filePath, { recursive: true, force: true });
                } else {
                    await fs.unlink(filePath);
                }
            } catch (error) {
                console.warn(`[MCP Auth] Failed to delete ${filePath}:`, error);
            }
        }

        console.log(`[MCP Auth] Cleared ${files.length} files from cache directory`);
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[MCP Auth] Failed to clear cache:", error);
        return { success: false, error: errorMessage };
    }
}

/**
 * Clear MCP auth cache for a specific server URL
 * This only removes the cache files associated with that server
 */
export async function clearMCPAuthCacheForServer(
    serverUrl: string
): Promise<{ success: boolean; error?: string; filesDeleted?: number }> {
    const cacheDir = getMCPAuthCacheDir();
    const serverHash = getServerHash(serverUrl);
    
    try {
        // Check if directory exists
        try {
            await fs.access(cacheDir);
        } catch {
            console.log("[MCP Auth] Cache directory doesn't exist, nothing to clear");
            return { success: true, filesDeleted: 0 };
        }

        const files = await fs.readdir(cacheDir);
        let deletedCount = 0;

        // Delete files that match the server hash
        // mcp-remote creates files like: {hash}_tokens.json, {hash}_client.json, {hash}_debug.log
        for (const file of files) {
            if (file.startsWith(serverHash)) {
                const filePath = path.join(cacheDir, file);
                try {
                    await fs.unlink(filePath);
                    deletedCount++;
                    console.log(`[MCP Auth] Deleted cache file: ${file}`);
                } catch (error) {
                    console.warn(`[MCP Auth] Failed to delete ${filePath}:`, error);
                }
            }
        }

        console.log(`[MCP Auth] Cleared ${deletedCount} cache files for server: ${serverUrl}`);
        return { success: true, filesDeleted: deletedCount };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[MCP Auth] Failed to clear server cache:", error);
        return { success: false, error: errorMessage };
    }
}

/**
 * Check if MCP auth cache exists for a server
 */
export async function hasMCPAuthCache(serverUrl: string): Promise<boolean> {
    const cacheDir = getMCPAuthCacheDir();
    const serverHash = getServerHash(serverUrl);
    
    try {
        await fs.access(cacheDir);
        const files = await fs.readdir(cacheDir);
        return files.some(file => file.startsWith(serverHash));
    } catch {
        return false;
    }
}

