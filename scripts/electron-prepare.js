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

    pruneOnnxRuntime(path.join(standaloneRoot, "node_modules", "onnxruntime-node"), "napi-v6", keepOs, arch);
    pruneOnnxRuntime(path.join(standaloneRoot, "node_modules", "@xenova", "transformers", "node_modules", "onnxruntime-node"), "napi-v3", keepOs, arch);
    pruneRemotionCompositors(path.join(standaloneRoot, "node_modules", "@remotion"), keepOs);

    pruneEsbuildBinaries(path.join(standaloneRoot, "node_modules", "@esbuild"), keepOs, arch);
    pruneEsbuildBinaries(path.join(standaloneRoot, "node_modules", "@remotion", "bundler", "node_modules", "@esbuild"), keepOs, arch);
}

console.log('--- Electron Prepare ---');

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
    { name: '@xenova/transformers', src: '@xenova/transformers', dest: '@xenova/transformers' },
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

console.log('--- Preparation Complete ---');
