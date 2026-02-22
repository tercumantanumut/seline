# System Specialist Agents — Implementation Guide

## Overview

Add **system specialist agents** that auto-provision alongside the default Seline agent. These are lightweight, purpose-built agents (Explore, Plan, Command Executor, etc.) that the default agent can delegate to via the existing workflow/delegation system.

Think of them as "dwarven workers" — they're there when needed, each with minimal tool access and a focused role. The user has full control: rename, customize tools, disable, or delete them.

## Architecture Decision

**Approach: Auto-created system agents + auto-workflow**

When `ensureDefaultAgentExists` creates the default Seline agent for a new user, it also:
1. Creates specialist agent characters (marked `isSystemAgent: true` in metadata)
2. Creates a workflow with Seline as initiator and specialists as subagents
3. Each specialist gets its own system prompt from the prompt templates in `docs/agent-prompts/`

This means:
- They appear in the agent picker (with a "System" badge)
- Seline can delegate to them via `delegateToSubagent`
- Users can chat with them directly too
- Users can disable/delete them — they won't be re-created

---

## Specialist Agent Definitions

Define these 7 agents (the other 4 from `docs/agent-prompts/` are internal-only and don't need character records):

| Agent | Template ID | Tools | System Prompt Source |
|-------|------------|-------|---------------------|
| **Explore** | `system-explore` | localGrep, vectorSearch, readFile, executeCommand | `docs/agent-prompts/explore.md` |
| **Plan** | `system-plan` | localGrep, vectorSearch, readFile, executeCommand | `docs/agent-prompts/plan.md` |
| **Command Executor** | `system-command` | executeCommand | `docs/agent-prompts/bash-command-specialist.md` |
| **Platform Guide** | `system-guide` | localGrep, vectorSearch, readFile, webSearch | `docs/agent-prompts/platform-guide.md` |
| **Session Search** | `system-session-search` | searchSessions, readFile | `docs/agent-prompts/session-search.md` |
| **Agent Architect** | `system-architect` | localGrep, vectorSearch, readFile | `docs/agent-prompts/agent-architect.md` |
| **General Purpose** | `system-general` | *(all default tools)* | `docs/agent-prompts/general-purpose.md` |

**NOT created as agents** (these are internal roles used by the platform itself, not user-facing):
- Conversation Summarizer — used internally by compaction engine
- Hook Verifier — used internally by hooks engine
- Command Description Writer — used internally by executeCommand UI
- Project Onboarder — used internally by sync folder onboarding

---

## File Changes

### 1. Schema: Add `isSystemAgent` to metadata

**File:** `lib/characters/validation.ts`

Add to `agentMetadataSchema`:

```typescript
isSystemAgent: z.boolean().optional(),
systemAgentType: z.string().optional(), // e.g., "explore", "plan", "command"
```

No DB migration needed — it's already a JSON column.

### 2. Template Type: Add `isSystemAgent` flag

**File:** `lib/characters/templates/types.ts`

```typescript
export interface AgentTemplate {
  id: string;
  name: string;
  tagline: string;
  purpose: string;           // Used as systemPromptOverride for system agents
  category?: string;
  version?: string;
  isDefault?: boolean;
  isSystemAgent?: boolean;   // NEW — marks as system specialist
  systemAgentType?: string;  // NEW — "explore", "plan", "command", etc.
  isDeletable?: boolean;
  enabledTools: string[];
  syncFolders?: AgentTemplateSyncFolder[];
  memories: AgentTemplateMemory[];
  exampleSkills?: AgentTemplateSkill[];
}
```

### 3. Define System Agent Templates

**File:** `lib/characters/templates/system-agents.ts` (NEW)

```typescript
import type { AgentTemplate } from "./types";

export const SYSTEM_AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "system-explore",
    name: "Explore",
    tagline: "Fast codebase and knowledge base search",
    purpose: `<paste full content of docs/agent-prompts/explore.md, minus the YAML frontmatter>`,
    category: "system",
    isSystemAgent: true,
    systemAgentType: "explore",
    isDeletable: true,
    enabledTools: ["localGrep", "vectorSearch", "readFile", "executeCommand"],
    memories: [],  // No memories needed — prompt is self-contained
  },
  {
    id: "system-plan",
    name: "Plan",
    tagline: "Architecture analysis and implementation planning",
    purpose: `<paste full content of docs/agent-prompts/plan.md>`,
    category: "system",
    isSystemAgent: true,
    systemAgentType: "plan",
    isDeletable: true,
    enabledTools: ["localGrep", "vectorSearch", "readFile", "executeCommand"],
    memories: [],
  },
  {
    id: "system-command",
    name: "Command Executor",
    tagline: "Safe shell execution within synced folders",
    purpose: `<paste full content of docs/agent-prompts/bash-command-specialist.md>`,
    category: "system",
    isSystemAgent: true,
    systemAgentType: "command",
    isDeletable: true,
    enabledTools: ["executeCommand"],
    memories: [],
  },
  {
    id: "system-guide",
    name: "Platform Guide",
    tagline: "Seline features, config, and troubleshooting",
    purpose: `<paste full content of docs/agent-prompts/platform-guide.md>`,
    category: "system",
    isSystemAgent: true,
    systemAgentType: "guide",
    isDeletable: true,
    enabledTools: ["localGrep", "vectorSearch", "readFile", "webSearch"],
    memories: [],
  },
  {
    id: "system-session-search",
    name: "Session Search",
    tagline: "Find relevant sessions from chat history",
    purpose: `<paste full content of docs/agent-prompts/session-search.md>`,
    category: "system",
    isSystemAgent: true,
    systemAgentType: "session-search",
    isDeletable: true,
    enabledTools: ["searchSessions", "readFile"],
    memories: [],
  },
  {
    id: "system-architect",
    name: "Agent Architect",
    tagline: "Design new agents with full platform awareness",
    purpose: `<paste full content of docs/agent-prompts/agent-architect.md>`,
    category: "system",
    isSystemAgent: true,
    systemAgentType: "architect",
    isDeletable: true,
    enabledTools: ["localGrep", "vectorSearch", "readFile"],
    memories: [],
  },
  {
    id: "system-general",
    name: "General Purpose",
    tagline: "Multi-step task execution with full tool access",
    purpose: `<paste full content of docs/agent-prompts/general-purpose.md>`,
    category: "system",
    isSystemAgent: true,
    systemAgentType: "general",
    isDeletable: true,
    enabledTools: [
      "localGrep", "vectorSearch", "readFile", "editFile", "writeFile",
      "patchFile", "executeCommand", "webSearch", "searchSessions",
      "memorize", "runSkill", "updateSkill", "scheduleTask", "workspace",
    ],
    memories: [],
  },
];
```

**Important:** The `purpose` field becomes the agent's `systemPromptOverride` in metadata. This means the system prompt builder will use it instead of the generic platform prompt. This is how each specialist gets its focused behavior.

### 4. Provisioning Function

**File:** `lib/characters/templates/index.ts`

Add a new function and call it from `ensureDefaultAgentExists`:

```typescript
import { SYSTEM_AGENT_TEMPLATES } from "./system-agents";
import { createManualWorkflow } from "@/lib/agents/workflows";

/**
 * Ensure system specialist agents exist for a user.
 * Called after the default agent is created/confirmed.
 *
 * Idempotent: checks metadata.isSystemAgent + metadata.systemAgentType
 * to avoid duplicates. If user deleted a system agent, it won't be re-created.
 */
export async function ensureSystemAgentsExist(
  userId: string,
  defaultAgentId: string
): Promise<void> {
  try {
    const existingCharacters = await getUserCharacters(userId);

    // Build a set of systemAgentTypes the user already has (or had and deleted)
    const existingSystemTypes = new Set<string>();
    // Track which system agents exist for workflow setup
    const existingSystemAgentIds: string[] = [];

    for (const char of existingCharacters) {
      const meta = (char.metadata ?? {}) as Record<string, unknown>;
      if (meta.isSystemAgent && meta.systemAgentType) {
        existingSystemTypes.add(meta.systemAgentType as string);
        existingSystemAgentIds.push(char.id);
      }
    }

    // Also check if user has ever had system agents before (deleted ones)
    // Store a flag in the default agent's metadata to track this
    const defaultAgent = existingCharacters.find(c => c.id === defaultAgentId);
    const defaultMeta = ((defaultAgent?.metadata ?? {}) as Record<string, unknown>);

    if (defaultMeta.systemAgentsProvisioned) {
      // System agents were already provisioned once — don't re-create deleted ones
      // But DO set up workflow if needed (below)
      await ensureSystemWorkflow(userId, defaultAgentId, existingSystemAgentIds);
      return;
    }

    // First-time provisioning: create all system agents
    const newAgentIds: string[] = [];

    for (const template of SYSTEM_AGENT_TEMPLATES) {
      if (existingSystemTypes.has(template.systemAgentType!)) {
        continue; // Already exists
      }

      const agentId = await createAgentFromTemplate(userId, template);
      if (agentId) {
        newAgentIds.push(agentId);
      }
    }

    // Mark provisioning as done on the default agent
    await updateCharacterMetadata(defaultAgentId, {
      systemAgentsProvisioned: true,
    });

    // Set up workflow: Seline (initiator) + all system agents (subagents)
    const allSystemAgentIds = [...existingSystemAgentIds, ...newAgentIds];
    if (allSystemAgentIds.length > 0) {
      await ensureSystemWorkflow(userId, defaultAgentId, allSystemAgentIds);
    }

    console.log(
      `[SystemAgents] Provisioned ${newAgentIds.length} system agents for user ${userId}`
    );
  } catch (error) {
    console.error("[SystemAgents] Error provisioning system agents:", error);
    // Non-fatal — user can still use the default agent without specialists
  }
}
```

**Wire it into `ensureDefaultAgentExists`:**

```typescript
export async function ensureDefaultAgentExists(userId: string): Promise<string | null> {
  // ... existing logic ...

  // After default agent is confirmed/created:
  if (defaultAgentId) {
    // Fire-and-forget: don't block the response on system agent creation
    ensureSystemAgentsExist(userId, defaultAgentId).catch((err) => {
      console.error("[SystemAgents] Background provisioning failed:", err);
    });
  }

  return defaultAgentId;
}
```

### 5. Workflow Auto-Setup

**File:** `lib/characters/templates/index.ts` (continue in same file)

```typescript
import { getWorkflowsForAgent } from "@/lib/agents/workflows";

async function ensureSystemWorkflow(
  userId: string,
  initiatorId: string,
  subagentIds: string[]
): Promise<void> {
  if (subagentIds.length === 0) return;

  // Check if workflow already exists for this initiator
  const existingWorkflows = await getWorkflowsForAgent(userId, initiatorId);
  const systemWorkflow = existingWorkflows.find(
    (w) => (w.metadata as Record<string, unknown>)?.source === "system-agents"
  );

  if (systemWorkflow) {
    // Workflow exists — just ensure all current system agents are members
    // addWorkflowMembers is idempotent (skips existing members)
    await addWorkflowMembers({
      workflowId: systemWorkflow.id,
      members: subagentIds.map((agentId) => ({
        workflowId: systemWorkflow.id,
        agentId,
        role: "subagent" as const,
      })),
    });
    return;
  }

  // Create new workflow
  await createManualWorkflow({
    userId,
    initiatorId,
    name: "System Specialists",
    subAgentIds: subagentIds,
  });

  // NOTE: createManualWorkflow sets metadata.source = "manual"
  // We need to update it to "system-agents" so we can find it later.
  // Add this after createManualWorkflow returns the workflow:
  // await updateWorkflowMetadata(workflow.id, { source: "system-agents" });
  //
  // If updateWorkflowMetadata doesn't exist yet, add it to workflows.ts.
  // It's a simple: UPDATE agent_workflows SET metadata = json_patch(metadata, ?)
}
```

### 6. `createAgentFromTemplate` — Handle System Agents

**File:** `lib/characters/templates/index.ts`

In the existing `createAgentFromTemplate` function, add `systemPromptOverride` and system agent metadata:

```typescript
// Inside createAgentFromTemplate, where the character is created:
const character = await createCharacter({
  userId,
  name: template.name,
  tagline: template.tagline,
  isDefault,
  status: "active",
  metadata: {
    purpose: template.purpose,
    enabledTools: resolvedTools,
    enabledMcpServers: [],
    enabledMcpTools: [],
    mcpToolPreferences: {},
    // NEW: System agent fields
    ...(template.isSystemAgent && {
      isSystemAgent: true,
      systemAgentType: template.systemAgentType,
      systemPromptOverride: template.purpose, // Use purpose as system prompt
    }),
  },
});
```

### 7. System Prompt Resolution for System Agents

**File:** `lib/ai/character-prompt.ts` (or wherever the system prompt is assembled for characters)

When building the system prompt for a character, check for `systemPromptOverride` in metadata:

```typescript
// In the function that builds the system prompt for a character:
const meta = (character.metadata ?? {}) as Record<string, unknown>;

if (meta.systemPromptOverride && typeof meta.systemPromptOverride === "string") {
  // System agent: use the override as the primary system prompt
  // Still prepend universal blocks (TOOL_USAGE_RULES, DOING_TASKS, EXECUTING_WITH_CARE)
  // but skip the generic personality/role sections
  return [
    TOOL_USAGE_RULES,
    DOING_TASKS,
    EXECUTING_WITH_CARE,
    meta.systemPromptOverride,
  ].join("\n\n");
}

// Otherwise: normal character prompt assembly
```

**Check how `buildCharacterSystemPrompt` currently works** — it probably uses `purpose` from metadata already. If so, the system prompt override may already work. Verify this:
- If `purpose` is already injected into the system prompt → no extra work needed
- If `purpose` only shows as a personality section → add explicit override logic

### 8. UI: System Agent Badge

**File:** `components/character-picker.tsx`

Add a visual indicator for system agents:

```tsx
// In the agent card rendering:
const meta = (character.metadata ?? {}) as Record<string, unknown>;
const isSystemAgent = meta.isSystemAgent === true;

// Render a small badge:
{isSystemAgent && (
  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
    System
  </span>
)}
```

**Optional UX decisions:**
- Sort system agents after user-created agents in the picker
- Show system agents in a collapsible "System Specialists" section
- Gray out the avatar slightly to visually distinguish from user agents

### 9. Sync Folders for System Agents

System agents that need codebase access (Explore, Plan, General Purpose) should **inherit the default agent's sync folders** rather than having their own. This is already handled by the workflow shared resources system:

When `ensureSystemWorkflow` creates the workflow, `buildSharedResourcesSnapshot` in `lib/agents/workflows.ts` automatically captures the initiator's sync folder IDs. Subagents inherit these via `inheritedResources` in their session metadata.

**No extra work needed** — the existing workflow resource sharing handles this.

### 10. Prevent Re-Creation of Deleted System Agents

The `systemAgentsProvisioned` flag on the default agent's metadata ensures this. Once set to `true`, the function only maintains the workflow (adds new members if somehow they appeared) but never re-creates deleted agents.

If the user deletes ALL agents including the default, and a new default is created, the flag is fresh (not set) → system agents will be provisioned again. This is correct behavior — it's a fresh start.

---

## Migration: Existing Users

Existing users won't have system agents until they trigger `ensureDefaultAgentExists` (which runs on every `GET /api/characters` call). The function is already idempotent, so:

1. Existing user visits agent picker
2. `ensureDefaultAgentExists` confirms their default exists
3. `ensureSystemAgentsExist` runs, sees no `systemAgentsProvisioned` flag
4. Creates the 7 system agents + workflow
5. Sets `systemAgentsProvisioned: true`

This is a zero-migration, progressive rollout. No DB migration script needed.

---

## Testing Checklist

- [ ] New user signup → default agent + 7 system agents + 1 workflow created
- [ ] Agent picker shows all 8 agents (1 default + 7 system) with "System" badge on the 7
- [ ] Open chat with Seline → ask it to delegate to "Explore" → should work via `delegateToSubagent`
- [ ] Open chat directly with "Explore" agent → should use the explore-specific system prompt (read-only, parallel searches, etc.)
- [ ] Delete a system agent → it stays deleted, not re-created on refresh
- [ ] Delete ALL agents → fresh default + system agents created on next visit
- [ ] Existing user with agents → system agents provisioned on first load, no duplicates
- [ ] Concurrent requests → no duplicate system agents (idempotent creation)
- [ ] System agent tools are restricted to their defined set (Explore can't editFile, Command Executor can't vectorSearch)
- [ ] Workflow appears in workflow management UI as "System Specialists"

---

## Files Summary

| File | Action |
|------|--------|
| `lib/characters/templates/types.ts` | Add `isSystemAgent`, `systemAgentType` to `AgentTemplate` |
| `lib/characters/templates/system-agents.ts` | **NEW** — Define 7 system agent templates |
| `lib/characters/templates/index.ts` | Add `ensureSystemAgentsExist`, `ensureSystemWorkflow`, wire into `ensureDefaultAgentExists` |
| `lib/characters/validation.ts` | Add `isSystemAgent`, `systemAgentType` to `agentMetadataSchema` |
| `lib/ai/character-prompt.ts` | Handle `systemPromptOverride` in prompt assembly |
| `components/character-picker.tsx` | Add "System" badge for system agents |
| `docs/agent-prompts/*.md` | Already done — prompt content ready to paste into templates |

---

## What NOT to Do

- **Don't create a separate DB table for system agents.** They're regular characters with a metadata flag. The existing character system handles everything.
- **Don't hard-code system agent IDs.** Use `metadata.systemAgentType` for lookups, not character UUIDs.
- **Don't prevent users from modifying system agents.** They should be able to change tools, rename, add memories, add sync folders — full control.
- **Don't auto-restore deleted system agents.** The `systemAgentsProvisioned` flag prevents re-creation. Respect user intent.
- **Don't add system agents to the template picker.** They're auto-provisioned, not manually created from the "Create from Template" flow. Keep them out of `getAllTemplates()`.
