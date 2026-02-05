#!/usr/bin/env node
/**
 * Wrapper script to start Next.js dev server with valid stdio descriptors
 *
 * This fixes EBADF errors that occur when Next.js tries to fork worker processes
 * in environments where stdio descriptors may be invalid (e.g., Electron dev mode).
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('[dev-wrapper] Starting Next.js dev server with stdio fix...');

// Ensure stdio descriptors exist and are valid
// If any descriptor is invalid, redirect it to /dev/null (or NUL on Windows)
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';

// Check if stdio descriptors are valid by attempting to stat them
const ensureValidStdio = () => {
  const descriptors = [0, 1, 2]; // stdin, stdout, stderr
  const validDescriptors = [];

  for (const fd of descriptors) {
    try {
      // Try to get the file descriptor status
      fs.fstatSync(fd);
      validDescriptors.push('inherit');
    } catch (error) {
      // If fstat fails, the descriptor is invalid
      console.warn(`[dev-wrapper] Warning: stdio descriptor ${fd} is invalid, will use pipe`);
      validDescriptors.push('pipe');
    }
  }

  return validDescriptors;
};

const stdio = ensureValidStdio();

// Start Next.js dev server with explicit stdio configuration
const child = spawn('npx', ['next', 'dev'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    // Force stdio to be valid
    FORCE_COLOR: '1',
  },
  stdio: stdio, // Use the validated stdio configuration
  shell: process.platform === 'win32', // Windows needs shell to find npx.cmd
});

// If we had to use 'pipe' for any descriptor, manually forward the streams
if (stdio[1] === 'pipe' && child.stdout) {
  child.stdout.pipe(process.stdout);
}
if (stdio[2] === 'pipe' && child.stderr) {
  child.stderr.pipe(process.stderr);
}

child.on('error', (error) => {
  console.error('[dev-wrapper] Failed to start Next.js:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.log(`[dev-wrapper] Next.js exited with signal ${signal}`);
    process.exit(1);
  } else {
    console.log(`[dev-wrapper] Next.js exited with code ${code}`);
    process.exit(code || 0);
  }
});

// Forward termination signals to child
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGHUP', () => child.kill('SIGHUP'));
