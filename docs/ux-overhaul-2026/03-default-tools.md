# 03 — Pre-select All Utility Tools by Default

## Problem
New agents created via the wizard start with only `["docsSearch"]` enabled. This means a freshly created agent cannot execute commands, run skills, schedule tasks, memorize things, or do web searches until the user manually enables them.

**Meeting quote:**
> "Capabilities should be again fully configured by us. All the necessary tools should come selected. User should not need to see them at first and default agent should have all the capabilities that should maintain the full working integration of all the application."

---

## Current State

**`components/character-creation/terminal-wizard.tsx`** — line ~54:
```typescript
enabledTools: ["docsSearch"],  // only one tool — severely limited
```

**`lib/characters/templates/resolve-tools.ts`** — both constants are module-private (NO `export`):
```typescript
const ALWAYS_ENABLED_TOOLS = [
  "docsSearch", "localGrep", "readFile", "editFile", "writeFile", "executeCommand"
];

const UTILITY_TOOLS = [
  "calculator", "memorize", "runSkill", "scheduleTask",
  "sendMessageToChannel", "showProductImages", "updatePlan", "updateSkill"
  // "delegateToSubagent" is MISSING
];
// NOTE: webSearch and webBrowse are NOT in either array — they're added conditionally
```

---

## Target State

Every new agent (wizard and quick-create modal) should start with **all always-enabled + all utility tools + webSearch** pre-selected. Users can deselect in Capabilities if needed, but the default is fully functional.

`webBrowse` is intentionally excluded from the static default because it requires Firecrawl or a local scraper — enabling it when the user has neither configured causes a confusing "checked but broken" state in the UI.

---

## Changes

### File 1: `lib/characters/templates/resolve-tools.ts`

**Three changes:**

1. Add `export` keyword to both existing private constants
2. Add `delegateToSubagent` to `UTILITY_TOOLS`
3. Add `webSearch` to default set (DuckDuckGo works without any API key)
4. Export new `DEFAULT_ENABLED_TOOLS` constant

```typescript
// CHANGE: add "export" + add "delegateToSubagent":
export const ALWAYS_ENABLED_TOOLS = [
  "docsSearch",
  "localGrep",
  "readFile",
  "editFile",
  "writeFile",
  "executeCommand",
] as const;

// CHANGE: add "export" + add "delegateToSubagent":
export const UTILITY_TOOLS = [
  "calculator",
  "memorize",
  "runSkill",
  "scheduleTask",
  "sendMessageToChannel",
  "showProductImages",
  "updatePlan",
  "updateSkill",
  "delegateToSubagent",   // ← add this
] as const;

// ADD new export — the static default for all new agents:
// webSearch is included because DuckDuckGo fallback needs no API key
// webBrowse is NOT included — it silently disappears at runtime without Firecrawl/local scraper
export const DEFAULT_ENABLED_TOOLS: string[] = [
  ...ALWAYS_ENABLED_TOOLS,
  ...UTILITY_TOOLS,
  "webSearch",
];
```

**Why `webBrowse` is excluded from `DEFAULT_ENABLED_TOOLS`:**
The tool is registered with `enableEnvVar: "FIRECRAWL_API_KEY"` in the registry. Without Firecrawl or a local scraper configured, `isToolEnabled()` returns `false` and the tool is stripped at runtime. But in the Capabilities page UI, it would show as *checked but locked/disabled* (the `webScraper` dependency badge). Showing users a checked tool they cannot use is confusing. `webBrowse` remains in `resolveSelineTemplateTools` where it is added conditionally only when the dependency is met.

**Why `webSearch` IS included:**
The `tavilyKey` dependency shown in the Capabilities UI is stale — `webSearch` now uses DuckDuckGo as a free fallback when no Tavily key is set (see `resolveSelineTemplateTools` line 103). The UI dependency badge needs a separate fix (see Change 5 below).

---

### File 2: `lib/characters/templates/seline-default.ts`

Import and use `DEFAULT_ENABLED_TOOLS` as the base for the display preview list. The dynamic resolver (`resolveSelineTemplateTools`) still runs at creation time and adds `webBrowse`, `vectorSearch` conditionally — the static list is only used for template preview display.

```typescript
import { DEFAULT_ENABLED_TOOLS } from "./resolve-tools";

// Replace SELINE_STATIC_TOOLS with a reference to DEFAULT_ENABLED_TOOLS
// plus the conditionally-available tools (for display purposes only):
const SELINE_STATIC_TOOLS: string[] = [
  ...DEFAULT_ENABLED_TOOLS,
  "vectorSearch",  // shown in preview even though conditional — resolveSelineTemplateTools handles runtime
  "webBrowse",     // shown in preview even though conditional
];
```

This keeps the Seline template preview showing the full expected capability set (including conditional tools) while using `DEFAULT_ENABLED_TOOLS` as the base.

---

### File 3: `components/character-creation/terminal-wizard.tsx`

```typescript
// ADD import:
import { DEFAULT_ENABLED_TOOLS } from "@/lib/characters/templates/resolve-tools";

// CHANGE initial state (line ~54):
// BEFORE:
enabledTools: ["docsSearch"],

// AFTER:
enabledTools: DEFAULT_ENABLED_TOOLS,
```

---

### File 4: `components/character-creation/terminal-pages/capabilities-page.tsx`

Two changes:

**4a. Add `delegateToSubagent` to `BASE_TOOLS`:**
```typescript
// Find the BASE_TOOLS array and add:
{ id: "delegateToSubagent", name: "Delegate to Sub-Agent", category: "utility", ... },
// This prevents a flash-of-unchecked on first render since DEFAULT_ENABLED_TOOLS includes it
// but the async API fetch may not have returned yet
```

**4b. Update the prop default:**
```typescript
// BEFORE (line ~279):
initialEnabledTools = ["docsSearch"],

// AFTER:
initialEnabledTools = DEFAULT_ENABLED_TOOLS,
// Add import: import { DEFAULT_ENABLED_TOOLS } from "@/lib/characters/templates/resolve-tools";
```

---

### File 5: `components/character-creation/terminal-pages/capabilities-page.tsx` — Fix `webSearch` Dependency

The `webSearch` tool currently declares `dependencies: ["tavilyKey"]` in the capabilities page BASE_TOOLS, causing the checkbox to appear locked when no Tavily key is configured. This is stale since DuckDuckGo makes the tool functional without any key.

```typescript
// Find the webSearch entry in BASE_TOOLS and remove the dependency:
// BEFORE:
{ id: "webSearch", ..., dependencies: ["tavilyKey"] },

// AFTER:
{ id: "webSearch", ..., dependencies: [] },
// or simply omit the dependencies field
```

Also fix the same stale dependency in `components/character-picker.tsx` (inline tool editor BASE_TOOLS around line 118):
```typescript
// Find webSearch in the character-picker BASE_TOOLS and remove tavilyKey dependency
```

---

## Tool Reference Table

| Tool ID | Category | Included in DEFAULT_ENABLED_TOOLS | Notes |
|---------|----------|------------------------------------|-------|
| `docsSearch` | knowledge | ✓ | Vector similarity search in indexed docs |
| `localGrep` | knowledge | ✓ | Regex search through synced files |
| `readFile` | knowledge | ✓ | Read files from disk |
| `editFile` | knowledge | ✓ | Edit files on disk |
| `writeFile` | knowledge | ✓ | Create/overwrite files |
| `executeCommand` | knowledge | ✓ | Run shell commands |
| `webSearch` | search | ✓ | Web search (DuckDuckGo free; Tavily if key set) |
| `webBrowse` | search | ✗ | Requires Firecrawl API key or local scraper |
| `calculator` | utility | ✓ | Math calculations |
| `memorize` | utility | ✓ | Save facts to agent memory |
| `runSkill` | utility | ✓ | Execute a skill/plugin |
| `updateSkill` | utility | ✓ | Modify a skill |
| `scheduleTask` | utility | ✓ | Create cron/interval tasks |
| `sendMessageToChannel` | utility | ✓ | Send to chat channels |
| `showProductImages` | utility | ✓ | Display product images |
| `updatePlan` | utility | ✓ | Update agent's task plan |
| `delegateToSubagent` | utility | ✓ | Delegate to a sub-agent (was missing; now added) |

**Not in default set (optional/gated):**
- `vectorSearch` — requires embeddings setup (conditional in `resolveSelineTemplateTools`)
- `webBrowse` — requires Firecrawl or local scraper (conditional)
- `workspace` — requires `devWorkspaceEnabled` setting (double-gated: DB flag + runtime check)
- All image generation tools — require API keys
- `webQuery`, `firecrawlCrawl` — require specific API keys
- `describeImage`, `patchFile` — in EXCLUDED_TOOLS (intentionally off)

**Note on checked-but-locked tools:** Several tools in `DEFAULT_ENABLED_TOOLS` have UI dependency badges in the Capabilities page:
- `executeCommand`, `readFile`, `editFile`, `writeFile`, `localGrep` — depend on `syncedFolders`
- For new agents with no sync folders configured yet, these 5 tools will appear checked but locked/disabled in the Capabilities wizard

This is acceptable UX because: (a) the agent can still use `webSearch`, `memorize`, `runSkill`, etc. without sync folders, and (b) the lock icon communicates that the feature requires setup rather than being broken.

---

## Scope of This Change

This change applies to:
1. **Wizard new-agent flow** — via `initialState.enabledTools = DEFAULT_ENABLED_TOOLS`
2. **Seline default template creation** — via updated `SELINE_STATIC_TOOLS` base
3. **Quick-create modal** (doc 01) — modal passes `DEFAULT_ENABLED_TOOLS` in the `POST /api/characters` body

**Out of scope:**
- Other templates (social-media-manager, data-analyst, etc.) — each has its own tool set tailored to its purpose
- Plugin import sub-agents — use `InheritedAgentConfig.enabledTools` from plugin manifest
- `POST /api/characters` (direct creation via API) — no server-side injection; client must pass the right tools

---

## Verification Steps

1. Create a new agent via Quick Create modal → agent's tool count shows 17 tools
2. Create a new agent via wizard → Capabilities page loads with all tools pre-checked
3. `webSearch` checkbox is NOT locked/disabled (no `tavilyKey` dependency badge)
4. `webBrowse` is NOT pre-checked (dependency not met for most users)
5. `delegateToSubagent` appears in the tool list for workflow agents
6. Default Seline template preview shows its tool set (including vectorSearch, webBrowse for display)

---

## Gap Analysis & Missing Considerations

> The following were identified by codebase research on 2026-02-19 and have been incorporated into the plan above. Kept here for historical reference.

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | `ALWAYS_ENABLED_TOOLS` and `UTILITY_TOOLS` not exported | `export` added to both in Change 1 |
| 2 | `DEFAULT_ENABLED_TOOLS` didn't exist | Created and exported in Change 1 |
| 3 | `webSearch`/`webBrowse` NOT in `ALWAYS_ENABLED_TOOLS` | `webSearch` added explicitly; `webBrowse` excluded with explanation |
| 4 | `webBrowse` has Firecrawl gate — silently disappears | Excluded from DEFAULT_ENABLED_TOOLS; remains in dynamic resolver |
| 5 | `webSearch` UI shows stale `tavilyKey` dependency | Change 5 removes the stale dependency from capabilities-page and character-picker |
| 6 | `delegateToSubagent` missing from wizard BASE_TOOLS | Change 4a adds it |
| 9 | `CapabilitiesPage` prop default was `["docsSearch"]` | Change 4b updates it to `DEFAULT_ENABLED_TOOLS` |
| 10 | Plan showed wrong draft POST schema | Using `POST /api/characters` in modal (doc 01) instead |
| 11 | Checked-and-locked tools (syncedFolders-dependent) | Acknowledged in tool reference table; acceptable UX |
| 13 | Other creation paths don't use DEFAULT_ENABLED_TOOLS | Scope explicitly limited in plan |
