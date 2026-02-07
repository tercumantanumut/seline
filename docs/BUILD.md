# Styly Agents - Electron Build Guide

This document describes how to build and package the Styly Agents Electron application.

## Architecture Overview

The application uses a **Next.js standalone server** running inside Electron:
- **Development**: Next.js dev server runs on port 3000, Electron loads from `http://localhost:3000`
- **Production**: Next.js standalone server is bundled and runs on port 3456 inside the packaged app

## Build Commands

### Development
```bash
# Run in development mode (Next.js + Electron together)
npm run electron:dev
```

### Production Build
```bash
# Build for local testing (creates unpacked app in dist-electron/)
npm run electron:pack

# Build distributable packages (DMG, etc.)
npm run electron:dist

# Build macOS only
npm run electron:dist:mac
```

## Build Pipeline

The `electron:pack` command runs these steps in order:

1. **`npm run build`** - Creates Next.js production build with standalone output
2. **`npm run electron:rebuild-native`** - Rebuilds native modules in root `node_modules` for Electron's Node.js version
3. **`npm run electron:prepare`** - Copies static assets and rebuilt native binaries to standalone directory
4. **`npm run electron:compile`** - Compiles Electron TypeScript files
5. **`electron-builder --dir`** - Packages the application

## Key Configuration Files

### `next.config.ts`
```typescript
const nextConfig: NextConfig = {
  output: "standalone",  // Creates self-contained server
  outputFileTracingRoot: path.join(__dirname),  // CRITICAL: Prevents nested folder issues
  // ...
};
```

### `electron-builder.yml`
Key settings:
- `npmRebuild: false` - Disabled because we manually rebuild native modules
- `extraResources` - Copies standalone server OUTSIDE the asar archive (required for spawning)
- `asar: true` - Main Electron code is packaged in asar

### `package.json` Scripts
```json
{
  "electron:rebuild-native": "electron-rebuild -f -o better-sqlite3,onnxruntime-node -v 39.2.4"
}
```

## macOS Signing and Notarization

The build uses `afterSign: "scripts/notarize.js"` in `electron-builder.yml`.

- If Apple credentials are missing, the notarization hook logs a warning and skips.
- If credentials are present, the app is submitted with `notarytool`.

Supported environment configurations:

1. App-specific password flow
```bash
APPLE_ID="you@example.com"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="ABCDE12345"
```

2. App Store Connect API key flow
```bash
APPLE_API_KEY="/path/to/AuthKey_XXXX.p8"
APPLE_API_KEY_ID="XXXX"
APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Optional:
```bash
APPLE_BUNDLE_ID="ai.zlutty.app"
```

Verification commands for release artifacts:
```bash
codesign --verify --deep --strict --verbose=2 "Seline.app"
spctl -a -vvv "Seline.app"
xcrun stapler validate "Seline.app"
```

## Native Module Handling

### The Problem
Native modules (like `better-sqlite3` and `onnxruntime-node`) must be compiled for the **exact Node.js version** that Electron uses. The standalone Next.js build copies only runtime files (not build files like `binding.gyp`), making it impossible to rebuild modules directly in the standalone directory.

### The Solution
1. Rebuild native modules in root `node_modules` BEFORE copying to standalone
2. Copy the rebuilt `.node` binaries to standalone in `electron-prepare.js`
3. Disable electron-builder's `npmRebuild` to prevent conflicts
4. Specify the exact Electron version: `-v 39.2.4`

### NODE_MODULE_VERSION Reference
| Node.js Version | MODULE_VERSION |
|-----------------|----------------|
| Node 18.x       | 127            |
| Node 22.x       | 140            |
| Electron 39.x   | 140 (Node 22)  |

## Troubleshooting

### Black Screen on Launch
1. Check debug logs at `~/Library/Application Support/styly-agent/debug.log`
2. Common causes:
   - `server.js` not found → Check `extraResources` paths in electron-builder.yml
   - Server not starting → Check if `ELECTRON_RUN_AS_NODE=1` is set when spawning
   - Native module errors → Rebuild with correct Electron version

### "Cannot find module 'next'" Error
The `node_modules` folder is excluded by electron-builder by default. Solution:
```yaml
extraResources:
  - from: ".next/standalone/node_modules"
    to: "standalone/node_modules"
    filter:
      - "**/*"
```

### NODE_MODULE_VERSION Mismatch
```
Error: The module was compiled against a different Node.js version
using NODE_MODULE_VERSION 127. This version requires NODE_MODULE_VERSION 140.
```
**Fix**: Ensure `npm run electron:rebuild-native` runs BEFORE `electron:prepare`, and that `electron-prepare.js` copies the rebuilt binaries. The standard `electron:build` script handles this automatically.

### Nested Folder Structure in Standalone
If `.next/standalone/` contains a nested project folder (e.g., `.next/standalone/styly-agent/`):
1. Check for stray lock files (`bun.lock`, `yarn.lock`) in parent directories
2. Set `outputFileTracingRoot` in `next.config.ts`

## Production Server Spawning

In `electron/main.ts`, the Next.js server is spawned with:
```typescript
spawn(process.execPath, [standaloneServer], {
  cwd: standaloneDir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: "3456",
    HOSTNAME: "localhost",
    ELECTRON_RUN_AS_NODE: "1",  // CRITICAL: Makes Electron binary run as Node.js
  },
});
```

## MCP Runtime Notes (macOS)

- On macOS, MCP subprocesses now default to Electron's internal Node runtime (`ELECTRON_RUN_AS_NODE=1`).
- This avoids shipping a builder-machine Node binary that can depend on local Homebrew libraries (for example `icu4c`).
- If you explicitly need a bundled macOS Node binary, set:
```bash
SELINE_BUNDLE_NODE_ON_MAC=1
SELINE_NODE_RUNTIME_PATH="/absolute/path/to/portable/node"
```

## File Locations in Packaged App

```
Styly Agents.app/Contents/
├── MacOS/
│   └── Styly Agents          # Electron binary
├── Resources/
│   ├── app.asar              # Electron main/preload code
│   └── standalone/           # Next.js standalone server (outside asar)
│       ├── server.js
│       ├── node_modules/
│       ├── .next/
│       │   └── static/
│       └── public/
```

## Debug Logging

Debug logs are written to: `~/Library/Application Support/styly-agent/debug.log`

To enable DevTools in production, the code temporarily opens DevTools on launch. Remove this for release builds.

## Checklist Before Release

- [ ] Remove DevTools auto-open in `electron/main.ts`
- [ ] Reduce debug logging verbosity
- [ ] Set up code signing certificates
- [ ] Configure notarization for macOS
- [ ] Test on clean machine without Node.js installed

