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

// 4.5. Copy source code for "Seline Codebase" agent sync
console.log('Copying source code for Seline agent...');
const sourceCodeDest = path.join(standaloneDir, 'seline-source');
ensureDir(sourceCodeDest);

// Copy relevant source directories
const sourceDirs = [
    { name: 'app', src: 'app' },
    { name: 'components', src: 'components' },
    { name: 'lib', src: 'lib' },
    { name: 'electron', src: 'electron' },
    { name: 'hooks', src: 'hooks' },
    { name: 'i18n', src: 'i18n' },
];

for (const dir of sourceDirs) {
    const srcPath = path.join(rootDir, dir.src);
    const destPath = path.join(sourceCodeDest, dir.name);
    if (fs.existsSync(srcPath)) {
        console.log(`  - Copying ${dir.name}/`);
        copyRecursive(srcPath, destPath);
    }
}

// Copy root config files
const sourceFiles = [
    'package.json',
    'tsconfig.json',
    'next.config.ts',
    'tailwind.config.ts',
    'README.md',
];

for (const file of sourceFiles) {
    const srcPath = path.join(rootDir, file);
    const destPath = path.join(sourceCodeDest, file);
    if (fs.existsSync(srcPath)) {
        console.log(`  - Copying ${file}`);
        fs.copyFileSync(srcPath, destPath);
    }
}

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

// 12. Bundle ffmpeg static binary for audio conversion (whisper.cpp preprocessing)
console.log('Bundling ffmpeg static binary...');
try {
    const ffmpegStaticPath = require.resolve('ffmpeg-static');
    if (fs.existsSync(ffmpegStaticPath)) {
        const ffmpegDestDir = path.join(standaloneDir, 'node_modules', '.bin');
        ensureDir(ffmpegDestDir);
        const ffmpegBinaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const ffmpegDest = path.join(ffmpegDestDir, ffmpegBinaryName);
        fs.copyFileSync(ffmpegStaticPath, ffmpegDest);
        if (process.platform !== 'win32') {
            fs.chmodSync(ffmpegDest, 0o755);
        }
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
        path.join(whisperDestDir, 'bin', 'whisper-cli'),
        path.join(whisperDestDir, 'bin', 'whisper-cli.exe'),
        path.join(whisperDestDir, 'bin', 'main.exe'),
    ];
    const whisperBin = whisperBinCandidates.find((p) => fs.existsSync(p));
    if (whisperBin) {
        if (process.platform !== 'win32') {
            fs.chmodSync(whisperBin, 0o755);
        }
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

// 14. Bundle Node.js executable for MCP subprocess spawning
// This avoids console window flashing on Windows and provides a clean Node.js runtime on Mac
// Using a real Node.js binary instead of ELECTRON_RUN_AS_NODE improves compatibility
if (process.platform === 'win32' || process.platform === 'darwin') {
    const platformName = process.platform === 'win32' ? 'Windows' : 'macOS';
    console.log(`Bundling Node.js executable for ${platformName}...`);
    const nodeExeSrc = process.execPath; // Current Node.js executable
    const nodeBinDir = path.join(standaloneDir, 'node_modules', '.bin');
    const nodeExeName = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodeExeDest = path.join(nodeBinDir, nodeExeName);

    ensureDir(nodeBinDir);

    if (fs.existsSync(nodeExeSrc)) {
        fs.copyFileSync(nodeExeSrc, nodeExeDest);
        // Ensure the binary is executable on macOS
        if (process.platform === 'darwin') {
            fs.chmodSync(nodeExeDest, 0o755);
        }
        const stats = fs.statSync(nodeExeDest);
        console.log(`  Bundled ${nodeExeName}: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    } else {
        console.warn('  Warning: Could not find Node.js executable to bundle');
    }
}

console.log('--- Preparation Complete ---');
