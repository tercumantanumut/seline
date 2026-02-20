# 04 — Agent Card Cleanup (Replace Icon Button Row with Overflow Menu)

## Problem
Each agent card on the home page has 7 text-and-icon buttons squished into the bottom row:
Edit | Tools count | Folders | MCP Tools | Plugins | Dashboard | Delete

This is visually noisy, hard to understand at a glance, and overwhelming for new users.

**Meeting quote:**
> "Here's the agents list — we can talk about how we're going to do here — there is so much clutter: edits, tool enabling, folders, MCP tools, configure plugin, dashboard, delete — however all these are kind of necessary to have the advanced customization."
> "It should be put a bit further behind in a more unionized compact form."

---

## Current Card Layout

```
┌──────────────────────────────────────────────────────────┐
│  🟢  ResearchBot                                         │ ← active dot (on avatar)
│      "Your paper discovery engine"                       │
│                                                          │
│  [webSearch] [readFile] [memorize] +9                    │ ← tool badges
│                                                          │
│  [Continue Chat ▶]  [New Chat +]                         │ ← primary buttons
│                                                          │
│  ✏ Edit  🔧 3 tools  🗄 Folders  🔌 MCP  🔌 Plugins  📊 Dashboard  🗑 Delete  │ ← 7 cluttered buttons
└──────────────────────────────────────────────────────────┘
```

Note: The current bottom row uses **text + icon buttons** (not icon-only), from a mix of `@phosphor-icons/react` (`Wrench`, `Database`, `Pencil`, `Trash`, `Plug`, `ChartBar`) and `lucide-react` (`User`, `MessageCircle`, `PlusCircle`).

---

## Target Card Layout

```
┌──────────────────────────────────────────────────────────┐
│  🟢  ResearchBot                               [•••]     │ ← overflow menu top-right of card
│      "Your paper discovery engine"                       │
│                                                          │
│  [webSearch] [readFile] [memorize] +9                    │
│                                                          │
│  [Continue Chat ▶]              [New Chat +]             │
└──────────────────────────────────────────────────────────┘
```

The `•••` menu opens a dropdown with all 8 management actions:

```
┌─────────────────────┐
│ ✏  Edit Info        │
│ 🔧  Manage Tools    │
│ 🗄  Sync Folders    │
│ 🔌  MCP Tools       │
│ 🧩  Plugins         │
│ 📊  Dashboard       │  ← was missing from original plan
│ ─────────────────   │
│ ⧉  Duplicate        │
│ ─────────────────   │
│ 🗑  Delete          │  ← red text
└─────────────────────┘
```

---

## Implementation

### File: `components/character-picker.tsx`

#### Step 1: Add required imports

```tsx
// Add to lucide-react import line:
import { Plus, Loader2, ..., MoreHorizontal, Copy, Puzzle } from "lucide-react";
//                                              ↑ NOT MoreHorizontalIcon  ↑ NOT PuzzleIcon
//                                                                           Puzzle is the correct lucide name

// DropdownMenu already imported or add:
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

#### Step 2: Add `relative group` to the card wrapper

`AnimatedCard` does NOT have `relative` or `group` by default. Both are required:

```tsx
// BEFORE (line ~1657):
<AnimatedCard key={character.id} data-animate-card hoverLift className="bg-terminal-cream">

// AFTER:
<AnimatedCard key={character.id} data-animate-card hoverLift className="bg-terminal-cream relative group">
//                                                                                           ↑↑ both required
```

#### Step 3: Add the `•••` trigger button to the card header area

Place inside the card's `<div className="p-4 pb-2">` wrapper, using `absolute top-2 right-2`:

```tsx
{/* ••• overflow menu trigger — fades in on hover (touch: always visible at 40% opacity) */}
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      className="absolute top-2 right-2 p-1 rounded opacity-40 group-hover:opacity-100 transition-opacity hover:bg-terminal-dark/10 focus:opacity-100 focus:outline-none"
      onClick={(e) => e.stopPropagation()}
      aria-label="Agent options"
    >
      <MoreHorizontal className="w-4 h-4 text-terminal-muted" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent
    align="end"
    className="font-mono text-sm"
    onClick={(e) => e.stopPropagation()}
    // ↑ IMPORTANT: stopPropagation on content too, not just trigger
  >
    <DropdownMenuItem onSelect={() => openIdentityEditor(character)}>
      {/* Use Pencil from @phosphor-icons/react — already imported */}
      <Pencil className="w-3.5 h-3.5 mr-2" />
      Edit Info
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => openToolEditor(character)}>
      <Wrench className="w-3.5 h-3.5 mr-2" />
      Manage Tools
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => openFolderManager(character)}>
      <DatabaseIcon className="w-3.5 h-3.5 mr-2" />
      Sync Folders
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => openMcpToolEditor(character)}>
      {/* Function name is openMcpToolEditor — NOT openMcpEditor */}
      <Plug className="w-3.5 h-3.5 mr-2" />
      MCP Tools
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => openPluginEditor(character)}>
      {/* Both MCP and Plugins used Plug icon; use Puzzle from lucide for Plugins */}
      <Puzzle className="w-3.5 h-3.5 mr-2" />
      Plugins
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => router.push("/dashboard")}>
      {/* Dashboard button was in the original row but MISSING from original plan */}
      <BarChart2 className="w-3.5 h-3.5 mr-2" />
      Dashboard
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={() => handleDuplicate(character.id)}>
      {/* Requires doc 05 implementation — stub until then */}
      <Copy className="w-3.5 h-3.5 mr-2" />
      {/* Copy from lucide-react — NOT CopyIcon */}
      Duplicate
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      onSelect={() => openDeleteDialog(character)}
      // Function is openDeleteDialog(character: CharacterSummary) — NOT handleDelete(char.id)
      className="text-red-600 focus:text-red-600"
    >
      <Trash2 className="w-3.5 h-3.5 mr-2" />
      Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Key correctness notes:**
- `onSelect` not `onClick` on `DropdownMenuItem` (Radix-idiomatic; auto-closes menu; better keyboard/pointer compat)
- `stopPropagation` on **both** trigger button AND `DropdownMenuContent` to prevent card-level click handlers
- `MoreHorizontal` not `MoreHorizontalIcon` (lucide has no `Icon` suffix)
- `Puzzle` not `PuzzleIcon` (lucide, no `Icon` suffix)
- `Copy` not `CopyIcon` (lucide, no `Icon` suffix)
- `openMcpToolEditor(character)` not `openMcpEditor(char)` — wrong name was never defined
- `openDeleteDialog(character)` not `handleDelete(char.id)` — takes full object, opens AlertDialog
- `handleDuplicate` does not exist yet — stub with `toast("Coming soon")` until doc 05 lands

#### Step 4: Stub `handleDuplicate` until doc 05 is implemented

```typescript
const handleDuplicate = (characterId: string) => {
  toast("Duplicate feature coming soon");
  // TODO: implement after doc 05 API endpoint is built
};
```

#### Step 5: Remove the old bottom button row

Find the block containing all the management buttons (lines ~1729-1793 in character-picker.tsx) and remove the entire `<div className="flex items-center gap-1">` wrapping the 7 buttons.

---

## Active Session Indicator

The green pulsing dot is `absolute -top-1 -right-1` relative to the Avatar's `relative` wrapper **inside the card**, not at the card's corner. There is **zero overlap** with the `•••` button which is `absolute top-2 right-2` relative to the card root. No repositioning needed.

---

## Mobile / Touch Device Note

On touch screens, `:hover` states are unreliable. Instead of fully hiding (`opacity-0`) the `•••` button, use a reduced-but-visible default:
```
opacity-40 group-hover:opacity-100 focus:opacity-100
```
This ensures the button is always visible on touch devices (at 40% opacity) and becomes fully visible on desktop hover/focus. The existing session-item dropdown uses `opacity-0 group-hover:opacity-100` which is invisible on mobile — this approach is intentionally different.

---

## `AgentCardInWorkflow` Also Needs Updating

The `AgentCardInWorkflow` component (lines 212–380 in `character-picker.tsx`) has its own copy of the action row (lines ~322-358) with the same buttons. The plan must also update this component to use the `•••` menu pattern. Otherwise workflow-member agent cards will still show the old text-button row — an inconsistent UI.

Add `relative group` to its `AnimatedCard` wrapper and apply the same `DropdownMenu` structure.

---

## Tool Count Display

After removing the wrench button row, the total enabled tool count disappears (it was shown as e.g. "3 tools" on the wrench button). The tool badge row above still shows the top 3 tool names + "+N more" overflow count. This is considered acceptable — the decision is explicit.

---

## Verification Steps

1. Home page → agent cards show NO bottom button row
2. `•••` button visible at reduced opacity (always, on all devices); fully opaque on hover
3. Click `•••` → dropdown with 8 items (Edit, Tools, Folders, MCP, Plugins, Dashboard, Duplicate, Delete)
4. "Edit Info" → opens identity editor dialog ✓
5. "Manage Tools" → opens tool editor dialog ✓
6. "Sync Folders" → opens folder sync manager ✓
7. "MCP Tools" → opens MCP tool editor dialog ✓
8. "Plugins" → opens plugin editor dialog ✓
9. "Dashboard" → navigates to /dashboard ✓
10. "Duplicate" → shows "Coming soon" toast (stub until doc 05)
11. "Delete" shows in red → opens AlertDialog confirmation ✓
12. Active session green dot still visible, no overlap with `•••`
13. `AgentCardInWorkflow` also has the `•••` menu

---

## Gap Analysis & Missing Considerations

> The following were identified by codebase research on 2026-02-19 and have been incorporated into the plan above. Kept here for historical reference.

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Current row has 7 text+icon buttons, not 5 icon-only | Plan updated to reflect reality |
| 2 | `MoreHorizontalIcon` → use `MoreHorizontal` | Corrected throughout |
| 3 | `handleDelete(char.id)` → use `openDeleteDialog(character)` | Corrected |
| 4 | `openMcpEditor` → use `openMcpToolEditor` | Corrected |
| 5 | `handleDuplicate` doesn't exist | Stub added; doc 05 tracks the real implementation |
| 6 | `PuzzleIcon` doesn't exist → use `Puzzle` | Corrected |
| 7 | `CopyIcon` doesn't exist → use `Copy` | Corrected |
| 8 | Dashboard button omitted from plan | Added as menu item |
| 9 | `AnimatedCard` needs both `relative` and `group` | Both added |
| 10 | `onSelect` not `onClick` on DropdownMenuItems | Corrected |
| 11 | `stopPropagation` needed on content too | Added to DropdownMenuContent |
| 12 | AgentCardInWorkflow not mentioned | Added as explicit task |
| 14 | Mobile: `opacity-0 group-hover` invisible on touch | Changed to `opacity-40` always-visible approach |
