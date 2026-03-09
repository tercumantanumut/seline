# Selene v0.3.0-alpha.1

> First alpha of v0.3. Renamed from Seline to Selene. ~470 commits since v0.2.1.

## What's New

### Plugin System
Full plugin ecosystem. Plugins can define lifecycle hooks (pre/post tool use), bundle skills, spin up MCP servers, and ship as drag-drop packages. Plugins are assigned per-agent — each agent loads only its own plugins into the chat pipeline. Import plugins by dropping a folder into chat or through the settings UI.

### Multi-Agent Workflows
Agents can delegate tasks to sub-agents with scoped context isolation. Delegation follows a structured lifecycle: start → observe → continue/stop. Sub-agents run in their own context windows — no cross-contamination of conversation state. Workflow configurations persist across sessions.

### Developer Workspaces
Git worktree integration for isolated code changes. Create a workspace, make changes on a branch, open a PR — all from chat. Session-scoped isolation prevents concurrent agents on the same character from stepping on each other's worktrees. One-click PR flow through the workspace dashboard.

### Claude Agent SDK
Replaced the OAuth-based Claude Code pipeline with the official `@anthropic-ai/claude-agent-sdk`. Proper token accounting, streaming stability, and sub-task isolation. Claude Code sub-agents no longer share the main agent's context window.

### Chromium Workspace
Per-agent sandboxed browser with action-based automation (open, click, type, snapshot, evaluate, extract). Uses system Chrome instead of downloading Playwright binaries. Includes live screencast as chat backdrop, session recording, and replay. Browser sessions persist across navigation.

### Skills v2
Database-backed skill system with create/patch/replace/archive lifecycle. Skills can be imported via drag-drop, exported as packages, discovered at runtime via `runSkill`, and triggered from chat with a slash picker (Cmd+/). 15 ported Codex skills bundled by default.

### 3D Avatar & Emotion
Animated 3D avatar with emotion detection from conversation context. MiniMax TTS integration for natural speech. Avatar responds to mute/unmute controls. EverMemOS integration for persistent avatar state.

### Voice Pipeline
Parakeet STT server with push-to-talk, streaming voice input, and AI post-processing for dictation cleanup. Sentence-level TTS buffering for responsive speech output. More Edge TTS voices added. Voice transcript restore bar prevents lost recordings.

### Dashboard
Redesigned with pinned chats, activity overview, and chat statistics. Session archive/restore. Per-session analytics links. Agent search in the picker. Dynamic browser tab titles showing agent names.

### Internationalization
Comprehensive i18n pass across the entire UI — settings, onboarding, tools, plugins, skills, workspaces, dashboard, sidebar, modals, toasts. Turkish translations included.

### Discord Integration
Full channel integration matching Telegram, Slack, and WhatsApp. Typing indicators and stop command handling.

### Rich Text Editor
Tiptap-based editor with inline image positioning, formatting persistence across navigation, and bidirectional sync with the simple composer.

### DuckDuckGo Search
Free alternative to Tavily/Firecrawl for web search. Auto-fallback when no API key is configured.

### Wallpapers
Video and live wallpapers with glassmorphism across all UI surfaces. Themed tool badges with proper contrast on transparent backgrounds.

### Onboarding
Overhauled wizard with features showcase, path selector for different user types, and streamlined provider setup. System agents trimmed from 7 to 3.

---

## Improvements

- **Agent creation wizard** — reworked for better UX, gradient avatar cards, accent color theming
- **File watcher resilience** — automatic polling fallback on EMFILE, glob-based exclusions, `awaitWriteFinish` for reduced FD churn
- **Synced folder watchers** — pause/resume support, global state to survive hot reloads
- **Tool result display** — human-readable summaries instead of raw JSON, expand/collapse all toggle
- **Prompt caching** — enabled for Claude Code provider, simplified strategy with 1h TTL
- **Image tools** — support `file://` URLs and absolute paths, auto-resize oversized images before base64 conversion
- **Debug logger** — log levels and async buffered writes
- **Sidebar** — session count in history header, search with `/` shortcut, date bucketing, activity bubbles with lifecycle and priority
- **Agent cards** — overflow dropdown menu replacing inline action buttons, duplicate agent action
- **Composer** — attachments in rich editor path, paste block extraction/reinsertion
- **Channel delivery** — raw mode to preserve code blocks, AskUserQuestion support, 90-min timeout

---

## Fixes

- **Environment variable isolation** — `__NEXT_PRIVATE_*` vars no longer leak from Selene to child processes (e.g., running `npm run dev` in a synced website project)
- **spawn EBADF / EAGAIN** — file-capture fallback across all spawn sites for Electron utilityProcess on macOS
- **Default agent race condition** — unique constraint + atomic transaction prevents duplicate default agents
- **Orphaned sync folders** — CASCADE deletes + proper cleanup (stop watchers, delete vector table) on agent deletion
- **Codex/OpenAI tool discovery** — `mcp` category added to searchTools schema, soft category filtering, streaming tool call finalization
- **Context window isolation** — Claude Code agents scoped to their own context, no cross-agent contamination
- **SSE stream guards** — fixed 25k single-tool budget, oversized tool-call payload protection, progress event truncation
- **Streaming stability** — duplicate tool_use prevention, dangling tool call sealing, tool correlation ID preservation during Codex filtering
- **Chat state** — desync on navigation/stop/edit/reload resolved, phantom branch prevention, stop-message loss fix
- **Background mode** — hammer-drop and runaway polling eliminated, correct foreground/background indicator states
- **Telegram** — stop commands during active channel runs, deprecated `files.upload` for Slack
- **MCP** — bundled Node.js binary for packaged runtime, -32000 connection fix, tool name normalization

---

## Breaking Changes

- **Renamed from Seline to Selene** — internal identifiers (`bg-seline-bg` CSS classes, file paths) unchanged, all user-facing text updated
- **System agents trimmed from 7 to 3** — unused preset agents removed
- **Rewards system removed** — model rewards feature dropped from onboarding and UI
- **Legacy web tools removed** — unified into DuckDuckGo baseline with optional Tavily/Firecrawl

---

## Platform

- macOS (Apple Silicon + Intel) / Windows
- Electron with Next.js 16.1.6
- Package version: `0.3.0`
