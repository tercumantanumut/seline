"use client";

import { useRouter } from "next/navigation";
import { GitBranchPlus, Crown, MoreHorizontal, MessageCircle, UserPlus, Unlink, ChevronDown, ChevronRight } from "lucide-react";
import { Database } from "@phosphor-icons/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedButton } from "@/components/ui/animated-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";
import { hasMissingInitiator, shouldDisableInitiatorActions } from "@/lib/characters/picker-sections";
import { AgentCardInWorkflow } from "@/components/character-picker-agent-card";
import type { CharacterSummary, WorkflowGroup } from "@/components/character-picker-types";

const DatabaseIcon = Database;

export function WorkflowCard({
  wf,
  isExpanded,
  workflowDrafts,
  workflowMutationBusy,
  allStandaloneCharacters,
  hasActiveSession,
  router,
  t,
  onToggle,
  onUpdateDraft,
  onAddSubagent,
  onSetMainAgent,
  onSetPendingDelete,
  onSetPendingMemberRemoval,
  onSetWorkflowActionTrigger,
  onContinueChat,
  onNewChat,
  onEditIdentity,
  onEditTools,
  onEditFolders,
  onEditMcp,
  onEditPlugins,
  onDuplicate,
  onDeleteCharacter,
  onOpenFolderManager,
}: {
  wf: WorkflowGroup;
  isExpanded: boolean;
  workflowDrafts: Record<string, { addAgentId?: string; initiatorId?: string }>;
  workflowMutationBusy: string | null;
  allStandaloneCharacters: CharacterSummary[];
  hasActiveSession: (charId: string, initialStatus?: boolean) => boolean;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations>;
  onToggle: (id: string) => void;
  onUpdateDraft: (workflowId: string, patch: Partial<{ addAgentId: string; initiatorId: string }>) => void;
  onAddSubagent: (workflowId: string, agentId: string) => void;
  onSetMainAgent: (workflowId: string, initiatorId: string) => void;
  onSetPendingDelete: (payload: { workflowId: string; workflowName: string }) => void;
  onSetPendingMemberRemoval: (payload: { workflowId: string; agentId: string }) => void;
  onSetWorkflowActionTrigger: (el: HTMLElement) => void;
  onContinueChat: (id: string) => void;
  onNewChat: (id: string) => void;
  onEditIdentity: (c: CharacterSummary) => void;
  onEditTools: (c: CharacterSummary) => void;
  onEditFolders: (c: CharacterSummary) => void;
  onEditMcp: (c: CharacterSummary) => void;
  onEditPlugins: (c: CharacterSummary) => void;
  onDuplicate: (id: string) => void;
  onDeleteCharacter: (c: CharacterSummary) => void;
  onOpenFolderManager: (c: CharacterSummary) => void;
}) {
  const agentIds = wf.agents.map((a) => a.id);
  const missingInitiator = hasMissingInitiator(wf.initiatorId, agentIds);
  const disableInitiatorActions = shouldDisableInitiatorActions(missingInitiator);
  const initiator = wf.agents.find((a) => a.id === wf.initiatorId);
  const subAgents = wf.agents.filter((a) => a.id !== wf.initiatorId);
  const sharedResources = wf.metadata?.sharedResources;
  const statusColor =
    wf.status === "active"
      ? "bg-green-100 text-green-700 border-green-200"
      : wf.status === "paused"
      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
      : "bg-gray-100 text-gray-500 border-gray-200";

  return (
    <Card className="transition-all bg-terminal-cream border-terminal-border">
      <CardHeader className="pb-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onToggle(wf.id)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle(wf.id)}
          className="flex items-center gap-3 text-left w-full cursor-pointer"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-terminal-muted shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-terminal-muted shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <CardTitle className="font-mono text-base truncate">{wf.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className={`text-[10px] font-mono ${statusColor}`}>
                {wf.status === "active"
                  ? t("workflows.statusActive")
                  : wf.status === "paused"
                  ? t("workflows.statusPaused")
                  : t("workflows.statusArchived")}
              </Badge>
              <span className="text-xs font-mono text-terminal-muted">
                {t("workflows.agentCount", { count: wf.agents.length })}
              </span>
              {disableInitiatorActions && (
                <Badge variant="outline" className="text-[10px] font-mono bg-red-50 text-red-700 border-red-200">
                  {t("workflows.agentDeleted")}
                </Badge>
              )}
              {sharedResources?.syncFolderIds && sharedResources.syncFolderIds.length > 0 && (
                <span className="text-[10px] font-mono text-terminal-muted">
                  {t("workflows.sharedFolders", { count: sharedResources.syncFolderIds.length })}
                </span>
              )}
              {sharedResources?.pluginIds && sharedResources.pluginIds.length > 0 && (
                <span className="text-[10px] font-mono text-terminal-muted">
                  {t("workflows.sharedPlugins", { count: sharedResources.pluginIds.length })}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-terminal-border text-terminal-muted transition-colors hover:bg-terminal-bg/20 hover:text-terminal-dark"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={t("workflows.settings")}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-40 font-mono text-xs"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <DropdownMenuItem
                  disabled={disableInitiatorActions}
                  onSelect={(event) => {
                    event.preventDefault();
                    if (!initiator || disableInitiatorActions) return;
                    onContinueChat(initiator.id);
                  }}
                >
                  <MessageCircle className="mr-2 h-3.5 w-3.5" />
                  {t("workflows.run")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={disableInitiatorActions}
                  onSelect={(event) => {
                    event.preventDefault();
                    if (!initiator || disableInitiatorActions) return;
                    onOpenFolderManager(initiator);
                  }}
                >
                  <DatabaseIcon className="mr-2 h-3.5 w-3.5" />
                  {t("workflows.shareFolder")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4 border-t border-terminal-border/20 pt-4">
            <div className="rounded-lg bg-terminal-bg/5 p-3">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <select
                    value={workflowDrafts[wf.id]?.addAgentId || ""}
                    onChange={(event) =>
                      onUpdateDraft(wf.id, { addAgentId: event.target.value })
                    }
                    className="h-8 min-w-0 flex-1 rounded border border-terminal-border bg-white px-2 font-mono text-xs text-terminal-dark focus:border-terminal-green focus:outline-none"
                    disabled={workflowMutationBusy === wf.id}
                  >
                    <option value="">{t("workflows.addSubagentPlaceholder")}</option>
                    {allStandaloneCharacters.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.displayName || agent.name}
                      </option>
                    ))}
                  </select>
                  <AnimatedButton
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 px-2 font-mono text-xs"
                    disabled={workflowMutationBusy === wf.id || !workflowDrafts[wf.id]?.addAgentId}
                    onClick={() => onAddSubagent(wf.id, workflowDrafts[wf.id]?.addAgentId || "")}
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    {t("workflows.addSubagent")}
                  </AnimatedButton>
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <select
                    value={workflowDrafts[wf.id]?.initiatorId || wf.initiatorId}
                    onChange={(event) =>
                      onUpdateDraft(wf.id, { initiatorId: event.target.value })
                    }
                    className="h-8 min-w-0 flex-1 rounded border border-terminal-border bg-white px-2 font-mono text-xs text-terminal-dark focus:border-terminal-green focus:outline-none"
                    disabled={workflowMutationBusy === wf.id}
                  >
                    {wf.agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.displayName || agent.name}
                      </option>
                    ))}
                  </select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <AnimatedButton
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 shrink-0 px-0 font-mono text-xs"
                        disabled={workflowMutationBusy === wf.id}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                        <span className="sr-only">{t("workflows.settings")}</span>
                      </AnimatedButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 font-mono text-xs">
                      <DropdownMenuItem
                        disabled={workflowMutationBusy === wf.id}
                        onSelect={(event) => {
                          event.preventDefault();
                          onSetMainAgent(wf.id, workflowDrafts[wf.id]?.initiatorId || wf.initiatorId);
                        }}
                      >
                        <Crown className="mr-2 h-3.5 w-3.5" />
                        {t("workflows.makeMain")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={workflowMutationBusy === wf.id}
                        className="text-red-600 focus:text-red-600"
                        onSelect={(event) => {
                          event.preventDefault();
                          onSetWorkflowActionTrigger(event.currentTarget as HTMLElement);
                          onSetPendingDelete({ workflowId: wf.id, workflowName: wf.name });
                        }}
                      >
                        <Unlink className="mr-2 h-3.5 w-3.5" />
                        {t("workflows.deleteWorkflow")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            <div className="relative pl-6">
              {initiator && subAgents.length > 0 && (
                <div className="pointer-events-none absolute bottom-8 left-[10px] top-8 w-px bg-gradient-to-b from-terminal-green/30 via-terminal-border/70 to-terminal-green/10" />
              )}

              {initiator && (
                <div className="relative">
                  {subAgents.length > 0 && (
                    <>
                      <div className="pointer-events-none absolute -left-[14px] top-8 h-px w-4 bg-terminal-green/25" />
                      <div className="pointer-events-none absolute -left-[18px] top-[27px] h-2.5 w-2.5 rounded-full border border-terminal-green/35 bg-terminal-cream shadow-[0_0_0_4px_rgba(82,176,117,0.16)]" />
                    </>
                  )}
                  <AgentCardInWorkflow
                    character={initiator}
                    role="initiator"
                    t={t}
                    hasActiveSession={hasActiveSession}
                    onContinueChat={onContinueChat}
                    onNewChat={onNewChat}
                    onEditIdentity={onEditIdentity}
                    onEditTools={onEditTools}
                    onEditFolders={onEditFolders}
                    onEditMcp={onEditMcp}
                    onEditPlugins={onEditPlugins}
                    onDuplicate={onDuplicate}
                    onDelete={onDeleteCharacter}
                    router={router}
                  />
                </div>
              )}

              {disableInitiatorActions && (
                <p className="mt-2 text-xs font-mono text-red-600/80">
                  {t("workflows.missingInitiatorActionsDisabled")}
                </p>
              )}

              {subAgents.length === 0 && (
                <p className="py-3 text-xs font-mono text-terminal-muted/60">
                  {t("workflows.noSubagents")}
                </p>
              )}

              {subAgents.length > 0 && (
                <div className="mt-3 space-y-3">
                  {subAgents.map((agent) => (
                    <div key={agent.id} className="relative">
                      <div className="pointer-events-none absolute -left-[14px] top-8 h-px w-4 bg-terminal-green/20" />
                      <div className="pointer-events-none absolute -left-[18px] top-[27px] h-2.5 w-2.5 rounded-full border border-terminal-green/30 bg-terminal-cream shadow-[0_0_0_3px_rgba(82,176,117,0.1)]" />
                      <AgentCardInWorkflow
                        character={agent}
                        role="subagent"
                        t={t}
                        hasActiveSession={hasActiveSession}
                        onContinueChat={onContinueChat}
                        onNewChat={onNewChat}
                        onEditIdentity={onEditIdentity}
                        onEditTools={onEditTools}
                        onEditFolders={onEditFolders}
                        onEditMcp={onEditMcp}
                        onEditPlugins={onEditPlugins}
                        onDuplicate={onDuplicate}
                        onDelete={onDeleteCharacter}
                        onRemoveFromWorkflow={() => {
                          onSetPendingMemberRemoval({ workflowId: wf.id, agentId: agent.id });
                        }}
                        removeFromWorkflowLabel={t("workflows.removeSubagent")}
                        router={router}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ==========================================================================
// WorkflowSection
// ==========================================================================

export function WorkflowSection({
  filteredWorkflowGroups,
  workflowSectionState,
  expandedWorkflows,
  workflowDrafts,
  workflowMutationBusy,
  allStandaloneCharacters,
  hasActiveSession,
  disableWorkflowCreate,
  router,
  t,
  onToggle,
  onUpdateDraft,
  onAddSubagent,
  onSetMainAgent,
  onSetPendingDelete,
  onSetPendingMemberRemoval,
  onSetWorkflowActionTrigger,
  onNewWorkflow,
  onContinueChat,
  onNewChat,
  onEditIdentity,
  onEditTools,
  onEditFolders,
  onEditMcp,
  onEditPlugins,
  onDuplicate,
  onDeleteCharacter,
  onOpenFolderManager,
}: {
  filteredWorkflowGroups: WorkflowGroup[];
  workflowSectionState: string;
  expandedWorkflows: Set<string>;
  workflowDrafts: Record<string, { addAgentId?: string; initiatorId?: string }>;
  workflowMutationBusy: string | null;
  allStandaloneCharacters: CharacterSummary[];
  hasActiveSession: (charId: string, initialStatus?: boolean) => boolean;
  disableWorkflowCreate: boolean;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations>;
  onToggle: (id: string) => void;
  onUpdateDraft: (workflowId: string, patch: Partial<{ addAgentId: string; initiatorId: string }>) => void;
  onAddSubagent: (workflowId: string, agentId: string) => void;
  onSetMainAgent: (workflowId: string, initiatorId: string) => void;
  onSetPendingDelete: (payload: { workflowId: string; workflowName: string }) => void;
  onSetPendingMemberRemoval: (payload: { workflowId: string; agentId: string }) => void;
  onSetWorkflowActionTrigger: (el: HTMLElement) => void;
  onNewWorkflow: () => void;
  onContinueChat: (id: string) => void;
  onNewChat: (id: string) => void;
  onEditIdentity: (c: CharacterSummary) => void;
  onEditTools: (c: CharacterSummary) => void;
  onEditFolders: (c: CharacterSummary) => void;
  onEditMcp: (c: CharacterSummary) => void;
  onEditPlugins: (c: CharacterSummary) => void;
  onDuplicate: (id: string) => void;
  onDeleteCharacter: (c: CharacterSummary) => void;
  onOpenFolderManager: (c: CharacterSummary) => void;
}) {
  return (
    <div className="mb-2 space-y-4">
      <div className="flex min-h-9 items-center gap-3">
        <h2 className="font-mono text-sm font-medium text-terminal-muted uppercase tracking-wider">
          {t("workflows.sectionTitle")}
        </h2>
        <div className="h-px flex-1 bg-terminal-border/60" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={disableWorkflowCreate ? 0 : -1}>
              <AnimatedButton
                size="sm"
                variant="outline"
                className="h-8 font-mono text-xs"
                disabled={disableWorkflowCreate}
                onClick={onNewWorkflow}
              >
                <GitBranchPlus className="mr-1.5 h-3.5 w-3.5" />
                {t("workflows.newWorkflow")}
              </AnimatedButton>
            </span>
          </TooltipTrigger>
          {disableWorkflowCreate && (
            <TooltipContent className="font-mono text-xs">
              {t("workflows.createFirstAgentHint")}
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      {workflowSectionState === "list" && (
        <div className="grid gap-4 2xl:grid-cols-2">
          {filteredWorkflowGroups.map((wf) => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              isExpanded={expandedWorkflows.has(wf.id)}
              workflowDrafts={workflowDrafts}
              workflowMutationBusy={workflowMutationBusy}
              allStandaloneCharacters={allStandaloneCharacters}
              hasActiveSession={hasActiveSession}
              router={router}
              t={t}
              onToggle={onToggle}
              onUpdateDraft={onUpdateDraft}
              onAddSubagent={onAddSubagent}
              onSetMainAgent={onSetMainAgent}
              onSetPendingDelete={onSetPendingDelete}
              onSetPendingMemberRemoval={(payload) => {
                onSetPendingMemberRemoval(payload);
              }}
              onSetWorkflowActionTrigger={onSetWorkflowActionTrigger}
              onContinueChat={onContinueChat}
              onNewChat={onNewChat}
              onEditIdentity={onEditIdentity}
              onEditTools={onEditTools}
              onEditFolders={onEditFolders}
              onEditMcp={onEditMcp}
              onEditPlugins={onEditPlugins}
              onDuplicate={onDuplicate}
              onDeleteCharacter={onDeleteCharacter}
              onOpenFolderManager={onOpenFolderManager}
            />
          ))}
        </div>
      )}

      {workflowSectionState === "empty" && (
        <div className="rounded border border-dashed border-terminal-border/70 px-4 py-5 font-mono text-sm text-terminal-muted">
          {t("workflows.empty")}
        </div>
      )}
      {workflowSectionState === "emptySearch" && (
        <div className="rounded border border-dashed border-terminal-border/70 px-4 py-5 font-mono text-sm text-terminal-muted">
          {t("workflows.emptySearch")}
        </div>
      )}
    </div>
  );
}
