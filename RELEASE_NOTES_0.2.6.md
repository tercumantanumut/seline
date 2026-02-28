# Seline v0.2.6 Release Notes

**Release Date:** February 28, 2026

---

## Embedded Chromium Workspace

A first-class, agent-usable browser automation tool built directly into the chat experience.

- **Single multi-action tool** — 9 actions (`open`, `navigate`, `click`, `type`, `snapshot`, `extract`, `evaluate`, `close`, `replay`) in one unified `chromiumWorkspace` tool instead of fragmented MCP tools
- **Per-agent sandboxed sessions** — Each agent gets its own isolated Playwright BrowserContext with separate cookies, localStorage, and service workers. Parallel agents no longer conflict
- **Uses system Chrome** — Zero-download setup. Uses your installed Chrome/Chromium instead of downloading a 300MB Playwright binary
- **Deterministic replay** — Full execution history (action, input, output, DOM snapshot, timestamps) captured and replayable with output verification
- **Live browser screencast** — Real-time CDP screencast streams the browser viewport as the chat session background. See exactly what the agent sees while it browses
- **Custom tool UI** — Action timeline with per-action icons, expandable details (input/output/DOM snapshots), replay results with match indicators
- **3-layer cleanup** — Explicit close → onFinish/onAbort hooks → idle reaper (10 min). No leaked browser processes
- **Auto-enabled** — Available for all agents out of the box, no env var needed. Data migration adds it to existing agents on startup

## Streaming Stability

- **Claude Code tool stream ordering** — Fixed tool call ordering so `tool-result` parts always follow their corresponding `tool-use`, preventing dangling tool calls that broke conversation history
- **Dangling tool call sealing** — Automatic detection and sealing of orphaned tool calls with error results so they don't poison subsequent turns
- **Background streaming fixes** — Resolved hammer-drop polling cascade where background tasks would escalate polling frequency until the server was overwhelmed
- **Codex heartbeat** — Extended stream keepalive during long thinking phases to prevent premature connection drops

## Tool System

- **MCP tool UI name resolution** — Fixed systemic bug where custom tool UIs (vectorSearch, executeCommand, editFile, calculator, etc.) never rendered because `mcp__seline-platform__` prefix wasn't stripped during lookup. All custom tool UIs now work correctly
- **Tool-result splitting** — Applied tool-result content splitting for all providers (was previously Claude-only), fixing Session Search output and other multi-provider tool calls
- **Deterministic tool history normalization** — Restored correct ordering for Codex/OpenAI tool history conversion
- **Agent SDK tool isolation** — Scoped MCP tool exposure per-agent to prevent cross-agent tool leakage

## Platform Stability

- **System workflow persistence** — VectorSync foreign key constraints, UI auto-refresh after workflow changes, text paste handling improvements
- **Background streaming signature** — Fixed `onDismissed` callback race condition causing state updater warnings
- **Quickstart stability** — Fixed remount loop, reverted broken quickstart skill refinement, restored chat-interface foreground ID resume
- **Windows test compatibility** — Fixed path separator and platform-specific test failures
- **Settings & workspace** — Resolved 8 issues across settings panels, UI components, and workspace initialization

## Build & Distribution

- **macOS code signing & notarization** — Enabled hardened runtime, DMG signing, and Apple notarization via `afterSign` hook. Supports keychain profiles, App Store Connect API keys, and Apple ID authentication

---

**Stats:** 110 files changed, 8,669 insertions, 7,151 deletions across 22 commits
