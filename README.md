# Seline

<div align="center">

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Electron](https://img.shields.io/badge/Electron-39.2.4-47848F?logo=electron&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

</div>

<div align="center">
  <img src="assets/demo.gif" alt="Seline Demo" width="800"/>
</div>

<br/>

Seline is an AI assistant that blends chat, visual tools, and a local knowledge base into a single desktop app. It runs *mostly* on your machine—your documents stay private, your conversations persist across sessions, and you can switch between LLM providers without leaving the app.

## Highlights
- Chat with configurable agents and keep long-running sessions organized.
- Enhance prompts with grounded context from your synced folders and memories.
- Generate and edit images, then assemble them into videos.
- Run vector search locally with LanceDB for fast, private retrieval.
- Run commands in your synced/indexed folders

 ## Updates: - 3rd provider added. now can use antigravity models and google antigravity subscription 

## Supported Platforms
- Windows (installer builds are available).
- macOS is supported today; DMG distribution is coming soon. You can build macOS packages from source in the meantime.
- Linux, not tested.

## Prerequisites
For end users: none beyond the OS installer.

For developers:
- Node.js 20+ (22 recommended for Electron 39 native module rebuilds)
- npm 9+
- Windows 10/11 or macOS 12+

## Installation
```bash
npm install
```

## Development Workflow
```bash
npm run electron:dev
```
This runs the Next.js dev server and launches Electron against `http://localhost:3000`.

## Build Commands
```bash
# Windows installer + portable
npm run electron:dist:win

# macOS (DMG/dir)
npm run electron:dist:mac
```
For local packaging without creating installers, use `npm run electron:pack`. See `docs/BUILD.md` for the full pipeline.

## Troubleshooting
- Native module errors (`better-sqlite3`, `onnxruntime-node`): run `npm run electron:rebuild-native` before building.
- Black screen in packaged app: verify `.next/standalone` and `extraResources` are correct; see `docs/BUILD.md`.
- Missing provider keys: ensure `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` is configured in settings or `.env`.
- Embeddings mismatch errors: reindex Vector Search from Settings or run `POST /api/vector-sync` with `action: "reindex-all"`.

## Documentation
- `docs/ARCHITECTURE.md` - system layout and core flows
- `docs/AI_PIPELINES.md` - LLM, embeddings, and tool pipelines
- `docs/DEVELOPMENT.md` - dev setup, scripts, tests, and build process
- `docs/API.md` - internal modules and API endpoints
