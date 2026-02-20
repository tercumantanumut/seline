# 05 — Agent Duplicate / Copy Feature

## Problem
There is no way to copy an agent. Users want to assign the same agent to multiple workflow trees, or create a variation of an existing agent without rebuilding from scratch.

**Meeting quote:**
> "You want to create copies of the agents you already have and quickly assign them to new work trees."
> "Of course the agents should be copyable and can be present in different work trees. Currently I think there is no way of doing that."

---

## Current State
- No duplicate endpoint exists
- No duplicate UI action exists
- The only creation paths are: new wizard, quick-create, template

---

## What Gets Copied

| Field | Copied? | Notes |
|-------|---------|-------|
| `name` | ✓ | Append " (copy)" |
| `tagline` | ✓ | Exact copy |
| `metadata` (all) | ✓ | Copies purpose, enabledTools, systemPrompt, mcpServers/Tools, etc. — all in one JSON blob |
| `enabledPlugins` (metadata cache) | ✓ | Copied via metadata; authoritative copy via agent_plugins table |
| `syncFolders` | ✓ (paths only) | Copy folder paths with `status: "pending"` — will auto-index |
| `character_images` | ✓ | Copy image row metadata (points to same file on disk) |
| `agent_plugins` rows | ✓ | Copy plugin assignments from join table |
| `memories` | ✗ | Fresh start for memory |
| `is_default` | ✗ | Copy is never the default |
| `sessions / chat history` | ✗ | Not copied |
| workflow linkage | ✗ | `workflowId`, `workflowRole`, `inheritedResources` cleared — copy is standalone |
| `inheritedFromWorkflowId` on folders | ✗ | Set to null — copy's folders are standalone |

---

## API Implementation

### New File: `app/api/characters/[id]/duplicate/route.ts`

**Critical corrections from gap analysis — read carefully:**
- Use `sqlite-character-schema.ts` imports (not shim files)
- Use `requireAuth` + `getOrCreateLocalUser` pattern (NOT `getLocalUser()`)
- All agent config is in the `metadata` JSON column — no individual columns for `purpose`, `enabledTools`, etc.
- `agentSyncFolders` uses camelCase drizzle field names: `recursive` (not `is_recursive`), `includeExtensions` (not `file_extensions`)
- Next.js 15 requires `await params` (params is a Promise)
- Must check ownership before duplicating (security)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser, loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import {
  characters,
  agentSyncFolders,
  characterImages,
} from "@/lib/db/sqlite-character-schema";
import { agentPlugins } from "@/lib/db/sqlite-plugins-schema";
import { eq, and } from "drizzle-orm";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    // Auth — same pattern as every other route in this codebase:
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;  // Next.js 15: params is a Promise

    // Fetch the source character
    const [source] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1);

    if (!source) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Ownership check — same as GET/PATCH/DELETE in app/api/characters/[id]/route.ts
    if (source.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Create the duplicate character
    // All config is in the "metadata" JSON column — copy it wholesale,
    // then clear workflow-linkage fields from the copy's metadata
    const sourceMetadata = (source.metadata as Record<string, unknown>) || {};
    const duplicateMetadata = {
      ...sourceMetadata,
      // Clear workflow linkage so the copy is a standalone agent
      workflowId: undefined,
      workflowRole: undefined,
      inheritedResources: undefined,
    };

    const [newChar] = await db
      .insert(characters)
      .values({
        // drizzle uses camelCase field names (mapped to snake_case SQL columns internally):
        userId: dbUser.id,
        name: `${source.name} (copy)`,
        displayName: source.displayName ? `${source.displayName} (copy)` : null,
        tagline: source.tagline,
        status: "active",
        isDefault: false,
        metadata: duplicateMetadata,
      })
      .returning();

    const newId = newChar.id;

    // Copy sync folder paths (not the indexed data)
    const sourceFolders = await db
      .select()
      .from(agentSyncFolders)
      .where(eq(agentSyncFolders.characterId, id));

    if (sourceFolders.length > 0) {
      await db.insert(agentSyncFolders).values(
        sourceFolders.map((f) => ({
          // drizzle camelCase field names (NOT snake_case SQL column names):
          characterId: newId,
          userId: dbUser.id,
          folderPath: f.folderPath,
          displayName: f.displayName,
          recursive: f.recursive,           // ← NOT "is_recursive"
          includeExtensions: f.includeExtensions,  // ← NOT "file_extensions"
          excludePatterns: f.excludePatterns,
          isPrimary: f.isPrimary,
          syncMode: f.syncMode,
          chunkPreset: f.chunkPreset,
          indexingMode: f.indexingMode,
          syncCadenceMinutes: f.syncCadenceMinutes,
          fileTypeFilters: f.fileTypeFilters,
          maxFileSizeBytes: f.maxFileSizeBytes,
          chunkSizeOverride: f.chunkSizeOverride,
          chunkOverlapOverride: f.chunkOverlapOverride,
          reindexPolicy: f.reindexPolicy,
          status: "pending",  // reset — will auto-index on next background sync cycle
          // Explicitly null out workflow provenance for the copy:
          inheritedFromWorkflowId: null,
          inheritedFromAgentId: null,
        }))
      );
    }

    // Copy plugin assignments from the agent_plugins join table
    // (the metadata.enabledPlugins cache is already copied above, but the
    //  authoritative data lives in agent_plugins rows)
    const sourcePlugins = await db
      .select()
      .from(agentPlugins)
      .where(and(eq(agentPlugins.agentId, id), eq(agentPlugins.enabled, true)));

    if (sourcePlugins.length > 0) {
      await db.insert(agentPlugins).values(
        sourcePlugins.map((p) => ({
          agentId: newId,
          pluginId: p.pluginId,
          workflowId: null,  // copy is standalone, not workflow-inherited
          enabled: true,
        }))
      );
    }

    // Copy avatar/character images (metadata row only — image files stay on disk)
    const sourceImages = await db
      .select()
      .from(characterImages)
      .where(eq(characterImages.characterId, id));

    if (sourceImages.length > 0) {
      await db.insert(characterImages).values(
        sourceImages.map((img) => ({
          characterId: newId,
          localPath: img.localPath,
          url: img.url,
          isPrimary: img.isPrimary,
          imageType: img.imageType,
          imagePrompt: img.imagePrompt,
          imageSeed: img.imageSeed,
        }))
      );
    }

    return NextResponse.json({ character: newChar }, { status: 201 });
  } catch (error) {
    console.error("[Duplicate Agent] Error:", error);
    return NextResponse.json({ error: "Failed to duplicate agent" }, { status: 500 });
  }
}
```

---

## UI Implementation

### File: `components/character-picker.tsx`

Replace the stub `handleDuplicate` from doc 04 with the real implementation:

```typescript
const handleDuplicate = async (characterId: string) => {
  try {
    // Use resilientPost (not resilientFetch with method:"POST")
    // retries: 0 to prevent duplicate creation on retry
    const { data, error } = await resilientPost<{ character: { id: string } }>(
      `/api/characters/${characterId}/duplicate`,
      {},
      { retries: 0 }
    );
    if (error || !data?.character) throw new Error(error || "Unknown error");

    // loadCharacters() — NOT refetchCharacters() (doesn't exist)
    await loadCharacters();

    // sonner toast API: toast("msg") not toast({ description: "msg" })
    toast.success("Agent duplicated");
  } catch (err) {
    toast.error("Failed to duplicate agent");
  }
};
```

The "Duplicate" menu item in the `•••` dropdown (from doc 04) calls this handler:
```tsx
<DropdownMenuItem onSelect={() => handleDuplicate(character.id)}>
  <Copy className="w-3.5 h-3.5 mr-2" />
  Duplicate
</DropdownMenuItem>
```

---

## Important: Auto-Reindexing on Folder Copy

Setting folder `status: "pending"` means the next call to `syncStaleFolders()` (which runs on startup and on a timer) will pick up all copied folders and begin indexing. If the source agent had many large sync folders, all will index simultaneously — potentially hitting EMFILE limits on macOS (see project MEMORY.md).

**Decision point:** Accept auto-reindexing (consistent with any newly-added folder) OR set `status: "paused"` and require the user to manually trigger sync. The implementation above uses `"pending"` (auto-reindex). Change to `"paused"` if EMFILE concerns outweigh convenience.

---

## Duplicate Name Deduplication

There is no `UNIQUE` constraint on `(userId, name)` in the characters table. Repeated duplications produce "Agent (copy)", "Agent (copy) (copy)", etc. To avoid accumulation, strip an existing " (copy)" suffix before re-appending:

```typescript
const baseName = source.name.replace(/ \(copy\)$/, "");
const dupName = `${baseName} (copy)`;
```

---

## "Add to Workflow" Quick Action

Beyond simple duplication, the `•••` menu for standalone agents should also offer "Add to Workflow →":

```
[•••] menu for standalone agent:
  ✏ Edit Info
  ...
  ─────────────
  ⧉  Duplicate
  ＋  Add to Workflow...  ← opens select dialog
  ─────────────
  🗑  Delete
```

**API for "Add to Workflow":**

The workflow PATCH endpoint accepts a discriminated union. The action to add an agent is:
```typescript
// PATCH /api/workflows/{workflowId}
{
  action: "addSubagent",   // ← NOT adding to an "agents array"
  agentId: string,
  syncFolders: boolean (optional)
}
```

**Important constraints:**
- `assertAgentNotInActiveWorkflow` is enforced server-side — an agent in an active/paused workflow cannot be added to another. API returns HTTP 400: "Agent already belongs to an active workflow"
- New members added via `addSubagent` are always added as `"subagent"` role. To make an agent the initiator, use a separate `action: "setInitiator"` call
- The "Add to Workflow" dialog must show only workflows where the agent is NOT already a member
- The dialog must handle the 400 error gracefully and show it to the user

**Dialog wireframe:**
```
┌────────────────────────────────────────────────┐
│  Add ResearchBot to Workflow                   │
│                                                │
│  Select workflow:                              │
│  ┌────────────────────────────────────────┐    │
│  │ MainWorkflow ▼                         │    │
│  └────────────────────────────────────────┘    │
│                                                │
│  Note: Agent will be added as sub-agent.       │
│  Use workflow settings to change role.         │
│                                                │
│  [Cancel]          [Add to Workflow]           │
└────────────────────────────────────────────────┘
```

---

## Verification Steps

1. Home page → hover agent card → click `•••` → see "Duplicate" option
2. Click Duplicate → toast "Agent duplicated" → new card appears with "(copy)" suffix
3. Duplicate inherits all tools (via metadata copy), plugins, sync folder paths
4. Duplicate has `status: active` and appears immediately in the list
5. Duplicate has empty chat history (fresh start)
6. If source agent had sync folders → copy shows same paths with `status: pending`
7. If source agent had an avatar image → copy shows same avatar
8. Duplicating "Agent (copy)" → produces "Agent (copy)" (not "Agent (copy) (copy)")
9. Cannot duplicate another user's agent → 403 response

---

## Gap Analysis & Missing Considerations

> The following were identified by codebase research on 2026-02-19 and have been incorporated into the plan above. Kept here for historical reference.

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Wrong schema imports (shim files) | Changed to `sqlite-character-schema.ts` |
| 2 | `getLocalUser()` wrong auth pattern | Changed to `requireAuth` + `getOrCreateLocalUser` |
| 3 | All agent config is in `metadata` JSON blob | Insert uses `metadata: {...spread...}` not individual columns |
| 4 | Wrong `agentSyncFolders` column names | `recursive` (not `is_recursive`), `includeExtensions` (not `file_extensions`) |
| 5 | Plugin assignments in `agent_plugins` join table | Added plugin copy block |
| 6 | Next.js 15 async params | `type RouteParams = { params: Promise<{id: string}> }` + `await params` |
| 7 | Wrong `resilientFetch({method:"POST"})` | Changed to `resilientPost` |
| 7b | `refetchCharacters()` doesn't exist | Changed to `loadCharacters()` |
| 7c | `toast({description:"..."})` wrong API | Changed to `toast.success()` / `toast.error()` |
| 8 | Copying folders triggers auto-reindex | Acknowledged with decision point |
| 9 | "Add to Workflow" API is `addSubagent` action, not array update | Corrected |
| 10 | `character_images` not copied | Added image copy block |
| 11 | No ownership check | `if (source.userId !== dbUser.id) → 403` added |
| 12 | "(copy) (copy)" accumulation | Name deduplication logic added |
| 14 | Missing required sync folder fields | All columns copied including `userId`, indexing settings |
