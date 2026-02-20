# 06 — Workflow UI: Section Headers & Hierarchy Clarity

## Problem
The home page mixes standalone agents and workflow-grouped agents in the same area with no clear visual separation. The relationship between them is confusing, and there is no easy way to add a standalone agent to an existing workflow.

**Meeting quotes:**
> "We need to create a separation between this but still protect the ease of accessibility and visibility."
> "User when they land on the character picker should see both of these modes nicely but be able to switch them nicely."
> "What we need to make it better is the cluttering and the layout and unique visual touch that will separate us from being basic."

---

## Important Distinction: Workflows vs Workspaces

These are two completely separate systems — do not conflate them:

| | Workflows | Workspaces (WorkspaceDashboard) |
|---|---|---|
| State variable | `workflowGroups` | Inside `workspace-dashboard.tsx` |
| API | `GET /api/workflows?status=all` | `GET /api/workspaces` |
| What it is | Multi-agent orchestration groups | Active git worktrees (Developer Workspace feature) |
| Visibility | Always | Only when `devWorkspaceEnabled === true` |

`WorkspaceDashboard` must remain above the "Workflows" section, exactly where it is (lines 1341-1350). It is a separate feature gated by `devWorkspaceEnabled` and should not be reorganized under "Workflows".

---

## Current Layout

```
[WorkspaceDashboard]                   ← only when devWorkspaceEnabled
[h3 "Workflows" — no divider, buried]  ← partially exists already
[WorkflowCard: MainWorkflow]
  └── AgentA, AgentB
[WorkflowCard: ResearchWorkflow]
  └── AgentC
[Create Agent card] [Standalone agents...]  ← no "Agents" header
```

---

## Target Layout

```
[WorkspaceDashboard]                   ← unchanged

── Workflows ─────────────────────────── [+ New Workflow]

[WorkflowCard: MainWorkflow] (collapsed by default)
[WorkflowCard: ResearchWorkflow] (collapsed by default)

── Agents ──────────── [🔍 Search agents & workflows...]

[Create Agent card] [Standalone AgentD] [Standalone AgentE]
```

---

## Implementation

### File: `components/character-picker.tsx`

#### Step 1: Upgrade existing Workflows section header (line ~1369)

A `<h3>` heading already exists at line 1369 inside `{filteredWorkflowGroups.length > 0 && (...)}`. Convert it to the full flex-row layout with divider and inline "New Workflow" button:

```tsx
// BEFORE (line ~1369 — inside the existing workflows guard):
<h3 className="font-mono text-sm font-medium text-terminal-muted uppercase tracking-wider">
  {t("workflows.sectionTitle")}
</h3>

// AFTER — upgrade to full flex-row with divider and inline button:
<div className="flex items-center gap-3 mb-4">
  <h2 className="font-mono text-xs font-semibold tracking-widest text-terminal-muted uppercase whitespace-nowrap">
    {t("workflows.sectionTitle")}
  </h2>
  <div className="flex-1 h-px bg-terminal-border/40" />
  <button
    className="text-xs font-mono text-terminal-muted hover:text-terminal-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    onClick={() => setWorkflowCreatorOpen(true)}
    // ← "setWorkflowCreatorOpen" NOT "setShowCreateWorkflow" (which doesn't exist)
    disabled={allStandaloneCharacters.length === 0}
    // ↑ disable when no standalone agents to add — opening the dialog would show empty dropdown
    title={allStandaloneCharacters.length === 0 ? "Create a standalone agent first" : undefined}
  >
    + New Workflow
  </button>
</div>
```

#### Step 2: Show Workflows section even when 0 workflows exist

Currently the entire section is hidden when `filteredWorkflowGroups.length === 0`. Add an empty state so the section is discoverable:

```tsx
{/* Always show the Workflows section once there's at least one agent */}
{standaloneCharacters.length > 0 || workflowGroups.length > 0 ? (
  <>
    {/* Section header — always visible */}
    <div className="flex items-center gap-3 mb-4">
      ...same header as above...
    </div>

    {/* Workflow cards — only when they exist */}
    {filteredWorkflowGroups.length > 0 ? (
      filteredWorkflowGroups.map((wf) => (
        ...existing workflow card render...
      ))
    ) : (
      <p className="font-mono text-xs text-terminal-muted mb-6">
        No workflows yet. Create your first multi-agent workflow above.
      </p>
    )}
  </>
) : null}
```

#### Step 3: Remove the old standalone "Create Workflow" button block

The old button at lines 1352-1364 (guarded by `allStandaloneCharacters.length > 0`) is now replaced by the inline button in the section header. Remove the standalone button block.

#### Step 4: Add "Agents" section header

Before the agent card grid (the `<div ref={gridRef} ...>` at line ~1621):

```tsx
{/* Agents section header */}
<div className="flex items-center gap-3 mb-4 mt-6">
  <h2 className="font-mono text-xs font-semibold tracking-widest text-terminal-muted uppercase whitespace-nowrap">
    {/* Add i18n key: t("agents.sectionTitle") → "Agents" */}
    {t("agents.sectionTitle")}
  </h2>
  <div className="flex-1 h-px bg-terminal-border/40" />
</div>
```

---

## Search Bar Positioning

**Do NOT move the search bar** into the Agents section header. The current `searchQuery` state filters BOTH standalone agents AND workflows. Moving it visually under "Agents" would confuse users trying to search for a workflow by name.

Options (pick one):
1. **Keep in current position** above both sections — simplest, no risk
2. **Rename the label** to `"Search agents & workflows..."` to accurately reflect its scope
3. **Add two separate search inputs** (one per section) with separate state — most complex

Recommended: Option 2 (rename label only, keep position).

---

## Replace `confirm()` Dialogs with AlertDialog

Two destructive workflow actions currently use browser `confirm()` — inconsistent with the rest of the UI which uses Shadcn `<AlertDialog>`:
- `removeSubagentFromWorkflow` (line ~974): `if (!confirm("Remove this sub-agent...")) return`
- `deleteWorkflowGroup` (line ~985): `if (!confirm("Delete this workflow group?...")) return`

Replace both with `<AlertDialog>` components consistent with how agent deletion is handled. This is part of the "unique visual touch" polish.

---

## Workflow Card Visual Notes

Status color coding already fully implemented at lines 1377-1382:
```ts
const statusColor =
  wf.status === "active" ? "bg-green-100 text-green-700 border-green-200" :
  wf.status === "paused" ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                           "bg-gray-100 text-gray-500 border-gray-200";
```
This renders as a `<Badge>` — no work needed. Only missing piece: dynamic border color on the `<Card>` element itself (currently always `border-terminal-border`).

Collapse by default: already implemented — `expandedWorkflows` initializes as `new Set()`. The one auto-expand heuristic (single workflow auto-expands) at lines 873-876 should be preserved.

Avatar overlapping circles: Use `<Avatar>` / `<AvatarFallback>` components, since many agents have no image and rely on initials fallback. Overlap via negative margin: `className="-ml-2 first:ml-0"`.

---

## Deleted Initiator Agent Handling

Schema: `ON DELETE CASCADE` on `agentWorkflows.initiatorId` — if the initiator is deleted, the entire workflow row is deleted. No orphaned-workflow state in DB.

UI gap: if a workflow is fetched and the initiator is then deleted before re-fetch, `initiator` computed at line 1374 will be `undefined`. The "Run" and "Share Folder" buttons both check `if (initiator)` and silently do nothing. Add a placeholder:
```tsx
{!initiator && (
  <Badge variant="destructive">Agent deleted</Badge>
)}
```

---

## i18n Keys Needed

Add to both `locales/en.json` and `locales/tr.json`:
```json
"agents": {
  "sectionTitle": "Agents"
}
```

The `workflows.sectionTitle` key already exists. The "+ New Workflow" button text can be a hardcoded string or a new key `workflows.newWorkflow`.

---

## Full Home Page Layout (ASCII Wireframe)

```
┌──────────────────────────────────────────────────────────────────┐
│  [WorkspaceDashboard — active git worktrees]                     │
│  (only shown if devWorkspaceEnabled = true)                      │
└──────────────────────────────────────────────────────────────────┘

── Workflows ──────────────────────────── [+ New Workflow]

┌──────────────────────────────────────────────────────────────────┐
│  ▶  MainWorkflow    🟢 active    [AgentA] [AgentB]   [Run]       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  ▶  ResearchWorkflow  🟢 active  [AgentC]            [Run]       │
└──────────────────────────────────────────────────────────────────┘

── Agents ──────────── [🔍 Search agents & workflows...]

┌──────────┐  ┌──────────────────────────┐  ┌──────────────────┐
│ + Create │  │ 🟢 ResearchBot    [•••]  │  │ DataBot   [•••]  │
│ New Agent│  │ "Paper discovery engine" │  │ "Analytics"      │
│          │  │ [webSearch][readFile]+9  │  │ [...]            │
│          │  │ [Continue Chat][New Chat]│  │ [...]            │
└──────────┘  └──────────────────────────┘  └──────────────────┘
```

---

## Verification Steps

1. Home page → WorkspaceDashboard (if enabled) appears above Workflows section
2. Workflows render under "── Workflows ──" section header with divider
3. "+ New Workflow" button appears inline in the Workflows header
4. "+ New Workflow" disabled when all agents are in workflows (no standalone agents left)
5. Zero workflows → section header visible with empty-state message
6. Standalone agents render under "── Agents ──" section header with divider
7. Search bar visible above both sections (not moved to Agents only)
8. `confirm()` dialogs replaced with `<AlertDialog>` for workflow destructive actions

---

## Gap Analysis & Missing Considerations

> The following were identified by codebase research on 2026-02-19 and have been incorporated into the plan above. Kept here for historical reference.

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | `setShowCreateWorkflow` doesn't exist | Changed to `setWorkflowCreatorOpen` |
| 2 | Workflows section header already partially exists | Plan updated to upgrade it, not create from scratch |
| 3 | "New Workflow" button guard broken when section moves | Button disabled when `allStandaloneCharacters.length === 0` |
| 4 | Workflows vs Workspaces conflated | Section added distinguishing the two systems |
| 5 | Search bar filters both agents AND workflows | Keep in current position; rename label to reflect scope |
| 6 | Collapse-by-default already implemented | Noted; preserve auto-expand heuristic for single workflow |
| 8 | `workflowCreatorOpen` dialog needs standalone agents | Button disabled when `allStandaloneCharacters.length === 0` |
| 9 | One-workflow-per-agent constraint | Agent-already-in-workflow 400 errors must be handled in "Add to Workflow" UI |
| 10 | Deleted initiator leaves silent UI bug | Add `{!initiator && <Badge variant="destructive">Agent deleted</Badge>}` |
| 11 | Status color coding already implemented | No CSS work needed; only card border color is missing |
| 14 | `confirm()` dialogs for destructive actions | Replace with `<AlertDialog>` |
