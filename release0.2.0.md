## 🧠 Context Window Management (New)

**Seline now intelligently manages context windows.** Instead of blindly hitting token limits and crashing, the system tracks token usage in real-time, compacts old messages automatically, and adapts per-model — so long conversations just keep working.

- **Context Window Manager** — pre-flight token budget checks before every API call; triggers compaction when usage crosses thresholds — `ef008a8`
- **Compaction Service** — multi-strategy approach: zero-cost auto-pruning (dedup, supersede writes, purge errors) + AI-driven summarization that preserves critical context — inspired by OpenCode DCP patterns — `ef008a8`
- **Token Tracker** — accurate per-message token estimation for text, images, and tool results with provider-aware counting — `ef008a8`
- **Provider-aware limits** — unified `context-limits.ts` with per-model metadata (200K Claude, 400K Codex, 128K OpenRouter, etc.) and automatic fallback to safe defaults — `b169705` `ef008a8`
- **Adaptive compaction** — Codex models get larger context budgets; compaction aggressiveness scales with how close you are to the limit — `ef008a8`
- **Status bar indicator** — live context usage shown in the UI status bar alongside active session and model info — `ab77442`

---

## 🎒 Model Bag & Per-Session Model Override (New)

**Pick your models like a toolkit.** The new Model Bag lets you assign different models to different roles (chat, thinking, utility) and override them per-session — no more one-model-fits-all.

- **Model Bag UI** — grid-based model picker with provider filters, capability badges (vision, thinking, speed), and tier indicators (flagship/utility) — `ab77442`
- **Unified Model Catalog** — single source of truth (`model-catalog.ts`) aggregating all provider model lists with enriched metadata (context window, capabilities, tier) — `ab77442`
- **Session Model Override** — change the model for a specific session without affecting your global defaults; persisted across page reloads — `ab77442`
- **Session Model Resolver** — runtime resolution layer that merges global config → agent defaults → session overrides into the final model selection — `ab77442`

---

## 📁 File System Tools (New)

**Agents can now read, write, and edit files in your synced folders.** Three new tools give agents direct filesystem access with safety guardrails.

- **editFile** — exact string replacement in existing files; requires prior read, enforces uniqueness, detects stale files — `c94cf99`
- **writeFile** — create new files or fully overwrite existing ones; max 1MB, no-op detection for identical content — `c94cf99`
- **patchFile** — atomic batch operations (create, update, delete) across multiple files; all-or-nothing validation — `c94cf99`
- **File history tracking** — `file-history.ts` records read/write timestamps to detect stale edits and prevent conflicts — `c94cf99`
- **Path safety** — shared `path-utils.ts` validates all paths against synced folders, blocks escapes, and ensures parent directories exist — `c94cf99`
- **Auto-diagnostics** — after every edit, `tsc` and `eslint` run automatically and report errors back to the agent — `c94cf99`
- **Dedicated tool UIs** — `edit-file-tool-ui.tsx` and `patch-file-tool-ui.tsx` render diffs and multi-file operations in the chat — `c94cf99`

---

## 💬 @ Mention Autocomplete (New)

- **File mentions in chat** — type `@` in the composer to search and reference synced files; results show file/folder icons with relative paths — `c94cf99`
- **Inline insertion** — selecting a result inserts the file path at cursor position, giving the agent precise file context — `c94cf99`

---

## 🔐 Claude Code OAuth Provider (New)

**Use your Claude Pro/MAX subscription directly.** Seline now supports Claude Code as a first-class provider via Anthropic's OAuth flow.

- **OAuth authentication** — full authorize → exchange → refresh token flow against `claude.ai` with PKCE and manual code-paste fallback for Electron — `#95` `f96c0fd`
- **Claude Code provider** — dedicated provider in `claudecode-provider.ts` with beta headers for interleaved thinking, fine-grained tool streaming, and `claude-code` mode — `f96c0fd`
- **Token refresh** — automatic background refresh with 15-minute threshold; persisted across dev recompilation — `f96c0fd`
- **Onboarding integration** — Claude Code appears as a provider option in the auth step with dedicated paste-code flow — `f96c0fd`

---

## 🧠 Memorize Tool (New)

- **Explicit memory saving** — agents can now store memories on demand when users say "remember this" or "note for future reference" — `b2be845` `4fd3b4c`
- **Immediate activation** — memories are saved as approved + manual, instantly injected into the system prompt on the next turn — `b2be845`
- **Category support** — memories can be tagged with categories (preferences, facts, instructions) for organized retrieval — `b2be845`
- **Exposed in picker and wizard** — memorize tool is now visible in the tool picker and agent creation wizard with full translations — `b2be845`

---

## 🔧 Improvements

- **Session sync store** — centralized Zustand store for real-time session state (active runs, model config, compaction status) with SSE-based live updates — `ab77442`
- **Background sync banner** — refactored sync status banner with cleaner state management across pages — `faa4bdd`
- **Status bar sync** — unified status bar showing active sessions, current model, and compaction state across all pages — `ab77442`
- **Scheduling overhaul** — timezone handling, calendar mirroring to Google Calendar, and delivery channel selection fully reworked — `#97` `4fd3b4c`
- **Zombie detection for SSE streams** — detects and cleans up stale/zombie SSE connections that would previously hang indefinitely — `d637024`
- **Packaging verification script** — `verify-package.js` validates Electron builds: no source code leaks, required runtime files present, correct bundle structure — `c94cf99`
- **Telegram media delivery** — both images and voice recordings can now be delivered in a single Telegram response — `d728a56`
- **Antigravity model normalization** — `normalizeModelsForProvider` now uses exact model IDs for Antigravity and other providers — `5df9a10`
- **Transient UI state reset** — switching or creating sessions now properly resets ephemeral UI state (scroll position, input drafts, pending indicators) — `900a131`
- **Streaming JSON hardening** — malformed JSON in streamed tool calls no longer causes full chat refresh — `583811d`
- **Docs cleanup** — removed stale documentation files (AI_PIPELINES.md, API.md, ARCHITECTURE.md, BUILD.md, vector-search-v2-analysis.md, etc.) — totaling ~7,000 lines of outdated docs purged

---

## Bug Fixes

- **Claude context window reverted** — Claude limits incorrectly bumped to 400K are reverted to 200K per Anthropic docs — `b169705`
- **MCP tool removal mid-session** — removing an MCP server no longer invalidates running sessions; tools are gracefully detached — `e18b1bb`
- **Terminal spawn on macOS** — `executeCommand` now correctly spawns processes in macOS production builds — `23e9961`
- **Thread list navigation** — navigating back to the thread list now fully re-renders all messages — `23e9961`
- **Windows Python quoting** — `executeCommand` fixes quoting for `python -c "..."` on Windows — `6137b45`
- **Codex context limits** — Codex models now get correct 400K context limits instead of generic defaults — `ef008a8`
- **Scheduling delivery & timezone** — fixed timezone calculation, delivery channel routing, and calendar mirroring for scheduled tasks — `#97` `4fd3b4c`
- **CLS media layout shift** — additional fix pass for media aspect ratio in tool results — `#94` `97d5d28`

---

## ⚠️ Version Bump Required

`package.json` is currently at `"version": "0.1.0"` — needs to be bumped to `"0.2.0"` before tagging.

---

*4 PRs merged · 16 commits · ~126 files changed · ~13,148 lines added · ~11,727 lines removed*
