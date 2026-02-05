## What's New
<img width="768" height="532" alt="Screenshot 2026-02-04 231013" src="https://github.com/user-attachments/assets/b63ee73b-4613-4526-9e85-d4da09a37247" />

### Hotfixes:

Below issues are hotfixes, rookie mistakes... sorry about them, there are tons of stuff to test...
- Fixed Telegram Chat API connection failure in Electron production, use /new to create fresh chat sessions on telegram
- Fixed local model download error due to huggingface library not being bundled in production build, which is now resolved.
- Fixed issue with Scheduled tasks were failing with "fetch failed" errors in production Electron builds because the task queue was using port 3000 instead of the correct port 3456 where the standalone server runs.
- Fixed Fetch failed on Analytics, admin route protection, unnecessary, removed.
- Telegram, Slack and Whatsapp all confirmed working both in prod and dev.
- This update might require wipe local data, wipe local data and restart the app if client slows down after update (.../Roaming/seline for windows )
- **Fixed terminal output context bloat** — Implemented general 25K token limit for all tool outputs (bash commands, MCP tools, etc.) to prevent commands like `ls -R` or `pip freeze` from generating millions of tokens. Full output stored for on-demand retrieval via `retrieveFullContent` tool.
- **Decoupled sync folders from vector embeddings** — Users can now sync folders without configuring embeddings. New indexing modes: "files-only" (track files only), "full" (create embeddings), and "auto" (smart default). Tools like `localGrep` and `readFile` work immediately without embeddings. Backward compatible with smart migration for existing folders.


### Plan Tool
- New `updatePlan` tool lets models create and maintain a persistent task plan within a chat session
- Supports replace and merge modes, tracks step statuses, and caps at 20 steps with deterministic IDs
- Compact collapsible inline UI — collapsed chip shows version + status counts, expand for full step list
- Registered as a deferred tool discoverable via `searchTools`, added to the default Seline agent

### Unified Background Task System
- Background tasks now run through a single unified system with proper lifecycle management
- Zombie run detection automatically cleans up stuck background processes
- Channel delivery support — background task results route to connected channels (WhatsApp, Slack, Telegram)
- Live progress events streamed via SSE with auto-refresh when tasks complete
- Background processing banner in chat auto-refreshes the session on completion

### Agent CRUD & OpenRouter Advanced Options
- Full create, edit, and delete workflow for agents directly from the settings page
- Document error handling surfaced clearly during agent setup
- OpenRouter provider now exposes advanced configuration options

### Default Seline Agent
- Every install now ships with a preconfigured default Seline agent
- Default agent syncs a dedicated workspace (`~/.seline/workspace/`) instead of the full project codebase — eliminates EMFILE errors and speeds up startup
- Default agent can now be permanently deleted if not needed

### Tool Call Minimization & Stacking
- Tool calls are now grouped and stacked into a compact badge row instead of rendering as individual blocks
- Collapsed view shows 2 rows of tool badges at a glance — expand to see full details with scrolling
- Handles 15+ concurrent tool calls cleanly without layout overflow or hidden controls

### Active Session Indicators
- Agent avatars now show a pulsing green badge when they have an ongoing background operation
- New `/api/characters/[id]/active-status` endpoint tracks running sessions per agent in real time

### Vector Sync Ignore Patterns
- Folder sync now supports configurable ignore patterns with a recommended set of excludes (node_modules, .git, dist, .next, venv, etc.)
- Ignore pattern UI added to the folder sync manager

### Bundled Node.js Runtime
- Node.js executable is now bundled inside the packaged app on macOS and Windows
- MCP servers spawn via the bundled Node.js instead of relying on system PATH — eliminates ENOENT errors and console window flashing on Windows
- Source code is bundled alongside for the default Seline agent to sync against in production builds

## Improvements

- **Next.js 15 → 16** — Major framework upgrade (16.1.6)
- **MCP SDK browser bundling prevented** — `@modelcontextprotocol/sdk` and `cross-spawn` are now properly externalized on both client and server, preventing crashes when the bundler tries to include Node.js-only code in the browser bundle
- **Electron stdio handling** — Added `dev-with-stdio-fix.mjs` wrapper that ensures valid stdio descriptors for the Next.js dev server inside Electron; prevents EBADF errors during development
- **MCP tool discovery for Codex/OpenAI** — Two bugs fixed: `mcp` category was missing from `searchTools` schema (models guessed wrong category, got zero results), and streaming tool calls via `tool-input-delta` were never finalized so `searchTools` never completed. Both resolved
- **File watcher stability** — Fixed EMFILE/EBADF file descriptor exhaustion on large codebases. Watchers now auto-fall back to polling mode, use efficient glob-based exclusions, and persist state across Next.js hot reloads
- **MCP filesystem auto-connect** — Filesystem MCP servers now auto-connect on startup with correct watcher ignore rules
- **MCP defaults off for new agents** — New agents no longer ship with MCP servers enabled by default, reducing noise and unexpected subprocess spawns on first launch
- **Memory watcher** — Opt-in heap usage monitor (`SELINE_MEMORY_WATCHER=1`) with periodic logging and automatic heap snapshot capture on threshold breach — useful for debugging leaks in long-running sessions
- **SSE hygiene** — Debug logs gated behind env flag, identifiers redacted in production, heartbeat properly cleaned up on cancel

## Bug Fixes

- Fixed default agent race condition — concurrent requests could create duplicate defaults, now uses atomic DB transaction with unique index
- Fixed workspace path resolving to `.local-data` instead of the home directory
- Fixed web-browse tool rejecting calls with legacy argument shapes
- Fixed MCP tools showing empty state in the character creation wizard
- Fixed background processing banner staying stuck after task completion
- Fixed invalid tool schema sent to Claude models during background runs
- Fixed MCP subprocess terminal windows appearing on macOS in production
- Fixed MCP server ENOENT errors in macOS production builds (Homebrew Node.js path resolution)
- Fixed chat session state lost when navigating back from settings
- Fixed Antigravity MCP tool schema dropping `dependentRequired` during normalization
- Fixed vector indexing running during active chat (now deferred until idle)
- Fixed scheduled task progress events firing inconsistently
- Fixed null safety crashes in agent run state at multiple call sites
- Fixed orphaned sync folders and vector DB tables left behind on agent deletion
- Fixed calculator tool evaluation returning incorrect results
- Fixed OpenRouter advanced args not persisting when saved in settings

