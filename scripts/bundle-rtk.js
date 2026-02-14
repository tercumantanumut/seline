#!/usr/bin/env node

/**
 * Bundle RTK binary into binaries/rtk/<platform>/ for Electron packaging.
 *
 * Resolution order:
 * 1) Existing bundled binary in binaries/rtk/<platform>/
 * 2) RTK_BINARY_PATH env var (copy local binary)
 * 3) Download from latest GitHub release asset
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUTPUT_ROOT = path.join(ROOT, "binaries", "rtk");

function getTargetConfig() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && arch === "arm64") {
    return {
      platformDir: "macos-arm64",
      binaryName: "rtk",
      assetName: "rtk-aarch64-apple-darwin.tar.gz",
    };
  }

  if (platform === "darwin" && arch === "x64") {
    return {
      platformDir: "macos-x64",
      binaryName: "rtk",
      assetName: "rtk-x86_64-apple-darwin.tar.gz",
    };
  }

  if (platform === "linux" && arch === "arm64") {
    return {
      platformDir: "linux-arm64",
      binaryName: "rtk",
      assetName: "rtk-aarch64-unknown-linux-gnu.tar.gz",
    };
  }

  if (platform === "linux" && arch === "x64") {
    return {
      platformDir: "linux-x64",
      binaryName: "rtk",
      assetName: "rtk-x86_64-unknown-linux-gnu.tar.gz",
    };
  }

  if (platform === "win32" && arch === "x64") {
    return {
      platformDir: "windows-x64",
      binaryName: "rtk.exe",
      assetName: "rtk-x86_64-pc-windows-msvc.zip",
    };
  }

  if (platform === "win32" && arch === "arm64") {
    return {
      platformDir: "windows-arm64",
      binaryName: "rtk.exe",
      assetName: "rtk-aarch64-pc-windows-msvc.zip",
    };
  }

  return null;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function removeDirSafe(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

function findFileRecursive(rootDir, fileName) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        return fullPath;
      }
    }
  }
  return null;
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (HTTP ${response.status})`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, data);
}

function extractArchive(archivePath, outputDir) {
  ensureDir(outputDir);

  if (archivePath.endsWith(".tar.gz")) {
    execFileSync("tar", ["-xzf", archivePath, "-C", outputDir], { stdio: "pipe" });
    return;
  }

  if (archivePath.endsWith(".zip")) {
    try {
      execFileSync("tar", ["-xf", archivePath, "-C", outputDir], { stdio: "pipe" });
      return;
    } catch {
      if (process.platform !== "win32") {
        throw new Error("Failed to extract zip archive and no Windows fallback is available");
      }
      const psCmd = `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`;
      execFileSync("powershell", ["-NoProfile", "-Command", psCmd], { stdio: "pipe" });
      return;
    }
  }

  throw new Error(`Unsupported archive format: ${archivePath}`);
}

async function main() {
  const target = getTargetConfig();
  if (!target) {
    console.log(`[RTK bundle] Unsupported platform: ${process.platform}-${process.arch}`);
    process.exit(0);
  }

  const platformOutDir = path.join(OUTPUT_ROOT, target.platformDir);
  const outBinaryPath = path.join(platformOutDir, target.binaryName);
  ensureDir(platformOutDir);

  if (fs.existsSync(outBinaryPath)) {
    console.log(`[RTK bundle] Reusing existing binary: ${outBinaryPath}`);
    process.exit(0);
  }

  const explicitBinary = process.env.RTK_BINARY_PATH;
  if (explicitBinary && fs.existsSync(explicitBinary)) {
    fs.copyFileSync(explicitBinary, outBinaryPath);
    if (process.platform !== "win32") {
      fs.chmodSync(outBinaryPath, 0o755);
    }
    console.log(`[RTK bundle] Copied RTK from RTK_BINARY_PATH to ${outBinaryPath}`);
    process.exit(0);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "seline-rtk-"));
  const archivePath = path.join(tmpDir, target.assetName);
  const extractDir = path.join(tmpDir, "extract");
  const assetUrl = `https://github.com/rtk-ai/rtk/releases/latest/download/${target.assetName}`;

  try {
    console.log(`[RTK bundle] Downloading ${assetUrl}`);
    await downloadToFile(assetUrl, archivePath);

    extractArchive(archivePath, extractDir);

    const extractedBinary = findFileRecursive(extractDir, target.binaryName)
      || findFileRecursive(extractDir, process.platform === "win32" ? "rtk.exe" : "rtk");

    if (!extractedBinary) {
      throw new Error(`Could not find ${target.binaryName} in downloaded archive`);
    }

    fs.copyFileSync(extractedBinary, outBinaryPath);
    if (process.platform !== "win32") {
      fs.chmodSync(outBinaryPath, 0o755);
    }

    console.log(`[RTK bundle] Bundled RTK binary: ${outBinaryPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[RTK bundle] Failed: ${message}`);
    process.exitCode = 1;
  } finally {
    removeDirSafe(tmpDir);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`[RTK bundle] Unexpected failure: ${message}`);
  process.exit(1);
});
