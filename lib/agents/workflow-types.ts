/**
 * Workflow types, interfaces, and metadata parsing helpers.
 * Extracted from workflows.ts to keep the main file focused on CRUD operations.
 */

import type {
  AgentWorkflowMemberRow,
  AgentWorkflowRow,
} from "@/lib/db/sqlite-workflows-schema";

// ── Public types ──────────────────────────────────────────────────────────────

export type WorkflowStatus = "active" | "paused" | "archived";

export interface WorkflowSharedResources {
  syncFolderIds: string[];
  pluginIds: string[];
  mcpServerNames: string[];
  hookEvents: string[];
}

export interface AgentWorkflow {
  id: string;
  userId: string;
  name: string;
  initiatorId: string;
  status: WorkflowStatus;
  metadata: {
    source: "plugin-import" | "manual" | "system-agents";
    pluginId?: string;
    pluginName?: string;
    pluginVersion?: string;
    idempotencyKey?: string;
    sharedResources: WorkflowSharedResources;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentWorkflowMember {
  workflowId: string;
  agentId: string;
  role: "initiator" | "subagent";
  sourcePath?: string;
  metadataSeed?: {
    description?: string;
    purpose?: string;
    systemPromptSeed?: string;
    tags?: string[];
  };
}

export interface WorkflowMembershipContext {
  workflow: AgentWorkflow;
  member: AgentWorkflowMember;
}

export interface WorkflowResourceContext {
  workflowId: string;
  role: "initiator" | "subagent";
  sharedResources: WorkflowSharedResources;
  policy: {
    allowSharedFolders: boolean;
    allowSharedMcp: boolean;
    allowSharedHooks: boolean;
  };
  promptContext: string;
}

export interface WorkflowPromptContextDelegation {
  delegationId: string;
  delegateAgent: string;
  task: string;
  running: boolean;
  elapsed: number;
}

export interface WorkflowPromptContextInput {
  workflowName: string;
  role: "initiator" | "subagent";
  sharedPluginCount: number;
  sharedFolderCount: number;
  subagentDirectory: string[];
  activeDelegations?: WorkflowPromptContextDelegation[];
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

export function buildWorkflowPromptContext(input: WorkflowPromptContextInput): string {
  const lines: string[] = [
    `Workflow: ${input.workflowName}`,
    `Role: ${input.role}`,
    `Shared plugins: ${input.sharedPluginCount}`,
    `Shared folders: ${input.sharedFolderCount}`,
    "Sub-agents:",
    ...(input.subagentDirectory.length > 0 ? input.subagentDirectory : ["- none"]),
    "",
    "Standard terms: workflow, initiator, subagent, delegationId, agentId, observe, continue, stop.",
  ];

  if (input.role === "initiator") {
    lines.push(
      "",
      "## Initiator / Orchestrator Contract",
      "- Delegate when work is multi-step, parallelizable, or requires specialized subagent purpose/capability.",
      "- Do work directly when the task is simple, single-step, or faster to complete in current context.",
      "- Choose target subagent from directory by explicit purpose match before starting delegation.",
      "- Required execution sequence: delegateToSubagent list -> start -> observe(waitSeconds) -> continue or stop.",
      "- Avoid duplicate work: if a delegation to the same subagent is already active, reuse it via observe/continue/stop.",
      "- Integrate and summarize subagent outputs back to the user with clear decisions and next actions.",
      "",
      "## Compatibility Mapping",
      "- run_in_background: start is background by default in Seline. For near-foreground behavior, call observe with waitSeconds (for example 30, 60, 600).",
      "- resume(agent_id): map to continue using delegationId (not agentId) to preserve delegation context.",
      "- max_turns: no strict delegation parameter today; include explicit turn/stop constraints inside task instructions when needed.",
      "- For long-running executeCommand jobs (for example npm install/build), prefer background: true and avoid tight status polling loops.",
      "- When waiting on background jobs, use paced observe/status checks (for example every 30-120s) or a sleep command (for example bash -lc 'sleep 45') between checks.",
    );

    const activeDelegations = input.activeDelegations ?? [];
    if (activeDelegations.length > 0) {
      lines.push(
        "",
        "Active delegations (reuse these; do not start duplicates to the same subagent):",
      );
      for (const del of activeDelegations) {
        const elapsed = Math.floor(del.elapsed / 1000);
        const status = del.running ? `running ${elapsed}s` : "settled";
        lines.push(`- ${del.delegationId}: "${del.delegateAgent}" - task: "${del.task}" (${status})`);
      }
    }
  } else {
    lines.push(
      "",
      "## Subagent / Executor Contract",
      "- Execute the initiator's delegated task precisely; keep scope tight unless clarification is required.",
      "- Return structured deliverables with sections: Summary, Findings, Evidence, Risks, Next Actions.",
      "- If data is missing or conflicting, explicitly escalate with what is missing and the minimum clarification needed.",
      "- Do not orchestrate further delegation unless the initiator explicitly requests it.",
      "- When blocked, provide a concise blocker report plus a concrete proposed path forward.",
    );
  }

  return lines.join("\n");
}

// ── Parsing helpers (used internally by workflows.ts) ─────────────────────────

export function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function parseSharedResources(raw: unknown): WorkflowSharedResources {
  const parsed = toObject(raw);
  return {
    syncFolderIds: toStringArray(parsed.syncFolderIds),
    pluginIds: toStringArray(parsed.pluginIds),
    mcpServerNames: toStringArray(parsed.mcpServerNames),
    hookEvents: toStringArray(parsed.hookEvents),
  };
}

export function parseWorkflowMetadata(raw: unknown): AgentWorkflow["metadata"] {
  const parsed = toObject(raw);
  const source = parsed.source === "manual"
    ? "manual"
    : parsed.source === "system-agents"
      ? "system-agents"
      : "plugin-import";
  return {
    source,
    pluginId: typeof parsed.pluginId === "string" ? parsed.pluginId : undefined,
    pluginName: typeof parsed.pluginName === "string" ? parsed.pluginName : undefined,
    pluginVersion: typeof parsed.pluginVersion === "string" ? parsed.pluginVersion : undefined,
    idempotencyKey: typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : undefined,
    sharedResources: parseSharedResources(parsed.sharedResources),
  };
}

export function parseMemberMetadataSeed(raw: unknown): AgentWorkflowMember["metadataSeed"] {
  const parsed = toObject(raw);
  const tags = toStringArray(parsed.tags);
  return {
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    purpose: typeof parsed.purpose === "string" ? parsed.purpose : undefined,
    systemPromptSeed:
      typeof parsed.systemPromptSeed === "string" ? parsed.systemPromptSeed : undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

export function mapWorkflowRow(row: AgentWorkflowRow): AgentWorkflow {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    initiatorId: row.initiatorId,
    status: row.status,
    metadata: parseWorkflowMetadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapWorkflowMemberRow(row: AgentWorkflowMemberRow): AgentWorkflowMember {
  return {
    workflowId: row.workflowId,
    agentId: row.agentId,
    role: row.role,
    sourcePath: row.sourcePath ?? undefined,
    metadataSeed: parseMemberMetadataSeed(row.metadataSeed),
  };
}
