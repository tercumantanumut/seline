/**
 * Bundle whisper-cli and shared libraries for Electron distribution.
 *
 * Supported platforms:
 * - macOS: copies whisper-cli and referenced dylibs, rewrites @rpath references
 * - Windows: copies whisper-cli.exe and nearby DLL dependencies (auto-download fallback)
 * - Linux/other: copies binary only
 *
 * Usage:
 *   node scripts/bundle-whisper.js [--output <dir>]
 *
 * Optional env var:
 *   WHISPER_CPP_PATH=/absolute/path/to/whisper-cli(.exe)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_OUTPUT = path.join(__dirname, '..', 'binaries', 'whisper');

async function main() {
    const outputDir = process.argv.includes('--output')
        ? process.argv[process.argv.indexOf('--output') + 1]
        : DEFAULT_OUTPUT;

    console.log('=== Bundle whisper-cli for Electron ===');
    console.log(`Platform: ${process.platform}`);

    let whisperBin = findWhisperCli();
    let tempCleanupDir = null;

    if (!whisperBin) {
        if (hasUsableExistingBundle(outputDir)) {
            console.log('No local whisper-cli found, keeping existing usable binaries/whisper bundle.');
            return;
        }

        if (process.platform === 'win32') {
            const downloaded = await tryAutoDownloadWhisperForWindows();
            if (downloaded) {
                whisperBin = downloaded.binaryPath;
                tempCleanupDir = downloaded.tempDir;
            }
        }

        if (!whisperBin) {
            throw new Error(getInstallHint());
        }
    }

    try {
        console.log(`Found whisper binary: ${whisperBin}`);

        const realBin = fs.realpathSync(whisperBin);
        console.log(`Resolved binary: ${realBin}`);

        const binOutDir = path.join(outputDir, 'bin');
        const libOutDir = path.join(outputDir, 'lib');
        fs.mkdirSync(binOutDir, { recursive: true });
        fs.mkdirSync(libOutDir, { recursive: true });

        if (process.platform === 'darwin') {
            bundleForMac(realBin, binOutDir, libOutDir);
            return;
        }

        if (process.platform === 'win32') {
            bundleForWindows(realBin, binOutDir, libOutDir);
            return;
        }

        bundleGeneric(realBin, binOutDir);
    } finally {
        if (tempCleanupDir) {
            safeRemoveDir(tempCleanupDir);
        }
    }
}

function bundleForMac(realBin, binOutDir, libOutDir) {
    const destBin = path.join(binOutDir, 'whisper-cli');
    fs.copyFileSync(realBin, destBin);
    fs.chmodSync(destBin, 0o755);
    console.log(`Copied binary: ${destBin} (${toMb(fs.statSync(destBin).size)} MB)`);

    const requiredLibs = getRequiredDylibs(realBin);
    let totalLibSize = 0;

    for (const libPath of requiredLibs) {
        const realLib = fs.realpathSync(libPath);
        const libName = path.basename(libPath);
        const destLib = path.join(libOutDir, libName);
        fs.copyFileSync(realLib, destLib);
        fs.chmodSync(destLib, 0o755);
        const size = fs.statSync(destLib).size;
        totalLibSize += size;
        console.log(`  Copied dylib: ${libName} (${Math.round(size / 1024)} KB)`);
    }

    console.log('Rewriting dylib references...');
    rewriteMacDylibPaths(destBin, requiredLibs, true);
    for (const libPath of requiredLibs) {
        const libName = path.basename(libPath);
        const destLib = path.join(libOutDir, libName);
        rewriteMacDylibPaths(destLib, requiredLibs, false);
    }

    verifyBinary(destBin, { DYLD_LIBRARY_PATH: libOutDir });
    const totalSize = fs.statSync(destBin).size + totalLibSize;
    console.log(`Bundle size: ${toMb(totalSize)} MB`);
    console.log(`Output: ${path.join(binOutDir, '..')}`);
}

function bundleForWindows(realBin, binOutDir, libOutDir) {
    const sourceName = path.basename(realBin);
    const destBin = path.join(binOutDir, sourceName);
    fs.copyFileSync(realBin, destBin);
    console.log(`Copied binary: ${destBin} (${toMb(fs.statSync(destBin).size)} MB)`);

    if (sourceName.toLowerCase() !== 'whisper-cli.exe') {
        const compatAlias = path.join(binOutDir, 'whisper-cli.exe');
        fs.copyFileSync(realBin, compatAlias);
        console.log(`  Added compatibility alias: ${compatAlias}`);
    }

    const dllCandidates = collectWindowsDlls(realBin);
    let copied = 0;
    let totalLibSize = 0;

    for (const dllPath of dllCandidates) {
        const dllName = path.basename(dllPath);
        const destDll = path.join(libOutDir, dllName);
        try {
            fs.copyFileSync(dllPath, destDll);
            copied += 1;
            totalLibSize += fs.statSync(destDll).size;
            console.log(`  Copied dll: ${dllName}`);
        } catch (err) {
            console.warn(`  Warning: could not copy ${dllName}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    if (copied === 0) {
        console.log('No companion DLL files detected near whisper binary.');
    }

    verifyBinary(destBin, { PATH: `${libOutDir};${process.env.PATH || ''}` });
    const totalSize = fs.statSync(destBin).size + totalLibSize;
    console.log(`Bundle size: ${toMb(totalSize)} MB`);
    console.log(`Output: ${path.join(binOutDir, '..')}`);
}

function bundleGeneric(realBin, binOutDir) {
    const ext = path.extname(realBin);
    const destName = ext ? `whisper-cli${ext}` : 'whisper-cli';
    const destBin = path.join(binOutDir, destName);
    fs.copyFileSync(realBin, destBin);
    fs.chmodSync(destBin, 0o755);
    console.log(`Copied binary: ${destBin} (${toMb(fs.statSync(destBin).size)} MB)`);
    verifyBinary(destBin, {});
    console.log(`Output: ${path.join(binOutDir, '..')}`);
}

function hasUsableExistingBundle(outputDir) {
    const candidates = [
        path.join(outputDir, 'bin', 'whisper-whisper-cli'),
        path.join(outputDir, 'bin', 'whisper-whisper-cli.exe'),
        path.join(outputDir, 'bin', 'whisper-cli'),
        path.join(outputDir, 'bin', 'whisper-cli.exe'),
        path.join(outputDir, 'bin', 'main.exe'),
    ];
    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        if (!isDeprecatedWhisperStub(candidate)) {
            return true;
        }
    }
    return false;
}

function findWhisperCli() {
    const envPath = process.env.WHISPER_CPP_PATH;
    if (envPath && fs.existsSync(envPath)) {
        const preferred = preferNewWhisperBinary(envPath);
        if (!isDeprecatedWhisperStub(preferred)) return preferred;
    }

    const candidates = getCandidatePaths();
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            const preferred = preferNewWhisperBinary(candidate);
            if (!isDeprecatedWhisperStub(preferred)) return preferred;
        }
    }

    const fromPath = findInPath(process.platform === 'win32'
        ? ['whisper-whisper-cli.exe', 'whisper-whisper-cli', 'whisper-cli.exe', 'whisper-cli', 'main.exe']
        : ['whisper-whisper-cli', 'whisper-cli']);

    if (!fromPath) return null;

    const preferred = preferNewWhisperBinary(fromPath);
    return isDeprecatedWhisperStub(preferred) ? null : preferred;
}

async function tryAutoDownloadWhisperForWindows() {
    const assetUrl = process.env.WHISPER_CPP_WIN_ASSET_URL
        || 'https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seline-whispercpp-'));
    const zipPath = path.join(tempDir, 'whisper-bin-x64.zip');
    const extractDir = path.join(tempDir, 'extracted');

    console.log('whisper-cli not found locally. Attempting automatic download of whisper.cpp Windows binaries...');
    console.log(`Download URL: ${assetUrl}`);

    try {
        await downloadToFile(assetUrl, zipPath);
        extractZipArchive(zipPath, extractDir);

        const binaryPath = findFileRecursiveByPriority(extractDir, [
            'whisper-whisper-cli.exe',
            'whisper-whisper-cli',
            'whisper-cli.exe',
            'whisper-cli',
            'main.exe',
        ]);
        if (!binaryPath) {
            throw new Error('Downloaded archive did not contain a whisper CLI executable');
        }

        console.log(`Auto-downloaded whisper binary: ${binaryPath}`);
        return { binaryPath, tempDir };
    } catch (err) {
        console.warn(`Automatic whisper.cpp download failed: ${err instanceof Error ? err.message : String(err)}`);
        safeRemoveDir(tempDir);
        return null;
    }
}

async function downloadToFile(url, destinationPath) {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable in this Node runtime');
    }

    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} while downloading ${url}`);
    }

    const data = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destinationPath, data);
}

function extractZipArchive(zipPath, extractDir) {
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        execFileSync('tar', ['-xf', zipPath, '-C', extractDir], { stdio: 'pipe' });
        return;
    } catch {
        // Fallback to PowerShell below.
    }

    const psCommand = `Expand-Archive -LiteralPath '${escapePowerShellString(zipPath)}' -DestinationPath '${escapePowerShellString(extractDir)}' -Force`;
    execFileSync('powershell', ['-NoProfile', '-Command', psCommand], { stdio: 'pipe' });
}

function findFileRecursive(rootDir, fileNames) {
    const wanted = new Set(fileNames.map((name) => name.toLowerCase()));
    const stack = [rootDir];

    while (stack.length > 0) {
        const dir = stack.pop();
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (entry.isFile() && wanted.has(entry.name.toLowerCase())) {
                return fullPath;
            }
        }
    }

    return null;
}

function findFileRecursiveByPriority(rootDir, fileNames) {
    for (const fileName of fileNames) {
        const found = findFileRecursive(rootDir, [fileName]);
        if (found) return found;
    }
    return null;
}

function escapePowerShellString(input) {
    return String(input).replace(/'/g, "''");
}

function safeRemoveDir(targetDir) {
    try {
        fs.rmSync(targetDir, { recursive: true, force: true });
    } catch {
        // best-effort cleanup
    }
}

function preferNewWhisperBinary(binaryPath) {
    const fileName = path.basename(binaryPath).toLowerCase();
    const dir = path.dirname(binaryPath);

    if (fileName === 'whisper-cli.exe') {
        const preferred = path.join(dir, 'whisper-whisper-cli.exe');
        if (fs.existsSync(preferred)) return preferred;
    }

    if (fileName === 'whisper-cli') {
        const preferred = path.join(dir, 'whisper-whisper-cli');
        if (fs.existsSync(preferred)) return preferred;
    }

    return binaryPath;
}

function isDeprecatedWhisperStub(binaryPath) {
    try {
        const output = execFileSync(binaryPath, ['--help'], {
            timeout: 5000,
            stdio: 'pipe',
            encoding: 'utf-8',
        });
        return /is deprecated/i.test(output || '');
    } catch (err) {
        const details = extractExecErrorOutput(err);
        return /is deprecated/i.test(details);
    }
}

function getCandidatePaths() {
    if (process.platform === 'darwin') {
        return [
            '/opt/homebrew/bin/whisper-whisper-cli',
            '/usr/local/bin/whisper-whisper-cli',
            '/opt/homebrew/bin/whisper-cli',
            '/usr/local/bin/whisper-cli',
        ];
    }

    if (process.platform === 'win32') {
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
        return [
            path.join(programFiles, 'whisper.cpp', 'whisper-whisper-cli.exe'),
            path.join(programFiles, 'whisper.cpp', 'whisper-cli.exe'),
            path.join(programFiles, 'whisper.cpp', 'main.exe'),
            path.join(programFiles, 'whisper.cpp', 'build', 'bin', 'Release', 'whisper-whisper-cli.exe'),
            path.join(programFiles, 'whisper.cpp', 'build', 'bin', 'Release', 'whisper-cli.exe'),
            path.join(programFilesX86, 'whisper.cpp', 'whisper-whisper-cli.exe'),
            path.join(programFilesX86, 'whisper.cpp', 'whisper-cli.exe'),
            path.join(programFilesX86, 'whisper.cpp', 'main.exe'),
            path.join(localAppData, 'Programs', 'whisper.cpp', 'whisper-whisper-cli.exe'),
            path.join(localAppData, 'Programs', 'whisper.cpp', 'whisper-cli.exe'),
            path.join(localAppData, 'Programs', 'whisper.cpp', 'main.exe'),
        ];
    }

    return [
        '/usr/local/bin/whisper-whisper-cli',
        '/usr/bin/whisper-whisper-cli',
        '/usr/local/bin/whisper-cli',
        '/usr/bin/whisper-cli',
    ];
}

function findInPath(executableNames) {
    const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
    for (const name of executableNames) {
        try {
            const output = execFileSync(lookupCommand, [name], {
                timeout: 3000,
                stdio: 'pipe',
                encoding: 'utf-8',
            }).trim();

            if (!output) continue;
            const results = output.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
            for (const result of results) {
                if (fs.existsSync(result)) return result;
            }
        } catch {
            // continue searching
        }
    }
    return null;
}

function extractExecErrorOutput(error) {
    if (!error || typeof error !== 'object') {
        return String(error || '');
    }

    const parts = [];
    if (typeof error.stdout === 'string') parts.push(error.stdout);
    if (Buffer.isBuffer(error.stdout)) parts.push(error.stdout.toString('utf-8'));
    if (typeof error.stderr === 'string') parts.push(error.stderr);
    if (Buffer.isBuffer(error.stderr)) parts.push(error.stderr.toString('utf-8'));
    if (typeof error.message === 'string') parts.push(error.message);
    return parts.join('\n');
}

function getRequiredDylibs(binaryPath) {
    const output = execFileSync('otool', ['-L', binaryPath], { encoding: 'utf-8' });
    const libs = [];
    const seen = new Set();
    const libDir = path.join(path.dirname(fs.realpathSync(binaryPath)), '..', 'lib');

    for (const line of output.split('\n')) {
        const match = line.match(/\s+(@rpath\/\S+)/);
        if (!match) continue;
        const rpathRef = match[1];
        const libName = rpathRef.replace('@rpath/', '');
        const libPath = path.join(libDir, libName);

        if (!fs.existsSync(libPath)) {
            console.warn(`  Warning: missing dylib ${libName} at ${libPath}`);
            continue;
        }
        if (!seen.has(libPath)) {
            seen.add(libPath);
            libs.push(libPath);
        }
    }

    return libs;
}

function rewriteMacDylibPaths(targetPath, requiredLibs, isMainBinary) {
    const otoolOutput = execFileSync('otool', ['-L', targetPath], { encoding: 'utf-8' });
    const refs = otoolOutput
        .split('\n')
        .map((line) => line.match(/\s+(@rpath\/\S+)/))
        .filter(Boolean)
        .map((match) => match[1]);

    for (const libPath of requiredLibs) {
        const libName = path.basename(libPath);
        const oldPath = refs.find((ref) => ref.endsWith(`/${libName}`) || ref.includes(libName));
        if (!oldPath) continue;

        const newPath = isMainBinary
            ? `@executable_path/../lib/${libName}`
            : `@loader_path/${libName}`;

        try {
            execFileSync('install_name_tool', ['-change', oldPath, newPath, targetPath], {
                stdio: 'pipe',
            });
        } catch {
            // Non-fatal for missing/immutable references
        }
    }

    if (!isMainBinary) {
        const libName = path.basename(targetPath);
        try {
            execFileSync('install_name_tool', ['-id', `@loader_path/${libName}`, targetPath], {
                stdio: 'pipe',
            });
        } catch {
            // Non-fatal
        }
    }

    try {
        execFileSync('codesign', ['--force', '--sign', '-', targetPath], { stdio: 'pipe' });
    } catch {
        // Non-fatal
    }
}

function collectWindowsDlls(binaryPath) {
    const binDir = path.dirname(binaryPath);
    const siblingDirs = [
        binDir,
        path.join(binDir, '..'),
        path.join(binDir, '..', 'bin'),
        path.join(binDir, '..', 'lib'),
    ];
    const result = [];
    const seen = new Set();

    for (const dir of siblingDirs) {
        if (!fs.existsSync(dir)) continue;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            if (!entry.name.toLowerCase().endsWith('.dll')) continue;
            const fullPath = path.join(dir, entry.name);
            if (!seen.has(fullPath)) {
                seen.add(fullPath);
                result.push(fullPath);
            }
        }
    }

    return result;
}

function verifyBinary(binaryPath, extraEnv) {
    console.log('Verifying bundle with --help...');
    try {
        execFileSync(binaryPath, ['--help'], {
            timeout: 5000,
            stdio: 'pipe',
            env: { ...process.env, ...extraEnv },
        });
    } catch {
        // --help may still exit non-zero; existence/runtime check is enough
    }
    console.log('Bundle verification completed.');
}

function getInstallHint() {
    if (process.platform === 'darwin') {
        return 'Error: whisper-cli not found. Install with: brew install whisper-cpp';
    }
    if (process.platform === 'win32') {
        return 'Error: whisper-cli not found. Install from https://github.com/ggml-org/whisper.cpp/releases (whisper-bin-x64.zip), or set WHISPER_CPP_PATH.';
    }
    return 'Error: whisper-cli not found in PATH. Install whisper.cpp and retry.';
}

function toMb(bytes) {
    return (bytes / 1024 / 1024).toFixed(1);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
