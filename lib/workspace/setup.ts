/**
 * Workspace Setup
 *
 * Manages the user's workspace directory for storing documents and files
 * that can be synced with AI agents.
 */

import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

/**
 * Get the path to the user's workspace directory
 * Creates the directory if it doesn't exist
 *
 * Location: ~/.seline/workspace or similar platform-specific location
 */
export function getUserWorkspacePath(): string {
  // In Electron main process, use app.getPath('userData')
  // In Next.js/non-Electron, fall back to local data directory
  let userDataPath: string;

  try {
    // Try to import electron app
    const { app } = require('electron');
    userDataPath = app.getPath('userData');
  } catch {
    // Not in Electron, use local data directory
    userDataPath = join(process.cwd(), '.local-data');
  }

  const workspacePath = join(userDataPath, 'workspace');

  // Ensure directory exists
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
    console.log(`[Workspace] Created workspace directory at: ${workspacePath}`);
  }

  return workspacePath;
}

/**
 * Initialize the workspace directory on app startup
 * This ensures the directory exists before any agents try to use it
 */
export function initializeWorkspace(): void {
  try {
    getUserWorkspacePath();
    console.log('[Workspace] Workspace initialized successfully');
  } catch (error) {
    console.error('[Workspace] Failed to initialize workspace:', error);
  }
}
