# 02 — Wizard Simplification (Remove Knowledge, Optional Embeddings, Merge Preview+Success)

## Problem
The full `/create-character` wizard has 9 steps. Three of them are either deprecated, unnecessary for most users, or redundant:
- **Knowledge** — document uploads; deprecated, folder syncing replaces it
- **Embedding Setup + Vector Search** — required today but should be optional/advanced
- **Preview** — redundant with Success; meeting says combine them

**Meeting quotes:**
> "Knowledge should be completely deleted from all app because it's unnecessary. We have folder syncing."
> "Embeddings were necessary at one point but now it is not since we have options to go without syncing — this can be advanced."
> "Capabilities should be again fully configured by us — user should not need to see them at first."
> "We can combine [Preview and Success] but we should keep the celebration confetti."

---

## Current Wizard Flow (9 steps)

```
Intro → Identity → Loading → Knowledge → EmbeddingSetup → VectorSearch → Capabilities → [MCP] → Preview → Success
```

## Target Wizard Flow (4 steps)

```
Intro → Identity → Loading → Capabilities (+optional vector toggle inline) → [MCP if configured] → Success (with summary)
```

MCP step stays conditional (only shown if user has MCP servers configured).
Progress bar will show: Start (completed) → Identity (active) → Capabilities → MCP Tools (if configured) — **4 dots maximum, 3 without MCP**, not "2" as originally stated.

---

## Change 1: Update `WizardPage` Type and `PROGRESS_PAGES`

### File: `components/character-creation/terminal-wizard.tsx`

**Note:** The `WizardPage` type at line 27 already does NOT include `"knowledge"`, `"embeddingSetup"`, `"vectorSearch"`, or `"preview"` — it was partially cleaned up. However, `PROGRESS_PAGES` at line 40 still references all of them.

**Find `PROGRESS_PAGES` array (line ~40) and replace:**
```typescript
// BEFORE
const PROGRESS_PAGES: WizardPage[] = ["identity", "knowledge", "embeddingSetup", "vectorSearch", "capabilities", "mcpTools", "preview"];

// AFTER
const PROGRESS_PAGES: WizardPage[] = ["identity", "capabilities", "mcpTools"];
//                                                                  ↑ keep mcpTools — removing it hides the progress bar on that page
```

**Find the navigation call after identity submit (line ~163) and replace:**
```typescript
// BEFORE
navigateTo("knowledge");

// AFTER
navigateTo("capabilities");
```

**Find and remove render blocks for old pages:**
```tsx
// REMOVE the KnowledgeBasePage block:
{currentPage === "knowledge" && (
  <KnowledgeBasePage
    onSubmit={handleKnowledgeSubmit}
    onBack={() => navigateTo("identity")}
  />
)}

// REMOVE the EmbeddingSetupPage block:
{currentPage === "embeddingSetup" && (
  <EmbeddingSetupPage ... />
)}

// REMOVE the VectorSearchPage block:
{currentPage === "vectorSearch" && (
  <VectorSearchPage ... />
)}

// REMOVE the PreviewPage block:
{currentPage === "preview" && (
  <PreviewPage ... />
)}
```

**Remove imports for removed pages:**
```typescript
// REMOVE these 4 imports from the import block at the top:
// KnowledgeBasePage,
// EmbeddingSetupPage,
// VectorSearchPage,
// PreviewPage,

// REMOVE this type import:
// import type { UploadedDocument } from "./terminal-pages/knowledge-base-page";
```

**Remove state variables:**
```typescript
// REMOVE from WizardState interface:
// documents: UploadedDocument[];

// REMOVE from initialState:
// documents: [],

// REMOVE unused handler functions:
// handleKnowledgeSubmit()
// handleVectorSearchSubmit()
// handleEmbeddingSetupSubmit()
// handleEmbeddingSetupSkip()
```

**Update the i18n type cast (line ~122) to remove removed page IDs:**
```typescript
// BEFORE
label: t(step.id as "intro" | "identity" | "capabilities" | "mcpTools" | "knowledge" | "embeddingSetup" | "vectorSearch" | "preview"),

// AFTER
label: t(step.id as "intro" | "identity" | "capabilities" | "mcpTools"),
```

---

## Change 2: Update WIZARD_STEPS in wizard-progress.tsx

### File: `components/ui/wizard-progress.tsx`

The `WIZARD_STEPS` array currently has 8 entries. Remove 4 of them:

```typescript
// REMOVE these 4 entries (and their now-unused icon imports):
{ id: "knowledge", label: "Knowledge", icon: <BookOpen /> },       // REMOVE
{ id: "embeddingSetup", label: "Embeddings", icon: <Database /> }, // REMOVE
{ id: "vectorSearch", label: "Folders", icon: <Database /> },       // REMOVE
{ id: "preview", label: "Preview", icon: <Eye /> },                  // REMOVE

// KEEP these 4 entries:
{ id: "intro", label: "Start", icon: <Sparkles /> },
{ id: "identity", label: "Identity", icon: <User /> },
{ id: "capabilities", label: "Capabilities", icon: <Wrench /> },
{ id: "mcpTools", label: "MCP Tools", icon: <Plug /> },
```

Also remove the now-unused lucide icon imports: `BookOpen`, `Database` (if only used for those entries), `Eye`.

---

## Change 3: Merge Preview → Directly Submit on Capabilities

### File: `components/character-creation/terminal-wizard.tsx`

The current `handleCapabilitiesSubmit` (line ~171) only navigates to preview or MCP — it does no API call. The finalization PATCH (`handleFinalizeAgent` at line ~289) is currently called from `PreviewPage.onConfirm`.

**Corrected approach: move finalization directly into the capabilities/MCP flow.**

Update `handleCapabilitiesSubmit`:
```typescript
// BEFORE:
const handleCapabilitiesSubmit = (enabledTools: string[]) => {
  setState((prev) => ({ ...prev, enabledTools }));
  if (hasMcpServers === false) {
    navigateTo("preview");   // ← remove this
  } else {
    navigateTo("mcpTools");
  }
};

// AFTER:
const handleCapabilitiesSubmit = (enabledTools: string[]) => {
  setState((prev) => ({ ...prev, enabledTools }));
  if (hasMcpServers === false) {
    // No MCP step — finalize directly
    // Call handleFinalizeAgent but we need tools from the new state
    // Since setState is async, pass tools directly:
    handleFinalizeAgentWithTools(enabledTools);
  } else {
    navigateTo("mcpTools");
  }
};
```

Create a new `handleFinalizeAgentWithTools` that accepts tools directly (to avoid async setState race):
```typescript
const handleFinalizeAgentWithTools = async (tools: string[]) => {
  if (!draftAgentId) return;
  setIsSubmitting(true);
  setError(null);
  navigateTo("loading");

  try {
    const { data, error: patchError } = await resilientPatch<{ error?: string }>(
      `/api/characters/${draftAgentId}`,
      {
        character: {
          name: state.identity.name,
          tagline: state.identity.tagline || undefined,
          status: "active",
        },
        metadata: {
          purpose: state.identity.purpose,
          enabledTools: tools,  // use passed tools, not state.enabledTools (async)
          enabledMcpServers: state.enabledMcpServers,
          enabledMcpTools: state.enabledMcpTools,
          mcpToolPreferences: state.mcpToolPreferences,
        },
      }
    );

    if (patchError) {
      throw new Error(data?.error || patchError || "Failed to create agent");
    }

    setState((prev) => ({ ...prev, createdCharacterId: draftAgentId, enabledTools: tools }));
    navigateTo("success");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Creation failed");
    navigateTo("capabilities", -1);
  } finally {
    setIsSubmitting(false);
  }
};
```

Also update `MCPToolsPage.onComplete` (currently navigates to "preview" — line ~401):
```typescript
// BEFORE:
onComplete={() => navigateTo("preview")}

// AFTER (MCP tools are already saved in handleMCPToolsSubmit — finalize here):
onComplete={() => handleFinalizeAgentWithTools(state.enabledTools)}
```

---

## Change 4: Update CapabilitiesPage Back Navigation

### File: `components/character-creation/terminal-wizard.tsx`

The back navigation for Capabilities currently routes back through the old embedding/vector pages:
```typescript
// BEFORE:
onBack={() => navigateTo(vectorDBEnabled ? "vectorSearch" : "embeddingSetup", -1)}

// AFTER:
onBack={() => navigateTo("identity", -1)}
```

The `vectorDBEnabled` state is still fetched from `/api/settings` on mount. Repurpose it to pre-populate the new inline Advanced Options toggle initial state (checked if already enabled, unchecked if not).

---

## Change 5: Add Optional Vector Search Toggle to Capabilities Page

### File: `components/character-creation/terminal-pages/capabilities-page.tsx`

Update `onSubmit` signature to pass vector config:
```typescript
// BEFORE
onSubmit: (enabledTools: string[]) => void;

// AFTER
onSubmit: (enabledTools: string[], vectorConfig?: { provider: string; model: string; apiKey?: string }) => void;
```

Add a collapsible "Advanced Options" section **below** the tool categories, before the Continue button:

```
┌──────────────────────────────────────────────────────────────┐
│  [Tools section — existing]                                  │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  ▶ Advanced Options                                          │
│                                                              │
│  [ ] Enable Vector Search                                    │
│      Allows semantic search across synced folders.           │
│      Requires an embedding model (OpenRouter or local).      │
│      ⚠ Without this, folder file-watching still works but   │
│        semantic search won't be available.                   │
│                                                              │
│  (When checkbox is checked, expand inline:)                  │
│  Embedding Provider: [OpenRouter ▼]                         │
│  Embedding Model:    [text-embedding-3-small ▼]             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Initial state: `vectorSearchEnabled = vectorDBEnabled` (from settings fetch in wizard)
- When checked: show provider/model dropdowns (reuse logic from `EmbeddingSetupPage`)
- When wizard finalizes with `vectorSearchEnabled === true`: call `resilientPut("/api/settings", { embeddingProvider, embeddingModel, vectorDBEnabled: true })` **before** the character PATCH, because `vectorSearch` tool's `isVectorDBEnabled()` reads settings at request time

---

## Change 6: Extend SuccessPage with Agent Summary

### File: `components/character-creation/terminal-pages/success-page.tsx`

Extend props to accept agent config for display:

```typescript
// New props (data comes from wizard state, not API response):
interface SuccessPageProps {
  characterId: string;
  characterName: string;
  tagline?: string;          // ← new
  enabledTools: string[];    // ← new
  onConfigureAnother?: () => void;  // ← remove this (meeting: not necessary)
  onGoHome: () => void;
}
```

Add agent summary block above action buttons:

```
┌──────────────────────────────────────────────────────────┐
│                    ✓ Agent Created!                      │
│                   🎉 [confetti stays]                    │
│                                                          │
│  ResearchBot                                             │
│  "Your paper discovery engine"                           │
│                                                          │
│  Tools enabled (12):                                     │
│  [webSearch] [readFile] [executeCommand] [memorize]      │
│  [runSkill] [scheduleTask] +7 more                       │
│                                                          │
│  ┌──────────────────┐  ┌──────────────┐                  │
│  │  Start Chatting  │  │  My Agents   │                  │
│  └──────────────────┘  └──────────────┘                  │
└──────────────────────────────────────────────────────────┘
```

Pass from wizard:
```tsx
{currentPage === "success" && state.createdCharacterId && (
  <SuccessPage
    characterId={state.createdCharacterId}
    characterName={state.identity.name}
    tagline={state.identity.tagline}
    enabledTools={state.enabledTools}
  />
)}
```

---

## i18n Cleanup Required

Remove these now-orphaned keys from **both** `locales/en.json` and `locales/tr.json`:
- `characterCreation.knowledgeBase.*` (all keys)
- `characterCreation.embeddingSetup.*` (all keys)
- `characterCreation.vectorSearchPage.*` (all keys)
- `characterCreation.preview.*` (all keys)
- `characterCreation.progress.knowledge`
- `characterCreation.progress.embeddingSetup`
- `characterCreation.progress.vectorSearch`
- `characterCreation.progress.preview`
- `characterCreation.success.configureAnother` (removed button)

New keys to add for the SuccessPage summary and the Advanced Options toggle (at minimum):
- `characterCreation.success.toolsEnabled` — "Tools enabled ({count}):"
- `characterCreation.capabilities.advancedOptions` — "Advanced Options"
- `characterCreation.capabilities.enableVectorSearch` — "Enable Vector Search"
- `characterCreation.capabilities.vectorSearchHint` — "Allows semantic search across synced folders."

---

## Resulting Wizard Flow (Visual)

```
/create-character

┌─────────────────────────────────────────────────────────┐
│  INTRO                                                  │
│  ○──────────○  (progress: Start + Identity shown)      │
│                                                         │
│  [Create Agent (Guided)]                                │
│  [⚡ Quick Create — describe in one sentence]            │
│  [Browse Templates]                                     │
└─────────────────────────────────────────────────────────┘
          │
          ▼ (Guided path)
┌─────────────────────────────────────────────────────────┐
│  IDENTITY                                               │
│  ●──────────○ ──────────○                               │
│  Name:    [________________]                            │
│  Tagline: [________________]                            │
│  Purpose: [________________                ]            │
│                          [Continue →]                   │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  LOADING                                                │
│  Creating agent... ████████░░░                          │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  CAPABILITIES                                           │
│  ○──────────●──────────○                                │
│                                                         │
│  All tools pre-selected. Adjust if needed:              │
│  ▼ Knowledge  ✓docsSearch ✓readFile ✓editFile          │
│  ▼ Search     ✓webSearch                                │
│  ▼ Utility    ✓executeCommand ✓memorize ✓runSkill       │
│  ...                                                    │
│                                                         │
│  ▶ Advanced Options                                     │
│    [ ] Enable Vector Search                             │
│                                                         │
│         [← Back]     [Confirm & Create →]               │
└─────────────────────────────────────────────────────────┘
          │ (direct submit, no preview)
          ▼
┌─────────────────────────────────────────────────────────┐
│  SUCCESS 🎉                                             │
│                                                         │
│  ✓ ResearchBot created                                  │
│  "Your paper discovery engine"                          │
│  Tools: webSearch, readFile, memorize +9 more           │
│                                                         │
│  [Start Chatting →]    [My Agents]                      │
└─────────────────────────────────────────────────────────┘
```

---

## Files Summary

| File | Action |
|------|--------|
| `terminal-wizard.tsx` | Remove knowledge/embedding/vectorSearch/preview pages; update PROGRESS_PAGES; fix nav flow; add `handleFinalizeAgentWithTools`; update back nav |
| `capabilities-page.tsx` | Update `onSubmit` signature; add collapsible Advanced Options with vector search toggle |
| `wizard-progress.tsx` | Remove 4 entries (knowledge, embeddingSetup, vectorSearch, preview); remove unused icon imports |
| `success-page.tsx` | Accept + display agent config summary (`tagline`, `enabledTools`); remove "Configure Another" |
| `terminal-pages/knowledge-base-page.tsx` | No longer imported by wizard — can be deleted |
| `terminal-pages/embedding-setup-page.tsx` | No longer imported by wizard — can be deleted |
| `terminal-pages/vector-search-page.tsx` | No longer imported by wizard — can be deleted |
| `terminal-pages/preview-page.tsx` | No longer imported by wizard — can be deleted |

---

## Verification Steps

1. Navigate to `/create-character` → progress bar shows Start + Identity + Capabilities (+ MCP if configured)
2. No "Knowledge" step appears anywhere
3. Capabilities page loads with all tools pre-checked (after doc 03 lands)
4. Advanced Options section exists, collapsed by default
5. Toggle "Enable Vector Search" → provider/model pickers appear inline
6. Click "Confirm & Create" → goes directly to Loading then Success (no Preview page)
7. Success page shows agent name, tagline, and key tools with count
8. "Start Chatting" navigates to chat
9. MCPToolsPage "Complete" → finalizes and navigates to Success (not Preview)

---

## Gap Analysis & Missing Considerations

> The following were identified by codebase research on 2026-02-19 and have been incorporated into the plan sections above. Kept here for historical reference.

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | WizardPage already partially cleaned; PROGRESS_PAGES still has old entries | Plan updated — only PROGRESS_PAGES needs fixing |
| 2 | `finalizeAgentCreation` doesn't exist — only `handleFinalizeAgent` | Replaced with `handleFinalizeAgentWithTools` accepting tools directly |
| 3 | MCPToolsPage `onComplete` still navigates to "preview" | Updated to call `handleFinalizeAgentWithTools(state.enabledTools)` |
| 4 | `handleStepClick` casts any string to WizardPage — stale WIZARD_STEPS entries cause broken nav | WIZARD_STEPS reduced to 4 entries in Change 2 |
| 5 | WIZARD_STEPS has 8 entries; plan only removed 1 | Changed to remove 4 entries |
| 6 | `t(step.id as ...)` cast must be narrowed | Updated cast in Change 1 |
| 7 | `UploadedDocument` type import from knowledge-base-page will break | Remove import + remove `documents` from WizardState |
| 10 | `CapabilitiesPage.onSubmit` signature must change | Change 5 updates signature |
| 12 | PROGRESS_PAGES must include mcpTools | `"mcpTools"` added to PROGRESS_PAGES |
| 13 | SuccessPage data comes from wizard state, not API response | Confirmed — pass from state |
| 14 | Many i18n keys become orphaned | Full cleanup list added |
| 16 | Back navigation currently routes via old pages | Changed to simple `navigateTo("identity", -1)` |
| 17 | Embedding settings PUT needed before PATCH | Addressed in Change 5 |
| 18 | "2 progress dots" statement is wrong — actually 3-4 | Corrected in target flow description |
