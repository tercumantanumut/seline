# Seline

Seline is an AI assistant that blends chat, visual tools, and a local knowledge base into a single desktop app. It runs entirely on your machine—your documents stay private, your conversations persist across sessions, and you can switch between LLM providers without leaving the app. 

## Highlights
- Chat with configurable agents and keep long-running sessions organized.
- Enhance prompts with grounded context from your synced folders and memories.
- Generate and edit images, then assemble them into videos.
- Run vector search locally with LanceDB for fast, private retrieval.

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
