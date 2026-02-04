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
 * Location: ~/.seline/workspace (user home directory)
 */
export function getUserWorkspacePath(): string {
  // Use user's home directory, NOT the app data directory
  // This keeps workspace separate from app internals
  const { homedir } = require('os');
  const homeDir = homedir();
  const workspacePath = join(homeDir, '.seline', 'workspace');

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
