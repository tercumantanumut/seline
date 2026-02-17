# Plugin System — Remaining Implementation Plan

## Current State (Done)

- `lib/plugins/types.ts` — Full type definitions
- `lib/plugins/validation.ts` — Zod schemas (tested against 16 real plugins)
- `lib/plugins/import-parser.ts` — Zip parser with safeMatter() fallback for broken YAML
- `lib/plugins/hooks-engine.ts` — In-memory hook registry + command dispatch
- `lib/plugins/hook-integration.ts` — runPreToolUseHooks/runPostToolUseHooks/runPostToolUseFailureHooks
- `lib/plugins/mcp-integration.ts` — connectPluginMCPServers/disconnectPluginMCPServers/loadAllPluginMCPServers
- `lib/plugins/registry.ts` — CRUD: installPlugin, getInstalledPlugins, uninstallPlugin, marketplace CRUD
- `lib/plugins/index.ts` — Barrel export
- `lib/db/sqlite-plugins-schema.ts` — DB tables: plugins, plugin_hooks, plugin_mcp_servers, plugin_lsp_servers, plugin_files, marketplaces
- `app/api/plugins/route.ts` — GET list
- `app/api/plugins/[id]/route.ts` — GET/PATCH/DELETE
- `app/api/plugins/import/route.ts` — POST upload zip
- `app/api/plugins/marketplaces/route.ts` — GET/POST/DELETE
- `app/api/plugins/hooks/route.ts` — GET debug
- `app/api/skills/import/route.ts` — Modified: plugin detection before legacy fallback
- `components/settings/plugin-settings.tsx` — Basic settings tab (install, enable/disable, uninstall)
- `app/settings/page.tsx` — Plugins tab added to sidebar
- `tests/lib/plugins/plugin-system.test.ts` — 46 unit tests passing
- `tests/lib/plugins/real-plugin-test.ts` — 16 real marketplace plugins tested

---

## Step 1: Wire Hooks Into Tool Execution Pipeline

**File: `app/api/chat/route.ts`**

1. Add import at top:
   ```ts
   import { runPreToolUseHooks, runPostToolUseHooks, runPostToolUseFailureHooks } from "@/lib/plugins/hook-integration";
   ```

2. Find the `onChunk` callback inside the `streamText()` call (around line 2956). After `chunk.type === "tool-call"` handling, the tool is about to execute. But since Vercel AI SDK manages tool execution internally, the right place is `onStepFinish` or by wrapping tool execute functions.

3. **Better approach**: Wrap each tool's `execute` function to inject hooks. Create a helper:
   ```ts
   function wrapToolWithHooks(toolId: string, originalTool: Tool, sessionId: string): Tool {
     return {
       ...originalTool,
       execute: async (args: any) => {
         const hookResult = await runPreToolUseHooks(toolId, args, sessionId);
         if (hookResult.blocked) {
           return `Tool blocked by plugin hook: ${hookResult.blockReason}`;
         }
         try {
           const result = await originalTool.execute!(args);
           runPostToolUseHooks(toolId, args, result, sessionId);
           return result;
         } catch (error) {
           runPostToolUseFailureHooks(toolId, args, error instanceof Error ? error.message : String(error), sessionId);
           throw error;
         }
       },
     };
   }
   ```

4. Apply wrapper to all tools in `allToolsWithMCP` before passing to `streamText()`. Only wrap if there are registered hooks (check `getRegisteredHooks("PreToolUse").length > 0 || getRegisteredHooks("PostToolUse").length > 0`).

5. Test: Install hookify plugin, verify PreToolUse hooks fire when tools are called.

---

## Step 2: Load Plugin Hooks on Chat Start

**File: `app/api/chat/route.ts`**

1. Near the top of the POST handler (after auth + user resolution, around where MCP tools are loaded), add:
   ```ts
   import { loadActivePluginHooks } from "@/lib/plugins/registry";
   ```

2. Call `await loadActivePluginHooks(dbUser.id)` once per chat session start. Use a global flag or session-scoped flag to avoid reloading on every message:
   ```ts
   // Load plugin hooks (idempotent — registerPluginHooks deduplicates internally)
   await loadActivePluginHooks(dbUser.id);
   ```

3. This populates the in-memory hook registry so Step 1's wrappers have hooks to dispatch.

---

## Step 3: Wire Plugin MCP Servers Into Chat Start

**File: `lib/mcp/chat-integration.ts`**

1. Add import:
   ```ts
   import { loadAllPluginMCPServers } from "@/lib/plugins/mcp-integration";
   ```

2. At the end of `loadMCPToolsForCharacter()`, after all standard MCP connections are established, add:
   ```ts
   // Connect MCP servers from active plugins
   const userId = character?.metadata?.userId; // need to pass userId through
   if (userId) {
     await loadAllPluginMCPServers(userId, character?.id);
   }
   ```

3. **Alternative** (simpler): Add to `app/api/chat/route.ts` directly, after `loadMCPToolsForCharacter()` returns, call `loadAllPluginMCPServers(dbUser.id, characterId)`. The MCP tools will be discovered on next `manager.getAllTools()`.

4. Plugin MCP servers are namespaced as `plugin:{pluginName}:{serverName}` so they won't collide with user-configured MCP servers.

---

## Step 4: Register Plugin Skills Into AI Tool System

**File: `app/api/chat/route.ts`** or new file `lib/plugins/skill-loader.ts`

1. Create `lib/plugins/skill-loader.ts`:
   ```ts
   import { getInstalledPlugins } from "./registry";
   import type { PluginSkillEntry } from "./types";

   export async function getPluginSkillsForPrompt(userId: string): Promise<string> {
     const plugins = await getInstalledPlugins(userId, { status: "active" });
     const skills: PluginSkillEntry[] = [];
     for (const plugin of plugins) {
       skills.push(...plugin.components.skills);
     }
     if (skills.length === 0) return "";
     const lines = skills.map(s =>
       `- /${s.namespacedName}: ${s.description || s.name}`
     );
     return `\n\nAvailable plugin commands:\n${lines.join("\n")}`;
   }

   export async function getPluginSkillContent(
     userId: string,
     namespacedName: string
   ): Promise<string | null> {
     const plugins = await getInstalledPlugins(userId, { status: "active" });
     for (const plugin of plugins) {
       const skill = plugin.components.skills.find(s => s.namespacedName === namespacedName);
       if (skill) return skill.content;
     }
     return null;
   }
   ```

2. In `app/api/chat/route.ts`, append plugin skills summary to the system prompt (alongside existing `getSkillsSummaryForPrompt()`):
   ```ts
   import { getPluginSkillsForPrompt } from "@/lib/plugins/skill-loader";
   // ...
   const pluginSkillsSummary = await getPluginSkillsForPrompt(dbUser.id);
   // Append to system prompt
   ```

3. When the model invokes a plugin skill (e.g., `/hookify:configure`), the existing skill runner or a new handler should look up the skill content and inject it as context.

---

## Step 5: Drag-and-Drop Plugin Import in Chat

**File: New `components/plugins/plugin-import-dropzone.tsx`**

1. Copy pattern from `components/skills/skill-import-dropzone.tsx`.
2. Accept `.zip` files, POST to `/api/plugins/import`.
3. On success, show toast with plugin name + component counts.
4. On failure (legacy skill detected), fall back to skill import flow.

**File: Integrate into chat input area**

1. Find the chat input component (likely `components/chat/chat-input.tsx` or similar).
2. Add drop handler that detects `.zip` files and routes to plugin import.
3. Show inline feedback: "Installing plugin... → Plugin X installed (3 skills, 1 agent, hooks enabled)".

---

## Step 6: Plugin Detail View / Modal

**File: Update `components/settings/plugin-settings.tsx`**

1. Add expandable detail section to each plugin card (click to expand).
2. Show full component breakdown:
   - **Skills tab**: List all skills with name, description, content preview (first 3 lines)
   - **Agents tab**: List all agents with name, description
   - **Hooks tab**: Show event types + matchers + commands
   - **MCP tab**: Show server names + transport type + connection status
3. Use `Sheet` or `Dialog` from shadcn for the detail view.
4. Add "View Source" button that shows raw plugin.json manifest.

---

## Step 7: Marketplace Browser UI

**File: New `components/settings/marketplace-browser.tsx`**

1. Add "Browse Marketplace" button to plugin settings header.
2. Fetch registered marketplaces from `/api/plugins/marketplaces`.
3. For each marketplace with a catalog, display available plugins in a grid:
   - Plugin name, description, version, author
   - "Install" button per plugin
   - Category/tag filtering
   - Search by name/description
4. "Add Marketplace" form: input for GitHub repo URL or marketplace URL.
5. "Refresh" button to re-fetch marketplace catalogs.

**File: New `app/api/plugins/marketplaces/[id]/fetch/route.ts`**

1. POST endpoint that fetches the marketplace catalog from its source.
2. For GitHub sources: clone repo, read `.claude-plugin/marketplace.json`, update DB.
3. For URL sources: fetch JSON, validate, update DB.
4. Return updated catalog.

**File: New `app/api/plugins/marketplaces/[id]/install/route.ts`**

1. POST endpoint with `{ pluginName }` body.
2. Look up plugin in marketplace catalog.
3. For GitHub sources: clone plugin repo, zip it, run through parsePluginPackage + installPlugin.
4. Return installed plugin info.

---

## Step 8: Per-Agent Plugin Assignment UI

**File: Update agent editor (wherever character metadata is edited)**

1. Find the agent/character settings component (likely in `app/agents/[id]/` or `components/character-editor.tsx`).
2. Add "Plugins" section showing all installed plugins with toggles.
3. Store enabled plugin IDs in character metadata: `metadata.enabledPlugins: string[]`.
4. When loading plugins for a chat session, filter by `characterId` or by `enabledPlugins` list.

**File: Update `lib/plugins/registry.ts`**

1. Add `getPluginsForCharacter(userId, characterId)` that returns plugins matching the character's enabled list OR plugins with scope "user" (global).

---

## Step 9: Plugin Status Indicators in Chat

**File: Update chat UI header/sidebar**

1. Add small plugin icon badge near the agent name showing: "3 plugins active".
2. If any plugin has status "error", show warning indicator.
3. Clicking the badge opens a popover with:
   - List of active plugins
   - Quick enable/disable toggles
   - Link to full plugin settings

---

## Step 10: i18n for Plugin UI

**File: `messages/en.json` (and other locale files)**

1. Add `plugins` namespace:
   ```json
   "plugins": {
     "title": "Plugins",
     "subtitle": "Extend your agent with skills, hooks, MCP servers, and more.",
     "install": "Install Plugin",
     "installing": "Installing...",
     "uninstall": "Uninstall",
     "enable": "Enable",
     "disable": "Disable",
     "noPlugins": "No plugins installed",
     "noPluginsHint": "Upload a plugin .zip package to get started",
     "components": {
       "skills": "skills",
       "agents": "agents",
       "hooks": "hooks",
       "mcpServers": "MCP servers"
     },
     "marketplace": {
       "browse": "Browse Marketplace",
       "add": "Add Marketplace",
       "refresh": "Refresh",
       "install": "Install",
       "installed": "Installed"
     },
     "status": {
       "active": "Active",
       "disabled": "Disabled",
       "error": "Error"
     }
   }
   ```

2. Update `components/settings/plugin-settings.tsx` to use `useTranslations("plugins")`.

---

## Step 11: Run DB Migration

**File: Create migration script or rely on drizzle-kit**

1. The new tables in `lib/db/sqlite-plugins-schema.ts` need to be created in the database.
2. Run `npx drizzle-kit push` or equivalent migration command.
3. Verify tables exist: `plugins`, `plugin_hooks`, `plugin_mcp_servers`, `plugin_lsp_servers`, `plugin_files`, `marketplaces`.

---

## Step 12: End-to-End Testing

1. Start the dev server.
2. Go to Settings → Plugins → Install a real plugin zip (e.g., hookify or commit-commands).
3. Verify:
   - Plugin appears in the list with correct name/version/components.
   - Enable/disable toggle works.
   - Uninstall removes the plugin.
4. Start a chat session with the plugin active.
5. Verify:
   - Plugin skills appear in system prompt.
   - Plugin hooks fire on tool use (check server logs).
   - Plugin MCP servers connect (if applicable).
6. Test drag-and-drop in chat (Step 5).
7. Test marketplace browser (Step 7).

---

## Priority Order

| Priority | Step | Effort | Impact |
|----------|------|--------|--------|
| P0 | Step 11 (DB migration) | 5 min | Blocking — nothing works without tables |
| P0 | Step 2 (Load hooks on chat start) | 15 min | Enables hook system |
| P0 | Step 1 (Wire hooks into tools) | 30 min | Core hook functionality |
| P0 | Step 4 (Plugin skills in AI) | 30 min | Plugin skills usable |
| P1 | Step 3 (Plugin MCP servers) | 20 min | Plugin MCP usable |
| P1 | Step 5 (Drag-drop in chat) | 45 min | Key UX flow |
| P1 | Step 6 (Plugin detail view) | 1 hr | Visibility into installed plugins |
| P2 | Step 7 (Marketplace browser) | 2 hr | Discoverability |
| P2 | Step 8 (Per-agent plugins) | 1 hr | Multi-agent support |
| P2 | Step 9 (Chat status indicators) | 30 min | Polish |
| P3 | Step 10 (i18n) | 30 min | Localization |
| P3 | Step 12 (E2E testing) | 1 hr | Confidence |

Total remaining: ~8 hours of implementation.
