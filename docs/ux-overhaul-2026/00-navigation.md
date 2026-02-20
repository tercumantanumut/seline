# Seline UX Overhaul 2026 — Navigation & Implementation Checklist

*Meeting date: 2026-02-19 | All plans verified against codebase | Gap analysis incorporated*

---

## Quick Links

| # | Document | Topic | Priority | Owner |
|---|----------|-------|----------|-------|
| [01](./01-create-agent-modal.md) | Create Agent Modal | Replace full-page wizard with inline modal | P1 | Umut |
| [02](./02-wizard-simplification.md) | Wizard Simplification | Remove 5 steps, merge Preview+Success | P2 | Umut |
| [03](./03-default-tools.md) | Default Tools | Pre-select all utility tools for new agents | P3 | Umut |
| [04](./04-agent-card-cleanup.md) | Agent Card Cleanup | Replace 7-button row with `•••` dropdown | P4 | Umut |
| [05](./05-agent-duplicate.md) | Agent Duplicate | New API + UI to copy agents | P5 | Umut |
| [06](./06-workflow-sections.md) | Workflow Sections | Add Workflows / Agents section headers | P6 | Umut |
| [07](./07-slash-skill-picker.md) | Slash Skill Picker | `/` in chat input opens skill browser | P7 | Umut |
| [08](./08-deferred.md) | Deferred Items | Node graph, marketplace, agent onboarding | Future | Both |
| [09](./09-launch-marketing-plan.md) | Launch Plan | Mar 4 Product Hunt launch strategy | Now | Both |

**Implementation order: 03 → 01 → 02 → 04 → 05 → 06 → 07** (doc 03 unlocks doc 01; doc 04 unlocks doc 05)

---

## One-Line Task Reference

### Doc 03 — Default Tools *(do this first)*
- [ ] `lib/characters/templates/resolve-tools.ts` — Add `export` to `ALWAYS_ENABLED_TOOLS` and `UTILITY_TOOLS`
- [ ] `lib/characters/templates/resolve-tools.ts` — Add `delegateToSubagent` to `UTILITY_TOOLS`
- [ ] `lib/characters/templates/resolve-tools.ts` — Add and export `DEFAULT_ENABLED_TOOLS = [...ALWAYS_ENABLED_TOOLS, ...UTILITY_TOOLS, "webSearch"]`
- [ ] `lib/characters/templates/seline-default.ts` — Import `DEFAULT_ENABLED_TOOLS` and use as base for `SELINE_STATIC_TOOLS`
- [ ] `components/character-creation/terminal-wizard.tsx` — Change `enabledTools: ["docsSearch"]` → `enabledTools: DEFAULT_ENABLED_TOOLS`
- [ ] `components/character-creation/terminal-pages/capabilities-page.tsx` — Add `delegateToSubagent` to `BASE_TOOLS` array
- [ ] `components/character-creation/terminal-pages/capabilities-page.tsx` — Change prop default `initialEnabledTools = ["docsSearch"]` → `= DEFAULT_ENABLED_TOOLS`
- [ ] `components/character-creation/terminal-pages/capabilities-page.tsx` — Remove `tavilyKey` from `webSearch` dependencies
- [ ] `components/character-picker.tsx` — Remove `tavilyKey` from `webSearch` dependencies (inline tool editor)

### Doc 01 — Create Agent Modal *(depends on doc 03)*
- [ ] `components/character-creation/create-agent-modal.tsx` — **Create new file** with Quick Create + From Template tabs
- [ ] `components/character-picker.tsx` line ~1628 — Replace `<Link href="/create-character">` with `<button onClick={() => setCreateModalOpen(true)}>`
- [ ] `components/character-picker.tsx` line ~1843 — Replace empty-state `<Link>` with button opening the same modal
- [ ] `components/character-picker.tsx` — Add `const [createModalOpen, setCreateModalOpen] = useState(false);`
- [ ] `components/character-picker.tsx` — Add `<CreateAgentModal open={createModalOpen} onOpenChange={setCreateModalOpen} onCreated={() => loadCharacters()} />`
- [ ] `locales/en.json` — Add `picker.createModal.*` namespace (12 keys)
- [ ] `locales/tr.json` — Add same `picker.createModal.*` namespace in Turkish

### Doc 02 — Wizard Simplification
- [ ] `components/character-creation/terminal-wizard.tsx` — Update `PROGRESS_PAGES` to `["identity", "capabilities", "mcpTools"]`
- [ ] `components/character-creation/terminal-wizard.tsx` — Change post-identity navigation from `navigateTo("knowledge")` → `navigateTo("capabilities")`
- [ ] `components/character-creation/terminal-wizard.tsx` — Remove render blocks for `knowledge`, `embeddingSetup`, `vectorSearch`, `preview`
- [ ] `components/character-creation/terminal-wizard.tsx` — Remove imports: `KnowledgeBasePage`, `EmbeddingSetupPage`, `VectorSearchPage`, `PreviewPage`, `UploadedDocument`
- [ ] `components/character-creation/terminal-wizard.tsx` — Remove `documents` from `WizardState` and `initialState`
- [ ] `components/character-creation/terminal-wizard.tsx` — Remove handler functions: `handleKnowledgeSubmit`, `handleVectorSearchSubmit`, `handleEmbeddingSetupSubmit`, `handleEmbeddingSetupSkip`
- [ ] `components/character-creation/terminal-wizard.tsx` — Add `handleFinalizeAgentWithTools(tools: string[])` function (accepts tools directly to avoid setState async race)
- [ ] `components/character-creation/terminal-wizard.tsx` — Update `handleCapabilitiesSubmit` to call `handleFinalizeAgentWithTools` when no MCP servers
- [ ] `components/character-creation/terminal-wizard.tsx` — Update `MCPToolsPage.onComplete` to call `handleFinalizeAgentWithTools(state.enabledTools)` (was: `navigateTo("preview")`)
- [ ] `components/character-creation/terminal-wizard.tsx` — Update `CapabilitiesPage.onBack` to `navigateTo("identity", -1)` (was: routing through vectorSearch/embeddingSetup)
- [ ] `components/character-creation/terminal-wizard.tsx` — Narrow i18n cast on line ~122 to remove old page ids
- [ ] `components/ui/wizard-progress.tsx` — Remove 4 entries: `knowledge`, `embeddingSetup`, `vectorSearch`, `preview`
- [ ] `components/ui/wizard-progress.tsx` — Remove now-unused icon imports (`BookOpen`, `Database`, `Eye`)
- [ ] `components/character-creation/terminal-pages/capabilities-page.tsx` — Update `onSubmit` signature to accept optional `vectorConfig`
- [ ] `components/character-creation/terminal-pages/capabilities-page.tsx` — Add "Advanced Options" collapsible section with vector search toggle
- [ ] `components/character-creation/terminal-pages/success-page.tsx` — Add `tagline` and `enabledTools` props; display agent summary
- [ ] `components/character-creation/terminal-pages/success-page.tsx` — Remove "Configure Another Agent" button
- [ ] `locales/en.json` + `locales/tr.json` — Remove orphaned keys (knowledgeBase, embeddingSetup, vectorSearchPage, preview sections)
- [ ] `locales/en.json` + `locales/tr.json` — Add new keys for SuccessPage summary + CapabilitiesPage advanced section

### Doc 04 — Agent Card Cleanup *(do before doc 05)*
- [ ] `components/character-picker.tsx` — Add `MoreHorizontal, Copy, Puzzle` to lucide-react import (NOT `MoreHorizontalIcon`, `CopyIcon`, `PuzzleIcon`)
- [ ] `components/character-picker.tsx` — Add `DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger` import
- [ ] `components/character-picker.tsx` line ~1657 — Add `relative group` to `AnimatedCard` className (both are required)
- [ ] `components/character-picker.tsx` — Add `•••` `DropdownMenu` with 8 items inside card header
- [ ] `components/character-picker.tsx` — Use `onSelect` not `onClick` on all `DropdownMenuItem`s
- [ ] `components/character-picker.tsx` — Add `onClick={(e) => e.stopPropagation()}` to `DropdownMenuContent` (not just trigger)
- [ ] `components/character-picker.tsx` — Use `openDeleteDialog(character)` not `handleDelete(char.id)` for Delete item
- [ ] `components/character-picker.tsx` — Use `openMcpToolEditor(character)` not `openMcpEditor(char)` for MCP item
- [ ] `components/character-picker.tsx` — Add Dashboard item: `router.push("/dashboard")`
- [ ] `components/character-picker.tsx` — Add stub `handleDuplicate`: `toast("Duplicate coming soon")`
- [ ] `components/character-picker.tsx` — Remove entire old bottom button row (lines ~1729-1793)
- [ ] `components/character-picker.tsx` `AgentCardInWorkflow` component — Apply same `relative group` + `DropdownMenu` treatment
- [ ] `components/character-picker.tsx` — `•••` trigger opacity: `opacity-40 group-hover:opacity-100` (not `opacity-0`) for mobile visibility

### Doc 05 — Agent Duplicate
- [ ] `app/api/characters/[id]/duplicate/route.ts` — **Create new file** with `POST` handler
- [ ] Use `requireAuth + getOrCreateLocalUser` pattern (NOT `getLocalUser()`)
- [ ] Insert into `characters` table copying `metadata` JSON blob (NOT individual columns — they don't exist)
- [ ] Clear `workflowId`, `workflowRole`, `inheritedResources` from duplicated metadata
- [ ] Copy `agentSyncFolders` with correct drizzle field names: `recursive` (NOT `is_recursive`), `includeExtensions` (NOT `file_extensions`)
- [ ] Set `inheritedFromWorkflowId: null` and `inheritedFromAgentId: null` on copied folders
- [ ] Copy `agent_plugins` rows from join table
- [ ] Copy `character_images` rows (metadata only — same file path on disk)
- [ ] Add ownership check: `if (source.userId !== dbUser.id) → 403`
- [ ] Use `await params` (Next.js 15 async params)
- [ ] Strip existing ` (copy)` suffix before appending: `source.name.replace(/ \(copy\)$/, "") + " (copy)"`
- [ ] `components/character-picker.tsx` — Replace stub `handleDuplicate` with real: `resilientPost(…, {retries: 0})` → `loadCharacters()` → `toast.success("Agent duplicated")`

### Doc 06 — Workflow Sections
- [ ] `components/character-picker.tsx` line ~1369 — Upgrade existing `<h3>` to `<h2>` flex-row layout with divider
- [ ] `components/character-picker.tsx` — Inline `+ New Workflow` button calls `setWorkflowCreatorOpen(true)` (NOT `setShowCreateWorkflow`)
- [ ] `components/character-picker.tsx` — Disable `+ New Workflow` button when `allStandaloneCharacters.length === 0`
- [ ] `components/character-picker.tsx` — Remove old standalone "Create Workflow" button block (lines ~1352-1364)
- [ ] `components/character-picker.tsx` — Add "Agents" section header `<h2>` before the agent grid
- [ ] `components/character-picker.tsx` — Show workflows section header even when `filteredWorkflowGroups.length === 0` (with empty-state message)
- [ ] `components/character-picker.tsx` — Keep search bar in current position (or rename label to "Search agents & workflows...")
- [ ] `components/character-picker.tsx` — Replace `confirm()` for `removeSubagentFromWorkflow` with `<AlertDialog>`
- [ ] `components/character-picker.tsx` — Replace `confirm()` for `deleteWorkflowGroup` with `<AlertDialog>`
- [ ] `components/character-picker.tsx` — Add deleted-initiator placeholder: `{!initiator && <Badge variant="destructive">Agent deleted</Badge>}`
- [ ] `locales/en.json` + `locales/tr.json` — Add `agents.sectionTitle: "Agents"`

### Doc 07 — Slash Skill Picker
- [ ] `components/assistant-ui/thread.tsx` — Add state: `showSkillPicker`, `skillPickerQuery`, `selectedSkillIndex`
- [ ] `components/assistant-ui/thread.tsx` — Detect `/` using `inputValue.slice(0, cursorPosition)` (NOT full string)
- [ ] `components/assistant-ui/thread.tsx` — Load skills: `GET /api/skills?characterId={character.id}&status=active` (MUST include `status=active`)
- [ ] `components/assistant-ui/thread.tsx` — Get `character.id` from `useCharacter()` context (NOT a prop)
- [ ] `components/assistant-ui/thread.tsx` — Gate fetch: `if (!character?.id || character.id === "default") return`
- [ ] `components/assistant-ui/thread.tsx` — Integrate keyboard handler into existing delegation chain (after FileMentionAutocomplete handler)
- [ ] `components/assistant-ui/thread.tsx` — Handle both `Enter` AND `Tab` as selection keys
- [ ] `components/assistant-ui/thread.tsx` — On select: insert `"Run the {skill.name} skill "` (NOT `/run skillName`)
- [ ] `components/assistant-ui/thread.tsx` — Picker UI: place OUTSIDE `ComposerPrimitive.Root` (same placement as FileMentionAutocomplete)
- [ ] `components/assistant-ui/thread.tsx` — Use `onMouseDown + e.preventDefault()` on picker buttons (NOT `onClick` — avoids textarea blur race)
- [ ] `components/assistant-ui/thread.tsx` — Show "needs input" badge for skills with `inputParameters`
- [ ] `components/assistant-ui/thread.tsx` — Two empty states: "no skills at all" vs "no skills match query"

---

## Pre-Launch Checklist (Umut)

- [ ] Apple Developer enrollment + Mac signing + notarize DMG
- [ ] CONTRIBUTING.md added to repo
- [ ] README refreshed with screenshots, topics, GIF demo
- [ ] All 7 features implemented and tested
- [ ] Demo video recorded (60-90 sec)
- [ ] 5 short-form wow-moment clips recorded
- [ ] HN "Show HN" post written

## Pre-Launch Checklist (Duhan)

- [ ] Discord server created and set up
- [ ] Landing page with email capture live
- [ ] 200+ pre-launch emails collected
- [ ] Product Hunt page draft ready (12:01 AM PST Mar 4)
- [ ] Comparison table and description corrected (vs Open WebUI/AnythingLLM/Jan.ai)
- [ ] 5 newsletter press kit emails sent
- [ ] 5 influencer DMs sent
- [ ] Reddit accounts established (r/LocalLLaMA activity)
- [ ] 10-20 beta testers found and briefed
- [ ] Real estate analyzer demo GIF recorded
- [ ] 50-plugin marketplace list in marketplace.json format

---

## Architecture Quick Reference

| Where things live | Path |
|------------------|------|
| Agent templates | `lib/characters/templates/` |
| Tool definitions | `lib/ai/tool-registry/tool-definitions.ts` |
| Character API routes | `app/api/characters/` |
| Skills API | `app/api/skills/route.ts` |
| Workflow API | `app/api/workflows/` |
| Settings API | `app/api/settings/route.ts` |
| Chat input | `components/assistant-ui/thread.tsx` |
| Home page (character picker) | `components/character-picker.tsx` |
| Agent creation wizard | `components/character-creation/terminal-wizard.tsx` |
| DB schema | `lib/db/sqlite-character-schema.ts` |
| i18n English | `locales/en.json` |
| i18n Turkish | `locales/tr.json` |

## Key Correctness Notes

| Mistake to avoid | Correct version |
|-----------------|-----------------|
| `getLocalUser()` in API routes | `requireAuth(req)` + `getOrCreateLocalUser(userId, ...)` |
| `params.id` in Next.js 15 routes | `const { id } = await params` |
| `refetchCharacters()` | `loadCharacters()` |
| `toast({ description: "..." })` | `toast("...")` or `toast.success("...")` |
| `handleDelete(char.id)` | `openDeleteDialog(character)` |
| `openMcpEditor(char)` | `openMcpToolEditor(character)` |
| `setShowCreateWorkflow(true)` | `setWorkflowCreatorOpen(true)` |
| `MoreHorizontalIcon` | `MoreHorizontal` (no Icon suffix) |
| `PuzzleIcon` / `CopyIcon` | `Puzzle` / `Copy` |
| `is_recursive` in agentSyncFolders | `recursive` (drizzle field name) |
| `file_extensions` in agentSyncFolders | `includeExtensions` |
| `data.id` from template create | `data.characterId` |
| `data.name` from quick-create | `data.agent.name` |
| POST body: `{ name, purpose, ... }` (flat) | `{ character: { name }, metadata: { purpose, ... } }` (nested) |
| `resilientFetch({ method: "POST" })` | `resilientPost(url, body, options)` |
| `onClick` on DropdownMenuItem | `onSelect` |
| `/run skillName` in chat | `"Run the skillName skill"` |
| Regex on full inputValue | `inputValue.slice(0, cursorPosition)` |
