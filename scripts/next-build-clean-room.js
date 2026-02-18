#!/usr/bin/env node

/**
 * Run `next build` in a clean room by temporarily moving local build artifacts
 * that should never be traced into `.next/standalone`.
 */

const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const projectRoot = process.cwd();
const quarantineRoot = path.join(projectRoot, ".next-build-quarantine");
const movableNames = ["dist-electron"];

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function moveIfPresent(name) {
  const sourcePath = path.join(projectRoot, name);
  if (!(await pathExists(sourcePath))) {
    return null;
  }

  await ensureDir(quarantineRoot);
  const destinationPath = path.join(quarantineRoot, name);

  if (await pathExists(destinationPath)) {
    await fs.rm(destinationPath, { recursive: true, force: true });
  }

  await fs.rename(sourcePath, destinationPath);
  console.log(`[build-clean-room] Moved ${name} to quarantine.`);

  return { name, sourcePath, destinationPath };
}

async function restoreMove(move) {
  if (!move) {
    return;
  }

  if (await pathExists(move.sourcePath)) {
    await fs.rm(move.sourcePath, { recursive: true, force: true });
  }

  await fs.rename(move.destinationPath, move.sourcePath);
  console.log(`[build-clean-room] Restored ${move.name}.`);
}

async function cleanupQuarantineDir() {
  if (!(await pathExists(quarantineRoot))) {
    return;
  }
  const entries = await fs.readdir(quarantineRoot);
  if (entries.length === 0) {
    await fs.rmdir(quarantineRoot);
  }
}

function runNextBuild() {
  return new Promise((resolve, reject) => {
    const buildEnv = { ...process.env };

    // Next.js evaluates server modules during `next build` page-data collection.
    // Provide ephemeral defaults for required internal secrets if missing so
    // packaging builds do not fail before runtime env injection.
    if (!buildEnv.INTERNAL_API_SECRET) {
      buildEnv.INTERNAL_API_SECRET = `build-secret-${crypto.randomBytes(16).toString("hex")}`;
      console.warn("[build-clean-room] INTERNAL_API_SECRET missing; using ephemeral build-time value.");
    }

    if (!buildEnv.REMOTION_MEDIA_TOKEN) {
      buildEnv.REMOTION_MEDIA_TOKEN = `build-media-${crypto.randomBytes(16).toString("hex")}`;
      console.warn("[build-clean-room] REMOTION_MEDIA_TOKEN missing; using ephemeral build-time value.");
    }

    const child = spawn(
      process.execPath,
      [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "build"],
      {
        cwd: projectRoot,
        stdio: "inherit",
        env: buildEnv,
      }
    );

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`next build terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const moves = [];
  let exitCode = 1;

  try {
    for (const name of movableNames) {
      moves.push(await moveIfPresent(name));
    }

    exitCode = await runNextBuild();
  } finally {
    for (const move of moves.reverse()) {
      try {
        await restoreMove(move);
      } catch (error) {
        console.error("[build-clean-room] Failed to restore moved directory:", error);
        exitCode = 1;
      }
    }
    try {
      await cleanupQuarantineDir();
    } catch (error) {
      console.error("[build-clean-room] Failed to clean quarantine directory:", error);
      exitCode = 1;
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error("[build-clean-room] Fatal error:", error);
  process.exit(1);
});
