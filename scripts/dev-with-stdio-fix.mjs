#!/usr/bin/env node
/**
 * Wrapper script to start Next.js dev server with resilient watcher behavior.
 *
 * - Keeps stdio descriptors valid for Electron dev mode.
 * - Detects EMFILE/ENOSPC watcher failures from Next.js output.
 * - Restarts once in polling mode to avoid hard failure on large trees.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const WATCH_RESOURCE_ERROR_REGEX = /(EMFILE|ENOSPC|too many open files|System limit for number of file watchers reached)/i;
const DEFAULT_POLL_INTERVAL_MS = Number.parseInt(process.env.NEXT_WATCH_POLL_INTERVAL || '1000', 10);
const pollIntervalMs = Number.isFinite(DEFAULT_POLL_INTERVAL_MS) && DEFAULT_POLL_INTERVAL_MS > 0
  ? DEFAULT_POLL_INTERVAL_MS
  : 1000;

let hasRetriedWithPolling = ['1', 'true', 'yes', 'on'].includes((process.env.NEXT_WATCH_POLLING || '').toLowerCase());
let currentChild = null;
let shuttingDown = false;
let intentionalRestart = false;
const serverMetrics = {
  attempts: 0,
  mode: hasRetriedWithPolling ? 'polling' : 'native',
  startTimeMs: Date.now(),
};

console.log('[dev-wrapper] Starting Next.js dev server with watcher resilience...');

const ensureValidStdio = () => {
  const descriptors = [0, 1, 2];
  const validDescriptors = [];

  for (const fd of descriptors) {
    try {
      fs.fstatSync(fd);
      validDescriptors.push('inherit');
    } catch {
      console.warn(`[dev-wrapper] Warning: stdio descriptor ${fd} is invalid, using pipe`);
      validDescriptors.push('pipe');
    }
  }

  return validDescriptors;
};

const stdio = ensureValidStdio();

function logResourceMetrics(label) {
  const memory = process.memoryUsage();
  const uptimeMs = Date.now() - serverMetrics.startTimeMs;
  const rssMb = Math.round(memory.rss / 1024 / 1024);
  const heapUsedMb = Math.round(memory.heapUsed / 1024 / 1024);
  console.log(`[dev-wrapper] ${label} metrics mode=${serverMetrics.mode} attempts=${serverMetrics.attempts} uptimeMs=${uptimeMs} rssMb=${rssMb} heapUsedMb=${heapUsedMb}`);
}

function createNextEnv({ polling }) {
  const baseEnv = {
    ...process.env,
    FORCE_COLOR: '1',
  };

  if (!polling) {
    return baseEnv;
  }

  return {
    ...baseEnv,
    NEXT_WATCH_POLLING: '1',
    WATCHPACK_POLLING: 'true',
    CHOKIDAR_USEPOLLING: '1',
    WATCHPACK_POLL_INTERVAL: String(pollIntervalMs),
    CHOKIDAR_INTERVAL: String(pollIntervalMs),
  };
}

function startNext({ polling }) {
  serverMetrics.attempts += 1;
  serverMetrics.mode = polling ? 'polling' : 'native';

  console.log(`[dev-wrapper] Launching Next.js (${serverMetrics.mode} watch mode)...`);

  const child = spawn('npx', ['next', 'dev'], {
    cwd: projectRoot,
    env: createNextEnv({ polling }),
    stdio,
    shell: process.platform === 'win32',
  });

  currentChild = child;

  if (stdio[1] === 'pipe' && child.stdout) {
    child.stdout.pipe(process.stdout);
  }
  if (stdio[2] === 'pipe' && child.stderr) {
    child.stderr.pipe(process.stderr);
  }

  const handleOutputChunk = (chunk) => {
    const text = chunk.toString();

    if (!WATCH_RESOURCE_ERROR_REGEX.test(text)) {
      return;
    }

    logResourceMetrics('watcher-resource-error');

    if (hasRetriedWithPolling || polling || shuttingDown) {
      console.warn('[dev-wrapper] Watcher resource error detected while already in degraded mode.');
      console.warn('[dev-wrapper] Consider increasing open file limits (e.g. ulimit -n 65536) or adding entries to .watchignore.');
      return;
    }

    hasRetriedWithPolling = true;
    intentionalRestart = true;

    console.warn('[dev-wrapper] Detected watcher resource exhaustion (EMFILE/ENOSPC). Restarting in polling mode...');
    console.warn(`[dev-wrapper] Poll interval set to ${pollIntervalMs}ms. You can tune with NEXT_WATCH_POLL_INTERVAL.`);

    if (currentChild && !currentChild.killed) {
      currentChild.kill('SIGTERM');
    }
  };

  child.stdout?.on('data', handleOutputChunk);
  child.stderr?.on('data', handleOutputChunk);

  child.on('error', (error) => {
    console.error('[dev-wrapper] Failed to start Next.js:', error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    const isCurrent = currentChild === child;

    if (!isCurrent) {
      return;
    }

    if (intentionalRestart && !shuttingDown) {
      intentionalRestart = false;
      startNext({ polling: true });
      return;
    }

    if (shuttingDown) {
      process.exit(0);
      return;
    }

    if (signal) {
      console.log(`[dev-wrapper] Next.js exited with signal ${signal}`);
      process.exit(1);
      return;
    }

    console.log(`[dev-wrapper] Next.js exited with code ${code}`);
    process.exit(code || 0);
  });
}

function forwardSignal(signal) {
  shuttingDown = true;
  if (currentChild && !currentChild.killed) {
    currentChild.kill(signal);
  }
}

process.on('SIGTERM', () => forwardSignal('SIGTERM'));
process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGHUP', () => forwardSignal('SIGHUP'));

startNext({ polling: hasRetriedWithPolling });
