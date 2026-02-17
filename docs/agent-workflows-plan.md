# Agent Workflows Architecture & Implementation Plan

## Executive Summary

We will introduce a **workflow model** that binds a main (initiator) agent with plugin-derived sub-agents, so they can share indexed folders, plugin context (hooks/MCP/LSP), and prompt context while preserving sub-agent sandbox boundaries.

This plan builds on the current import pipeline (`app/api/plugins/import/route.ts`) and plugin scoping (`lib/plugins/registry.ts`, `app/api/chat/route.ts`) by adding:

1. Durable workflow records in SQLite.
2. Metadata hydration from plugin agent markdown frontmatter/body.
3. Shared-resource inheritance rules (folders, plugins, MCP visibility, hooks execution context).
4. Chat bootstrap workflow-awareness.
5. Agent-picker UI support for grouped workflows and controls.

---

## Current State (Observed)

- Plugin import discovers agents via `discoverAgents` in `lib/plugins/import-parser.ts` and auto-creates character records in `app/api/plugins/import/route.ts`.
- Created agents currently get minimal metadata (`purpose` + `enabledPlugins`) and are linked to plugin assignment via `enablePluginForAgent`.
- Chat runtime scopes plugins by agent using `getEnabledPluginsForAgent` in `app/api/chat/route.ts`.
- Character metadata already supports prompt/MCP/tool settings (`lib/characters/validation.ts`).
- Indexed folders are per-character via `agent_sync_folders` (`lib/db/sqlite-character-schema.ts`), but there is no workflow-level sharing model.

Gap: there is no explicit parent-child coordination primitive for plugin sub-agents.

---

## Goals

- Introduce first-class workflows: **initiator + sub-agents + shared resources**.
- Ensure plugin-derived agents are immediately operational in multi-agent orchestration.
- Preserve sandbox behavior while inheriting approved shared context.
- Provide clear UI affordances for workflow grouping and controls.
- Keep implementation incremental and backward-compatible.

## Non-Goals (Phase 1)

- Autonomous long-running distributed scheduler for sub-agents.
- Cross-user/shared-team workflows.
- Rewriting plugin parsing contracts.

---

## Target Architecture

## 1) Domain Model: Workflow

Create `lib/agents/workflows.ts` with domain types + service functions.

```ts
export type WorkflowStatus = "active" | "paused" | "archived";

export interface AgentWorkflow {
  id: string;
  userId: string;
  name: string;
  initiatorId: string; // main agent (where plugin import started)
  status: WorkflowStatus;
  metadata: {
    source: "plugin-import" | "manual";
    pluginId?: string;
    pluginName?: string;
    pluginVersion?: string;
    sharedResources: {
      syncFolderIds: string[];
      pluginIds: string[];
      mcpServerNames: string[];
      hookEvents: string[];
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentWorkflowMember {
  workflowId: string;
  agentId: string;
  role: "initiator" | "subagent";
  sourcePath?: string; // plugin file path of agent definition
  metadataSeed?: {
    description?: string;
    purpose?: string;
    systemPromptSeed?: string;
    tags?: string[];
  };
}
```

Responsibilities in `lib/agents/workflows.ts`:
- `createWorkflowFromPluginImport(...)`
- `addWorkflowMembers(...)`
- `getWorkflowByAgentId(...)`
- `getWorkflowResources(...)`
- `syncSharedFoldersToSubAgents(...)`
- `registerWorkflowSubagentLifecycle(...)` (wrapper around terminal observer lifecycle)

---

## 2) Data Model & Migrations

### New tables (recommended)

Add to `lib/db/sqlite-plugins-schema.ts` or a dedicated `sqlite-workflows-schema.ts` (preferred for separation):

1. `agent_workflows`
   - `id`, `user_id`, `name`, `initiator_id`, `status`, `metadata`, timestamps
   - indexes: `(user_id, status)`, `(initiator_id)`

2. `agent_workflow_members`
   - `id`, `workflow_id`, `agent_id`, `role`, `source_path`, `metadata_seed`, timestamps
   - unique: `(workflow_id, agent_id)`
   - indexes: `(agent_id)`, `(workflow_id, role)`

3. `agent_workflow_resource_links` (optional in phase 1; can be folded into JSON metadata initially)
   - tracks explicit links for resources: `resource_type` (`sync_folder`,`plugin`,`mcp`,`hook`) + identifier

### Existing table extension

`agent_plugins` (optional but useful):
- Add `workflow_id` nullable for provenance and faster joins.

### Character metadata extension

Extend schema in `lib/characters/validation.ts`:
- `workflowId?: string`
- `workflowRole?: "initiator" | "subagent"`
- `workflowSandboxPolicy?: { allowSharedFolders: boolean; allowSharedMcp: boolean; allowSharedHooks: boolean; }
- `inheritedResources?: { syncFolderIds: string[]; pluginIds: string[]; mcpServerNames: string[]; hookEvents: string[]; }
- `pluginAgentSeed?: { sourcePath?: string; description?: string; purpose?: string; systemPromptSeed?: string; }`

### Migration strategy

In `lib/db/sqlite-client.ts`:
- Add `CREATE TABLE IF NOT EXISTS ...` blocks.
- Add indexes and unique constraints.
- Backfill `workflowId/workflowRole` as null-safe (no-op for existing agents).
- Keep all migrations idempotent with guarded `ALTER TABLE`.

---

## 3) Metadata Hydration Strategy (Plugin Agent .md/.mds)

Use `discoverAgents` output (`name`, `description`, `content`, `relativePath`) as seed.

Hydration mapping on character creation:

- `name` -> character `name`/`displayName` (already implemented with uniqueness normalization).
- `description` -> `tagline` and `pluginAgentSeed.description`.
- `content` -> parse first paragraph/heading summary for:
  - `purpose`
  - optional `systemPromptOverride` (bounded/truncated)
  - `pluginAgentSeed.systemPromptSeed`
- `relativePath` -> `pluginAgentSeed.sourcePath` + workflow member `source_path`.

Add helper in `app/api/plugins/import/route.ts` or `lib/plugins/agent-hydration.ts`:

```ts
function buildAgentMetadataSeed(agent: PluginAgentEntry) {
  const promptSeed = agent.content.trim().slice(0, 8000);
  const purpose = agent.description || agent.content.split("\n\n")[0]?.slice(0, 400) || undefined;
  return {
    sourcePath: agent.relativePath,
    description: agent.description || undefined,
    purpose,
    systemPromptSeed: promptSeed || undefined,
  };
}
```

Guardrails:
- Truncate prompt seeds (e.g., 8k chars).
- Strip obvious unsafe delimiters from frontmatter leftovers.
- Never execute markdown content; treat as plain text seed only.

---

## 4) Import Pipeline Changes (`app/api/plugins/import/route.ts`)

After plugin install + sub-agent creation:

1. Detect initiator context:
   - If `characterId` provided: use as `initiatorId`.
   - Else create workflow in deferred mode with first created plugin agent as initiator fallback OR require explicit initiator in request (recommended: add optional `initiatorCharacterId`).

2. Hydrate each created sub-agent metadata using strategy above.

3. Create workflow record:
   - `source = "plugin-import"`
   - attach plugin id/version and shared resource snapshot.

4. Copy/link shared resources:
   - plugins: assign installed plugin to all sub-agents (already done partially).
   - sync folders: copy folder links from initiator into sub-agents (`agent_sync_folders` duplication with same settings).
   - MCP/hook shared config: record in workflow metadata for runtime resolution.

5. Return workflow payload in import response:
   - `workflow: { id, initiatorId, subAgentIds, sharedResources }`

### API additions

- `POST /api/plugins/import?dryRun=true`
  - parse + hydration preview + workflow plan only (no writes).
- `GET /api/workflows/:id`
- `POST /api/workflows/:id/subagents/:agentId/run`
- `POST /api/workflows/:id/share-folder`

---

## 5) Runtime Behavior (`app/api/chat/route.ts`)

At chat bootstrap when `characterId` present:

1. Resolve workflow membership for current agent (`getWorkflowByAgentId`).
2. If member:
   - load workflow shared resources and merge into runtime context.
   - merge inherited plugin scope with agent-specific toggles.
   - append workflow prompt block (bounded) describing role and shared context.
3. Register lifecycle events for sub-agent start/stop through workflow service.
4. Ensure sandbox:
   - enforce resource allowlist derived from workflow policy.
   - prevent arbitrary resource escalation by sub-agents.

Pseudo flow:

```ts
const workflow = await getWorkflowByAgentId(characterId);
if (workflow) {
  const shared = await getWorkflowResources(workflow.id, characterId);
  pluginContext = mergePluginContext(pluginContext, shared.plugins);
  enabledTools = applyWorkflowSandbox(enabledTools, shared.policy);
  systemPromptValue = appendWorkflowRoleBlock(systemPromptValue, shared.promptContext);
}
```

---

## 6) Sub-Agent Lifecycle via Terminal Observer

Use existing observer/diagnostic infrastructure (e.g., `lib/ai/filesystem/diagnostics.ts`) as control plane abstraction:

- Register workflow-scoped runs:
  - `workflowRunId`, `workflowId`, `agentId`, `state`, timestamps.
- Expose operations:
  - `startSubAgent(workflowId, agentId)`
  - `observeSubAgent(...)`
  - `stopSubAgent(...)`
- Emit lifecycle hooks: `SubagentStart`, `SubagentStop`, `TaskCompleted`.

This avoids unmanaged standalone sub-agent processes.

---

## 7) UI/UX Plan (`components/character-picker.tsx`)

Rework picker to show workflow groups:

- Group card model:
  - Main agent row (initiator)
  - Collapsible sub-agent list
  - Shared resource chips: folders, plugins, MCP, hooks
  - Status badges: running/idle/error

- Controls:
  - `Run sub-agent`
  - `Stop`
  - `Share folder` (opens folder inheritance dialog)
  - `Open workflow settings`

- Interaction pattern reuse:
  - Use toggle rows and section cards from `components/settings/plugin-settings.tsx` for consistency.

- Visual indicators:
  - workflow icon/link line between initiator and sub-agents
  - inherited-resource badge on sub-agent cards

- Safety UX:
  - confirmation when detaching sub-agent from workflow
  - warning when changing shared folders during active runs

---

## 8) Affected Modules & Responsibilities

- `lib/agents/workflows.ts` (new): workflow service and orchestration logic.
- `lib/db/sqlite-client.ts`: migrations and indexes.
- `lib/db/sqlite-plugins-schema.ts` (or new workflow schema file): new tables/types.
- `lib/characters/validation.ts`: metadata schema extension.
- `lib/plugins/import-parser.ts`: optional richer extraction helper for agent seed details.
- `app/api/plugins/import/route.ts`: hydration + workflow creation + dry-run.
- `lib/plugins/registry.ts`: workflow-aware plugin enablement helpers.
- `app/api/chat/route.ts`: workflow-aware runtime bootstrap and sandbox policy enforcement.
- `components/character-picker.tsx`: workflow grouping UI and controls.

---

## 9) Step-by-Step Implementation Order

1. **Schema + migrations**
   - Add workflow tables and indexes.
   - Extend metadata schema.

2. **Workflow service module**
   - Implement CRUD + membership/resource resolution.

3. **Import hydration**
   - Add metadata seed extraction helper.
   - Update `createAgentsFromPlugin` to store hydrated metadata.

4. **Workflow creation in import route**
   - Create workflow/members and shared-resource snapshot.
   - Add dry-run mode.

5. **Shared folders inheritance**
   - Implement copy/link from initiator `agent_sync_folders` to sub-agents.

6. **Chat runtime integration**
   - Resolve workflow membership and apply shared context/sandbox policy.

7. **Lifecycle management hooks**
   - Register sub-agent runs with observer layer.

8. **Agent picker workflow UI**
   - Group rendering, controls, shared-resource indicators.

9. **Tests + validation scripts**
   - Add dry-run validator script for workflow import simulation.

---

## 10) Testing Strategy

### Unit tests

- `lib/plugins/import-parser`:
  - agent seed extraction from `.md/.mds`
- `lib/agents/workflows`:
  - workflow creation, membership retrieval, resource merge precedence
- `lib/plugins/registry`:
  - workflow-aware plugin enablement resolution

### Integration tests

- `app/api/plugins/import/route.ts`:
  - import with initiator -> workflow created
  - dry-run returns preview with no DB writes
- `app/api/chat/route.ts`:
  - workflow member chat gets inherited folders/plugins and role prompt block

### UI tests

- `components/character-picker.tsx`:
  - grouped workflow rendering
  - run/stop/share-folder actions

### Regression tests

- non-workflow agents still behave exactly as before.
- plugin import without agents still works.

---

## 11) Operational Guardrails

- Hard cap sub-agents per import (existing 25 cap retained).
- Prevent duplicate workflow creation for same plugin import request id (idempotency key).
- Enforce shared resource allowlist at runtime.
- Log workflow event telemetry:
  - workflow_created
  - subagent_started/stopped
  - shared_folder_sync_applied
  - hydration_truncated

---

## 12) Suggested Coding Patterns

- Keep parsing/persistence/orchestration separated:
  - parser -> pure extraction
  - import route -> request orchestration
  - workflow service -> durable model operations
- Prefer explicit DTOs for API responses to avoid leaking internal schema.
- Add `dryRun` to all mutating workflow endpoints where feasible.

---

## 13) Example Import Route Integration Snippet

```ts
const hydration = parsed.components.agents.map((agent) => ({
  agent,
  seed: buildAgentMetadataSeed(agent),
}));

const createdAgents = await createAgentsFromPlugin({
  userId: dbUser.id,
  pluginId: plugin.id,
  pluginName: parsed.manifest.name,
  pluginAgents: hydration.map((x) => x.agent),
  metadataSeeds: hydration.map((x) => x.seed),
  warnings: parsed.warnings,
});

const workflow = await createWorkflowFromPluginImport({
  userId: dbUser.id,
  initiatorId: characterId!,
  subAgentIds: createdAgents.map((a) => a.id),
  pluginId: plugin.id,
  pluginName: plugin.name,
  pluginVersion: plugin.version,
});

await syncSharedFoldersToSubAgents({
  userId: dbUser.id,
  initiatorId: characterId!,
  subAgentIds: createdAgents.map((a) => a.id),
  workflowId: workflow.id,
});
```

---

## 14) Risks & Mitigations

- **Risk:** Prompt bloat from inherited seeds.
  - **Mitigation:** hard truncation + structured prompt blocks.
- **Risk:** Folder sync duplication causing heavy indexing load.
  - **Mitigation:** queued sync with rate limits + dedupe by folder hash/path.
- **Risk:** Conflicting plugin assignments.
  - **Mitigation:** deterministic precedence: explicit agent toggle > workflow inheritance > global default.
- **Risk:** orphaned workflow members after agent deletion.
  - **Mitigation:** FK cascade + cleanup hooks in workflow service.

---

## 15) Rollout Plan

1. Ship DB + service behind feature flag `agentWorkflowsEnabled`.
2. Enable import hydration + workflow creation for plugin imports only.
3. Enable chat runtime workflow context resolution.
4. Enable picker workflow UI.
5. Remove flag after stability and telemetry thresholds are met.

---

## 16) Definition of Done

- Plugin import creates workflow-linked sub-agents with hydrated metadata.
- Sub-agents appear in picker as grouped workflow members.
- Sub-agent chats inherit approved shared folders/plugins/MCP/hook context.
- Lifecycle controls (run/observe/stop) are workflow-scoped.
- Dry-run endpoint validates full import/hydration/workflow plan without writes.
- Tests pass for parser, import route, workflow service, chat runtime, and picker rendering.
