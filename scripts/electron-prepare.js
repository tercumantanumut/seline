const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Cross-platform script to prepare the Electron build.
 * Handles missing 'public' folder and ensures directory structure.
 */

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const standaloneNextDir = path.join(standaloneDir, '.next');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;

    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        ensureDir(dest);
        fs.readdirSync(src).forEach(child => {
            copyRecursive(path.join(src, child), path.join(dest, child));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function removePath(targetPath) {
    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
    }
}

function ensureExecutable(filePath) {
    if (!fs.existsSync(filePath) || process.platform === "win32") return;
    fs.chmodSync(filePath, 0o755);
}


/**
 * Download the official Node.js binary from nodejs.org.
 *
 * Official binaries are fully statically linked (openssl, icu, libuv, etc.)
 * and have zero external dylib dependencies beyond macOS system libraries.
 * This is critical because Homebrew/nvm Node binaries dynamically link against
 * ~10 Homebrew dylibs that do NOT exist on end users' machines.
 *
 * @param {string} nodeVersion - e.g. "22.17.1"
 * @param {string} destPath - absolute path where the binary should be written
 * @returns {boolean} true if download succeeded
 */
function downloadOfficialNodeBinary(nodeVersion, destPath) {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const platform = process.platform === 'darwin' ? 'darwin' : 'win';

    if (process.platform === 'win32') {
        // Windows: download .exe directly
        const url = `https://nodejs.org/dist/v${nodeVersion}/win-${arch}/node.exe`;
        console.log(`  Downloading official Node.js v${nodeVersion} for Windows ${arch}...`);
        console.log(`  URL: ${url}`);
        try {
            execSync(`curl -fsSL "${url}" -o "${destPath}"`, { stdio: 'inherit', timeout: 120000 });
            return true;
        } catch (error) {
            console.error(`  Failed to download Node.js: ${error.message}`);
            return false;
        }
    }

    // macOS: download tarball and extract the binary
    const tarballName = `node-v${nodeVersion}-${platform}-${arch}`;
    const url = `https://nodejs.org/dist/v${nodeVersion}/${tarballName}.tar.gz`;
    const tempDir = path.join(require('os').tmpdir(), `node-download-${Date.now()}`);

    console.log(`  Downloading official Node.js v${nodeVersion} for macOS ${arch}...`);
    console.log(`  URL: ${url}`);

    try {
        fs.mkdirSync(tempDir, { recursive: true });
        // Download and extract only the bin/node file
        execSync(
            `curl -fsSL "${url}" | tar -xz -C "${tempDir}" "${tarballName}/bin/node"`,
            { stdio: 'inherit', timeout: 120000 }
        );

        const extractedBinary = path.join(tempDir, tarballName, 'bin', 'node');
        if (!fs.existsSync(extractedBinary)) {
            console.error(`  Error: Extracted binary not found at ${extractedBinary}`);
            return false;
        }

        fs.copyFileSync(extractedBinary, destPath);
        // Clean up temp dir
        fs.rmSync(tempDir, { recursive: true, force: true });
        return true;
    } catch (error) {
        console.error(`  Failed to download Node.js: ${error.message}`);
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        return false;
    }
}

function pruneOnnxRuntime(baseDir, napiDirName, keepOs, keepArch) {
    const napiDir = path.join(baseDir, "bin", napiDirName);
    if (!fs.existsSync(napiDir)) return;

    for (const entry of fs.readdirSync(napiDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name !== keepOs) {
            removePath(path.join(napiDir, entry.name));
            continue;
        }

        const archDir = path.join(napiDir, entry.name);
        for (const archEntry of fs.readdirSync(archDir, { withFileTypes: true })) {
            if (!archEntry.isDirectory()) continue;
            if (archEntry.name !== keepArch) {
                removePath(path.join(archDir, archEntry.name));
            }
        }
    }
}

function pruneRemotionCompositors(remotionDir, keepOs) {
    if (!fs.existsSync(remotionDir)) return;

    for (const entry of fs.readdirSync(remotionDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!entry.name.startsWith("compositor-")) continue;
        if (!entry.name.includes(keepOs)) {
            removePath(path.join(remotionDir, entry.name));
        }
    }
}

function pruneEsbuildBinaries(esbuildRoot, keepOs, keepArch) {
    if (!fs.existsSync(esbuildRoot)) return;

    for (const entry of fs.readdirSync(esbuildRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        const isPlatformDir = /^(aix|android|darwin|freebsd|linux|netbsd|openbsd|sunos|win32)/.test(name);
        if (!isPlatformDir) continue;

        const expected = `${keepOs}-${keepArch}`;
        if (name !== expected) {
            removePath(path.join(esbuildRoot, name));
        }
    }
}

function pruneStandaloneForPlatform(standaloneRoot) {
    const platform = process.platform;
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const keepOs = platform === "win32" ? "win32" : platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : null;

    if (!keepOs) return;

    removePath(path.join(standaloneRoot, "node_modules", ".cache"));

    const ortPaths = [
        path.join(standaloneRoot, "node_modules", "onnxruntime-node"),
        path.join(standaloneRoot, "node_modules", "@huggingface", "transformers", "node_modules", "onnxruntime-node"),
    ];
    for (const ortPath of ortPaths) {
        pruneOnnxRuntime(ortPath, "napi-v6", keepOs, arch);
        pruneOnnxRuntime(ortPath, "napi-v3", keepOs, arch);
    }
    pruneRemotionCompositors(path.join(standaloneRoot, "node_modules", "@remotion"), keepOs);

    pruneEsbuildBinaries(path.join(standaloneRoot, "node_modules", "@esbuild"), keepOs, arch);
    pruneEsbuildBinaries(path.join(standaloneRoot, "node_modules", "@remotion", "bundler", "node_modules", "@esbuild"), keepOs, arch);
}

console.log('--- Electron Prepare ---');

// 0. Remove build artifacts and sensitive files that Next.js standalone copies from project root
// These would otherwise bloat the final package (dist-electron alone is 600MB+)
// Keep heavy resources (models/comfyui/binaries) out of standalone; they are copied via
// dedicated electron-builder extraResources rules with platform-aware filtering.
const standaloneJunk = [
    'dist-electron',
    '.git',
    '.env.local',
    '.env.example',
    '.local-data',
    'comfyui_backend',
    'models',
    'binaries',
    // Source code directories - Next.js standalone copies the project root,
    // but we only need the compiled server.js and .next/ output, not source code
    'app',
    'components',
    'hooks',
    'i18n',
    'seline-source',
];
for (const name of standaloneJunk) {
    const target = path.join(standaloneDir, name);
    if (fs.existsSync(target)) {
        console.log(`Removing ${name} from standalone...`);
        removePath(target);
    }
}

// 1. Ensure .next/standalone/.next exists
console.log('Ensuring directory structure...');
ensureDir(standaloneNextDir);

// 2. Copy public folder if it exists
const publicSrc = path.join(rootDir, 'public');
const publicDest = path.join(standaloneDir, 'public');
if (fs.existsSync(publicSrc)) {
    console.log('Copying public folder...');
    copyRecursive(publicSrc, publicDest);
} else {
    console.log('Skipping public folder (not found)');
}

// 3. Copy .next/static
console.log('Copying .next/static...');
const staticSrc = path.join(rootDir, '.next', 'static');
const staticDest = path.join(standaloneNextDir, 'static');
copyRecursive(staticSrc, staticDest);

// 4. Copy lib folder
console.log('Copying lib folder...');
const libSrc = path.join(rootDir, 'lib');
const libDest = path.join(standaloneDir, 'lib');
copyRecursive(libSrc, libDest);

// 5. Copy @remotion folder
console.log('Copying @remotion folder...');
const remotionSrc = path.join(rootDir, 'node_modules', '@remotion');
const remotionDest = path.join(standaloneDir, 'node_modules', '@remotion');
if (fs.existsSync(remotionSrc)) {
    ensureDir(path.dirname(remotionDest));
    if (fs.existsSync(remotionDest)) {
        fs.rmSync(remotionDest, { recursive: true, force: true });
    }
    copyRecursive(remotionSrc, remotionDest);
} else {
    console.log('Skipping @remotion folder (not found)');
}

// 6. Copy pdf-parse and its dependencies for PDF parsing support
// pdf-parse requires: pdfjs-dist (PDF.js library) and @napi-rs/canvas (native canvas bindings)
const pdfDependencies = [
    { name: 'pdf-parse', src: 'pdf-parse', dest: 'pdf-parse' },
    { name: 'pdfjs-dist', src: 'pdfjs-dist', dest: 'pdfjs-dist' },
    { name: '@napi-rs/canvas', src: '@napi-rs', dest: '@napi-rs' },
];

for (const dep of pdfDependencies) {
    console.log(`Copying ${dep.name} folder...`);
    const depSrc = path.join(rootDir, 'node_modules', dep.src);
    const depDest = path.join(standaloneDir, 'node_modules', dep.dest);
    if (fs.existsSync(depSrc)) {
        ensureDir(path.dirname(depDest));
        if (fs.existsSync(depDest)) {
            fs.rmSync(depDest, { recursive: true, force: true });
        }
        copyRecursive(depSrc, depDest);
    } else {
        console.log(`Skipping ${dep.name} folder (not found)`);
    }
}

// 7. Copy Puppeteer and bundled Chromium for local web scraping
const browserDependencies = [
    { name: 'puppeteer', src: 'puppeteer', dest: 'puppeteer' },
];

for (const dep of browserDependencies) {
    console.log(`Copying ${dep.name} folder...`);
    const depSrc = path.join(rootDir, 'node_modules', dep.src);
    const depDest = path.join(standaloneDir, 'node_modules', dep.dest);
    if (fs.existsSync(depSrc)) {
        ensureDir(path.dirname(depDest));
        if (fs.existsSync(depDest)) {
            fs.rmSync(depDest, { recursive: true, force: true });
        }
        copyRecursive(depSrc, depDest);
    } else {
        console.log(`Skipping ${dep.name} folder (not found)`);
    }
}

// 8. Copy npm CLI for bundled npx/npm support in production
const npmDependencies = [
    { name: 'npm', src: 'npm', dest: 'npm' },
];

for (const dep of npmDependencies) {
    console.log(`Copying ${dep.name} folder...`);
    const depSrc = path.join(rootDir, 'node_modules', dep.src);
    const depDest = path.join(standaloneDir, 'node_modules', dep.dest);
    if (fs.existsSync(depSrc)) {
        ensureDir(path.dirname(depDest));
        if (fs.existsSync(depDest)) {
            fs.rmSync(depDest, { recursive: true, force: true });
        }
        copyRecursive(depSrc, depDest);
    } else {
        console.log(`Skipping ${dep.name} folder (not found)`);
    }
}

// 9. Copy local embedding dependencies for offline Transformers.js support
const embeddingDependencies = [
    { name: '@huggingface/transformers', src: '@huggingface/transformers', dest: '@huggingface/transformers' },
    { name: 'onnxruntime-node', src: 'onnxruntime-node', dest: 'onnxruntime-node' },
];

for (const dep of embeddingDependencies) {
    console.log(`Copying ${dep.name} folder...`);
    const depSrc = path.join(rootDir, 'node_modules', dep.src);
    const depDest = path.join(standaloneDir, 'node_modules', dep.dest);
    if (fs.existsSync(depSrc)) {
        ensureDir(path.dirname(depDest));
        if (fs.existsSync(depDest)) {
            fs.rmSync(depDest, { recursive: true, force: true });
        }
        copyRecursive(depSrc, depDest);
    } else {
        console.log(`Skipping ${dep.name} folder (not found)`);
    }
}

// 10. Copy rebuilt native modules from root node_modules to standalone
// This is critical because Next.js standalone doesn't include build files (binding.gyp, src/, deps/)
// needed by electron-rebuild. We rebuild in root node_modules first, then copy the binaries here.
console.log('Copying rebuilt native module binaries...');

const nativeModuleBinaries = [
    {
        name: 'better-sqlite3',
        src: 'better-sqlite3/build/Release/better_sqlite3.node',
        dest: 'better-sqlite3/build/Release/better_sqlite3.node'
    },
];

for (const mod of nativeModuleBinaries) {
    const srcPath = path.join(rootDir, 'node_modules', mod.src);
    const destPath = path.join(standaloneDir, 'node_modules', mod.dest);

    if (fs.existsSync(srcPath)) {
        console.log(`Copying ${mod.name} native binary...`);
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
        const srcStats = fs.statSync(srcPath);
        const destStats = fs.statSync(destPath);
        console.log(`  Source: ${srcStats.size} bytes`);
        console.log(`  Destination: ${destStats.size} bytes`);
    } else {
        console.warn(`Warning: ${mod.name} native binary not found at ${srcPath}`);
    }
}

// 11. Prune platform-specific binaries and caches from standalone
console.log('Pruning standalone dependencies for current platform...');
pruneStandaloneForPlatform(standaloneDir);

// 12. Bundle apply_patch shim so Codex-style patches work in packaged builds.
console.log('Bundling apply_patch compatibility shim...');
const bundledToolsSrcDir = path.join(rootDir, 'scripts', 'bundled-tools');
const bundledToolsDestDir = path.join(standaloneDir, 'tools', 'bin');
const applyPatchLauncherSrc = path.join(bundledToolsSrcDir, 'apply_patch');
const applyPatchRuntimeSrc = path.join(bundledToolsSrcDir, 'apply_patch.js');
const applyPatchLauncherDest = path.join(bundledToolsDestDir, 'apply_patch');
const applyPatchRuntimeDest = path.join(bundledToolsDestDir, 'apply_patch.js');

const applyPatchCmdSrc = path.join(bundledToolsSrcDir, 'apply_patch.cmd');
const applyPatchCmdDest = path.join(bundledToolsDestDir, 'apply_patch.cmd');

if (fs.existsSync(applyPatchLauncherSrc) && fs.existsSync(applyPatchRuntimeSrc)) {
    ensureDir(bundledToolsDestDir);
    fs.copyFileSync(applyPatchLauncherSrc, applyPatchLauncherDest);
    fs.copyFileSync(applyPatchRuntimeSrc, applyPatchRuntimeDest);
    if (fs.existsSync(applyPatchCmdSrc)) {
        fs.copyFileSync(applyPatchCmdSrc, applyPatchCmdDest);
    }
    ensureExecutable(applyPatchLauncherDest);
    ensureExecutable(applyPatchRuntimeDest);
    console.log('  Bundled apply_patch shim into standalone/tools/bin');
} else {
    console.warn('  Warning: apply_patch shim sources missing, skipping apply_patch bundling');
}

// 13. Bundle ffmpeg static binary for audio conversion (whisper.cpp preprocessing)
console.log('Bundling ffmpeg static binary...');
try {
    const ffmpegStaticPath = require.resolve('ffmpeg-static');
    if (fs.existsSync(ffmpegStaticPath)) {
        const ffmpegDestDir = path.join(standaloneDir, 'node_modules', '.bin');
        ensureDir(ffmpegDestDir);
        const ffmpegBinaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const ffmpegDest = path.join(ffmpegDestDir, ffmpegBinaryName);
        fs.copyFileSync(ffmpegStaticPath, ffmpegDest);
        ensureExecutable(ffmpegDest);
        const stats = fs.statSync(ffmpegDest);
        console.log(`  Bundled ffmpeg: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    } else {
        console.warn('  Warning: ffmpeg-static binary not found');
    }
} catch (e) {
    console.warn('  Warning: ffmpeg-static package not installed, skipping ffmpeg bundling');
}

// 13. Bundle whisper-cli and its dylibs for local speech-to-text
console.log('Bundling whisper-cli for local STT...');
const whisperBundleDir = path.join(rootDir, 'binaries', 'whisper');
if (fs.existsSync(whisperBundleDir)) {
    const whisperDestDir = path.join(standaloneDir, 'binaries', 'whisper');
    ensureDir(whisperDestDir);
    copyRecursive(whisperBundleDir, whisperDestDir);
    // Ensure binaries are executable
    const whisperBinCandidates = [
        path.join(whisperDestDir, 'bin', 'whisper-whisper-cli'),
        path.join(whisperDestDir, 'bin', 'whisper-whisper-cli.exe'),
        path.join(whisperDestDir, 'bin', 'whisper-cli'),
        path.join(whisperDestDir, 'bin', 'whisper-cli.exe'),
        path.join(whisperDestDir, 'bin', 'main.exe'),
    ];
    const whisperBin = whisperBinCandidates.find((p) => fs.existsSync(p));
    if (whisperBin) {
        ensureExecutable(whisperBin);
        console.log(`  Bundled whisper-cli binary`);
    }
    // Calculate total size
    let totalSize = 0;
    const walkDir = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) walkDir(fullPath);
            else totalSize += fs.statSync(fullPath).size;
        }
    };
    walkDir(whisperDestDir);
    console.log(`  Total whisper bundle: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
} else {
    console.log('  Whisper bundle not found at binaries/whisper — run: node scripts/bundle-whisper.js');
    console.log('  Users will need to install whisper.cpp separately (macOS: brew install whisper-cpp, Windows: download whisper-bin-x64.zip from https://github.com/ggml-org/whisper.cpp/releases)');
}

// 14. Bundle RTK binary for experimental command optimization.
console.log('Bundling RTK binary...');
try {
    execSync('node scripts/bundle-rtk.js', { stdio: 'inherit' });
} catch (error) {
    console.log('  RTK bundle step failed or skipped; experimental RTK mode will remain unavailable.');
}

// 15. Bundle Node.js executable for MCP subprocess spawning
// Downloads the official Node.js binary from nodejs.org which is fully statically linked.
// IMPORTANT: Do NOT use process.execPath (Homebrew/nvm node) — those binaries dynamically
// link against ~10 Homebrew dylibs (libuv, openssl, icu, brotli, etc.) that don't exist
// on end users' machines, causing the bundled node to crash with "Library not loaded".
if (process.platform === 'win32' || process.platform === 'darwin') {
    const platformName = process.platform === 'win32' ? 'Windows' : 'macOS';
    console.log(`Bundling official Node.js binary for ${platformName}...`);

    // Match the major version of the build machine's Node for compatibility
    const nodeVersion = process.versions.node; // e.g. "22.17.1"
    const nodeBinDir = path.join(standaloneDir, 'node_modules', '.bin');
    const nodeExeName = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodeExeDest = path.join(nodeBinDir, nodeExeName);

    ensureDir(nodeBinDir);

    const downloaded = downloadOfficialNodeBinary(nodeVersion, nodeExeDest);
    if (downloaded) {
        ensureExecutable(nodeExeDest);
        const stats = fs.statSync(nodeExeDest);
        console.log(`  Bundled official ${nodeExeName} v${nodeVersion}: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

        // Verify the binary has no external dylib dependencies (sanity check on macOS)
        if (process.platform === 'darwin') {
            try {
                const otoolOutput = execSync(`otool -L "${nodeExeDest}"`, { encoding: 'utf-8' });
                const nonSystemDeps = otoolOutput.split('\n')
                    .filter(line => line.includes('.dylib'))
                    .filter(line => !line.includes('/usr/lib/') && !line.includes('/System/'))
                    .map(line => line.trim());
                if (nonSystemDeps.length > 0) {
                    console.warn('  WARNING: Official node binary has non-system dylib dependencies:');
                    nonSystemDeps.forEach(dep => console.warn(`    ${dep}`));
                    console.warn('  This may cause issues on end user machines!');
                } else {
                    console.log('  Verified: No external dylib dependencies (fully static)');
                }
            } catch {
                console.warn('  Warning: Could not verify dylib dependencies (otool not available)');
            }
        }
    } else {
        // Fallback: copy local node binary (may have dylib dependencies)
        console.warn('  WARNING: Failed to download official Node.js binary.');
        console.warn('  Falling back to local node binary — this may not work on end user machines!');
        const nodeExeSrc = process.execPath;
        if (fs.existsSync(nodeExeSrc)) {
            fs.copyFileSync(nodeExeSrc, nodeExeDest);
            ensureExecutable(nodeExeDest);
            const stats = fs.statSync(nodeExeDest);
            console.log(`  Bundled local ${nodeExeName} (fallback): ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
        } else {
            console.error('  Error: Could not find any Node.js executable to bundle');
        }
    }
}

console.log('--- Preparation Complete ---');
