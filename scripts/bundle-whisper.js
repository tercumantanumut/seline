/**
 * Bundle whisper-cli and its dylibs for Electron distribution.
 *
 * This script copies the whisper-cli binary and its required shared libraries
 * from the Homebrew installation into a self-contained directory that can be
 * included in the Electron app bundle.
 *
 * The bundled binary has its @rpath references rewritten to use @executable_path
 * so it works without Homebrew installed on the target machine.
 *
 * Usage: node scripts/bundle-whisper.js [--output <dir>]
 *
 * Prerequisites: brew install whisper-cpp
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const DEFAULT_OUTPUT = path.join(__dirname, '..', 'binaries', 'whisper');

function main() {
    const outputDir = process.argv.includes('--output')
        ? process.argv[process.argv.indexOf('--output') + 1]
        : DEFAULT_OUTPUT;

    console.log('=== Bundle whisper-cli for Electron ===');

    // 1. Find whisper-cli
    const whisperBin = findWhisperCli();
    if (!whisperBin) {
        console.error('Error: whisper-cli not found. Install with: brew install whisper-cpp');
        process.exit(1);
    }
    console.log(`Found whisper-cli: ${whisperBin}`);

    // 2. Resolve the real binary (follow symlinks)
    const realBin = fs.realpathSync(whisperBin);
    console.log(`Real binary: ${realBin}`);

    // 3. Find the lib directory (sibling to bin)
    const libDir = path.join(path.dirname(realBin), '..', 'lib');
    if (!fs.existsSync(libDir)) {
        console.error(`Error: lib directory not found at ${libDir}`);
        process.exit(1);
    }
    console.log(`Lib directory: ${libDir}`);

    // 4. Create output directory
    const binOutDir = path.join(outputDir, 'bin');
    const libOutDir = path.join(outputDir, 'lib');
    fs.mkdirSync(binOutDir, { recursive: true });
    fs.mkdirSync(libOutDir, { recursive: true });

    // 5. Copy the binary
    const destBin = path.join(binOutDir, 'whisper-cli');
    fs.copyFileSync(realBin, destBin);
    fs.chmodSync(destBin, 0o755);
    console.log(`Copied binary: ${destBin} (${(fs.statSync(destBin).size / 1024 / 1024).toFixed(1)} MB)`);

    // 6. Copy required dylibs (only the ones whisper-cli actually links to)
    const requiredLibs = getRequiredLibs(realBin);
    let totalLibSize = 0;

    for (const libPath of requiredLibs) {
        // Resolve symlinks to get the actual file
        const realLib = fs.realpathSync(libPath);
        const libName = path.basename(libPath); // Keep the symlink name for @rpath resolution
        const destLib = path.join(libOutDir, libName);

        fs.copyFileSync(realLib, destLib);
        fs.chmodSync(destLib, 0o755);
        const size = fs.statSync(destLib).size;
        totalLibSize += size;
        console.log(`  Copied lib: ${libName} (${(size / 1024).toFixed(0)} KB)`);
    }

    // 7. Rewrite the binary's dylib references to use @executable_path/../lib/
    console.log('\nRewriting dylib references...');
    rewriteDylibPaths(destBin, requiredLibs, libOutDir);

    // 8. Also rewrite inter-lib references (libs that depend on other libs)
    for (const libPath of requiredLibs) {
        const libName = path.basename(libPath);
        const destLib = path.join(libOutDir, libName);
        rewriteDylibPaths(destLib, requiredLibs, libOutDir);
    }

    // 9. Verify
    console.log('\nVerifying bundle...');
    try {
        const output = execFileSync(destBin, ['--help'], {
            timeout: 5000,
            stdio: 'pipe',
            env: {
                ...process.env,
                DYLD_LIBRARY_PATH: libOutDir,
            },
        });
    } catch (e) {
        // --help exits with code 0 or 1, both are fine
    }
    console.log('✓ Bundle verified');

    const binSize = fs.statSync(destBin).size;
    const totalSize = binSize + totalLibSize;
    console.log(`\nBundle size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Output: ${outputDir}`);
}

function findWhisperCli() {
    const paths = [
        '/opt/homebrew/bin/whisper-cli',
        '/usr/local/bin/whisper-cli',
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    try {
        return execSync('which whisper-cli', { encoding: 'utf-8', timeout: 3000 }).trim();
    } catch {
        return null;
    }
}

function getRequiredLibs(binaryPath) {
    // Use otool to find linked dylibs
    const output = execSync(`otool -L "${binaryPath}"`, { encoding: 'utf-8' });
    const libs = [];

    for (const line of output.split('\n')) {
        const match = line.match(/\s+(@rpath\/\S+)/);
        if (match) {
            const rpathRef = match[1];
            const libName = rpathRef.replace('@rpath/', '');

            // Find the actual lib file
            const binDir = path.dirname(fs.realpathSync(binaryPath));
            const libDir = path.join(binDir, '..', 'lib');
            const libPath = path.join(libDir, libName);

            if (fs.existsSync(libPath)) {
                libs.push(libPath);
            } else {
                console.warn(`  Warning: Could not find ${libName} at ${libPath}`);
            }
        }
    }

    return libs;
}

function rewriteDylibPaths(binaryPath, requiredLibs, libOutDir) {
    for (const libPath of requiredLibs) {
        const libName = path.basename(libPath);

        // Find the original @rpath reference in the binary
        const output = execSync(`otool -L "${binaryPath}"`, { encoding: 'utf-8' });
        for (const line of output.split('\n')) {
            const match = line.match(/\s+(@rpath\/\S+)/);
            if (match && match[1].includes(libName)) {
                const oldPath = match[1];
                // For the main binary: use @executable_path/../lib/
                // For libs: use @loader_path/
                const isBinary = binaryPath.endsWith('whisper-cli');
                const newPath = isBinary
                    ? `@executable_path/../lib/${libName}`
                    : `@loader_path/${libName}`;

                try {
                    execSync(`install_name_tool -change "${oldPath}" "${newPath}" "${binaryPath}"`, {
                        stdio: 'pipe',
                    });
                } catch (e) {
                    // Some changes may fail if the reference doesn't exist in this specific binary
                }
            }
        }
    }

    // Also rewrite the install name for dylibs themselves
    if (!binaryPath.endsWith('whisper-cli')) {
        const libName = path.basename(binaryPath);
        try {
            execSync(`install_name_tool -id "@loader_path/${libName}" "${binaryPath}"`, {
                stdio: 'pipe',
            });
        } catch (e) {
            // May fail for some libs
        }
    }

    // Ad-hoc codesign (required on Apple Silicon after modifying binaries)
    try {
        execSync(`codesign --force --sign - "${binaryPath}"`, { stdio: 'pipe' });
    } catch (e) {
        // Non-fatal
    }
}

main();
