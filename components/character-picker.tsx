"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search as LucideSearch, Sparkles as LucideSparkles } from "lucide-react";
import { AnimatedCard } from "@/components/ui/animated-card";
import { AnimatedButton } from "@/components/ui/animated-button";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { animate, stagger } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_EASINGS, ZLUTTY_DURATIONS } from "@/lib/animations/utils";
import { useTranslations } from "next-intl";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceDashboard } from "@/components/workspace/workspace-dashboard";
import { WorkspaceOnboarding } from "@/components/workspace/workspace-onboarding";
import { CreateAgentModal } from "@/components/character-creation/create-agent-modal";
import { useSessionSync } from "@/lib/hooks/use-session-sync";
import { useSessionSyncStore } from "@/lib/stores/session-sync-store";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { resilientFetch } from "@/lib/utils/resilient-fetch";
import {
  getWorkflowSectionState,
  shouldDisableWorkflowCreate,
  shouldRenderAgentsHeader,
  shouldRenderWorkflowSection,
} from "@/lib/characters/picker-sections";

// Sub-components & extracted modules
import { AgentCardInWorkflow } from "@/components/character-picker-agent-card";
import { WorkflowSection } from "@/components/character-picker-workflow-section";
import { CharacterPickerLoadingSkeleton } from "@/components/character-picker-loading-skeleton";
import {
  WorkflowCreatorDialog,
  ToolEditorDialog,
  PluginEditorDialog,
  FolderManagerDialog,
  McpToolEditorDialog,
  AddToWorkflowDialog,
  IdentityEditorDialog,
  McpRemovalWarningDialog,
  DeleteAgentDialog,
  WorkflowActionDialog,
} from "@/components/character-picker-dialogs";
import type { CharacterSummary, WorkflowGroup, WorkflowMember } from "@/components/character-picker-types";
import { useWorkflowManager } from "@/components/character-picker-workflow-hook";
import { useToolEditor } from "@/components/character-picker-tool-editor-hook";
import { useCharacterActions } from "@/components/character-picker-character-actions-hook";

export function CharacterPicker() {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [vectorDBEnabled, setVectorDBEnabled] = useState(false);
  const [devWorkspaceEnabled, setDevWorkspaceEnabled] = useState(false);
  const [showWorkspaceOnboarding, setShowWorkspaceOnboarding] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const hasAnimated = useRef(false);

  const t = useTranslations("picker");
  const tDeps = useTranslations("picker.toolEditor.dependencyWarnings");

  // Session sync
  useSessionSync({ enablePolling: true, pollingInterval: 10000 });
  const sessionsById = useSessionSyncStore(useShallow(state => state.sessionsById));
  const sessionsByCharacter = useSessionSyncStore(useShallow(state => state.sessionsByCharacter));
  const activeRuns = useSessionSyncStore(useShallow(state => state.activeRuns));

  const hasActiveSession = useCallback((charId: string, initialStatus?: boolean) => {
    const sessionIds = sessionsByCharacter.get(charId);
    if (sessionIds && sessionIds.size > 0) {
      for (const sid of sessionIds) {
        if (activeRuns.has(sid)) return true;
        const s = sessionsById.get(sid);
        if (s?.hasActiveRun) return true;
      }
      return false;
    }
    return !!initialStatus;
  }, [sessionsByCharacter, sessionsById, activeRuns]);

  const loadCharacters = useCallback(async () => {
    try {
      const { data } = await resilientFetch<{ characters: CharacterSummary[] }>("/api/characters");
      if (!data) {
        setIsLoading(false);
        return;
      }

      const activeChars = (data.characters || []).filter(
        (c: CharacterSummary) => c.status === "active"
      );

      if (activeChars.length > 0) {
        const ids = activeChars.map((c: CharacterSummary) => c.id).join(",");
        const { data: statusData } = await resilientFetch<{
          statuses: Record<string, { hasActiveSession: boolean; activeSessionId: string | null }>;
        }>(`/api/characters/active-status?ids=${ids}`);

        const enrichedWithStatus = statusData?.statuses
          ? activeChars.map((char: CharacterSummary) => ({
            ...char,
            hasActiveSession: statusData.statuses[char.id]?.hasActiveSession ?? false,
            activeSessionId: statusData.statuses[char.id]?.activeSessionId ?? null,
          }))
          : activeChars;

        const statsEntries = await Promise.all(
          enrichedWithStatus.map(async (char) => {
            try {
              const { data } = await resilientFetch<{ stats?: { skillCount: number; runCount: number; successRate: number | null; lastActive: string | null } }>(`/api/characters/${char.id}/stats`);
              return [char.id, data?.stats || null] as const;
            } catch {
              return [char.id, null] as const;
            }
          })
        );
        const statsById = new Map(statsEntries);
        setCharacters(
          enrichedWithStatus.map((char) => ({
            ...char,
            stats: statsById.get(char.id) || undefined,
          }))
        );
      } else {
        setCharacters(activeChars);
      }

      try {
        const { data: wfData } = await resilientFetch<{
          workflows: Array<{
            id: string;
            name: string;
            initiatorId: string;
            status: string;
            metadata: WorkflowGroup["metadata"];
            members: WorkflowMember[];
          }>;
        }>("/api/workflows?status=all");

        if (wfData?.workflows && wfData.workflows.length > 0) {
          const charById = new Map(activeChars.map((c: CharacterSummary) => [c.id, c]));
          const memberAgentIds = new Set<string>();
          const groups: WorkflowGroup[] = [];

          for (const wf of wfData.workflows) {
            const agents: CharacterSummary[] = [];
            for (const m of wf.members) {
              const agent = charById.get(m.agentId);
              if (agent) {
                agents.push(agent);
                memberAgentIds.add(m.agentId);
              }
            }
            if (agents.length > 0) {
              groups.push({
                id: wf.id,
                name: wf.name,
                status: wf.status,
                initiatorId: wf.initiatorId,
                metadata: typeof wf.metadata === "string" ? JSON.parse(wf.metadata) : (wf.metadata || {}),
                members: wf.members,
                agents,
              });
            }
          }

          wfManager.setWorkflowGroups(groups);
          wfManager.setWorkflowAgentIds(memberAgentIds);

          if (groups.length === 1) {
            wfManager.setExpandedWorkflowsOnLoad(new Set([groups[0].id]));
          }
        } else {
          wfManager.setWorkflowGroups([]);
          wfManager.setWorkflowAgentIds(new Set());
        }
      } catch (wfError) {
        console.warn("Failed to load workflows (non-fatal):", wfError);
        wfManager.setWorkflowGroups([]);
        wfManager.setWorkflowAgentIds(new Set());
      }
    } catch (error) {
      console.error("Failed to load characters:", error);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hooks
  const wfManager = useWorkflowManager(t, loadCharacters);
  const toolEditor = useToolEditor(t, tDeps, loadCharacters);
  const charActions = useCharacterActions(t, loadCharacters, hasActiveSession);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    resilientFetch<{ vectorDBEnabled?: boolean; devWorkspaceEnabled?: boolean; workspaceOnboardingSeen?: boolean }>("/api/settings").then(({ data }) => {
      if (data) {
        setVectorDBEnabled(data.vectorDBEnabled === true);
        setDevWorkspaceEnabled(data.devWorkspaceEnabled === true);
        if (data.devWorkspaceEnabled && !data.workspaceOnboardingSeen) {
          setShowWorkspaceOnboarding(true);
        }
      }
    });
  }, []);

  useEffect(() => {
    wfManager.syncDraftsToGroups(wfManager.workflowGroups);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wfManager.workflowGroups]);

  useEffect(() => {
    if (!wfManager.workflowCreatorOpen) return;
    if (allStandaloneCharacters.length > 0 && !wfManager.newWorkflowInitiatorId) {
      wfManager.setNewWorkflowInitiatorId(allStandaloneCharacters[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wfManager.workflowCreatorOpen, wfManager.newWorkflowInitiatorId]);

  useEffect(() => {
    if (!gridRef.current || isLoading || prefersReducedMotion || hasAnimated.current) return;
    const cards = gridRef.current.querySelectorAll("[data-animate-card]");
    if (cards.length === 0) return;
    hasAnimated.current = true;
    cards.forEach((card) => {
      (card as HTMLElement).style.opacity = "0";
      (card as HTMLElement).style.transform = "translateY(20px) scale(0.95)";
    });
    animate(cards, {
      opacity: [0, 1],
      translateY: [20, 0],
      scale: [0.95, 1],
      duration: ZLUTTY_DURATIONS.normal,
      ease: ZLUTTY_EASINGS.reveal,
      delay: stagger(80, { start: 100 }),
    });
  }, [isLoading, prefersReducedMotion]);

  // Derived state
  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const query = searchQuery.toLowerCase();
    return characters.filter((char) => {
      const name = (char.displayName || char.name).toLowerCase();
      const tagline = (char.tagline || "").toLowerCase();
      const purpose = (char.metadata?.purpose || "").toLowerCase();
      const tools = (char.metadata?.enabledTools || []).join(" ").toLowerCase();
      return name.includes(query) || tagline.includes(query) || purpose.includes(query) || tools.includes(query);
    });
  }, [characters, searchQuery]);

  const allStandaloneCharacters = useMemo(() => {
    return characters.filter((c) => !wfManager.workflowAgentIds.has(c.id));
  }, [characters, wfManager.workflowAgentIds]);

  const standaloneCharacters = useMemo(() => {
    return filteredCharacters.filter((c) => !wfManager.workflowAgentIds.has(c.id));
  }, [filteredCharacters, wfManager.workflowAgentIds]);

  const availableWorkflowsByAgentId = useMemo(() => {
    const map = new Map<string, WorkflowGroup[]>();
    for (const character of characters) {
      map.set(character.id, []);
    }
    for (const workflow of wfManager.workflowGroups) {
      const memberIds = new Set(workflow.members.map((member) => member.agentId));
      for (const character of characters) {
        if (!memberIds.has(character.id)) {
          map.set(character.id, [...(map.get(character.id) || []), workflow]);
        }
      }
    }
    return map;
  }, [characters, wfManager.workflowGroups]);

  const filteredWorkflowGroups = useMemo(() => {
    if (!searchQuery.trim()) return wfManager.workflowGroups;
    const query = searchQuery.toLowerCase();
    return wfManager.workflowGroups.filter((wf) => {
      if (wf.name.toLowerCase().includes(query)) return true;
      return wf.agents.some((agent) => {
        const name = (agent.displayName || agent.name).toLowerCase();
        const tagline = (agent.tagline || "").toLowerCase();
        const purpose = (agent.metadata?.purpose || "").toLowerCase();
        return name.includes(query) || tagline.includes(query) || purpose.includes(query);
      });
    });
  }, [wfManager.workflowGroups, searchQuery]);

  const workflowSectionState = getWorkflowSectionState({
    workflowCount: wfManager.workflowGroups.length,
    filteredWorkflowCount: filteredWorkflowGroups.length,
    searchQuery,
  });
  const showWorkflowSection = shouldRenderWorkflowSection(characters.length, wfManager.workflowGroups.length);
  const showAgentsHeader = shouldRenderAgentsHeader(showWorkflowSection);
  const disableWorkflowCreate = shouldDisableWorkflowCreate(allStandaloneCharacters.length);

  const handleContinueChat = (characterId: string) => {
    router.push(`/chat/${characterId}`);
  };

  const handleNewChat = (characterId: string) => {
    router.push(`/chat/${characterId}?new=true`);
  };

  const openAddToWorkflowDialog = useCallback(
    (character: CharacterSummary) => {
      const available = availableWorkflowsByAgentId.get(character.id) || [];
      wfManager.openAddToWorkflowDialog(character, available);
    },
    [availableWorkflowsByAgentId, wfManager]
  );

  if (isLoading) {
    return <CharacterPickerLoadingSkeleton />;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6 px-2 py-6 sm:px-4 lg:px-6 xl:px-8 max-w-[1600px] mx-auto bg-terminal-cream min-h-full w-full">
        <AnimatedContainer direction="down" distance={15} className="text-center">
          <h1 className="text-2xl font-bold font-mono text-terminal-dark">{t("title")}</h1>
          <p className="text-terminal-muted mt-2 font-mono text-sm">
            {t("subtitle")}
          </p>
        </AnimatedContainer>

        {devWorkspaceEnabled && (
          <WorkspaceDashboard
            onNavigateToSession={(sessionId, agentId) => {
              if (agentId) {
                router.push(`/chat/${agentId}?sessionId=${sessionId}`);
              }
            }}
          />
        )}

        {showWorkflowSection && (
          <WorkflowSection
            filteredWorkflowGroups={filteredWorkflowGroups}
            workflowSectionState={workflowSectionState}
            expandedWorkflows={wfManager.expandedWorkflows}
            workflowDrafts={wfManager.workflowDrafts}
            workflowMutationBusy={wfManager.workflowMutationBusy}
            allStandaloneCharacters={allStandaloneCharacters}
            hasActiveSession={hasActiveSession}
            disableWorkflowCreate={disableWorkflowCreate}
            router={router}
            t={t}
            onToggle={wfManager.toggleWorkflow}
            onUpdateDraft={wfManager.updateWorkflowDraft}
            onAddSubagent={wfManager.addSubagentToWorkflow}
            onSetMainAgent={wfManager.setWorkflowMainAgent}
            onSetPendingDelete={(payload) => {
              wfManager.setPendingWorkflowMemberRemoval(null);
              wfManager.setPendingWorkflowDeletion(payload);
            }}
            onSetPendingMemberRemoval={(payload) => {
              wfManager.setPendingWorkflowDeletion(null);
              wfManager.setPendingWorkflowMemberRemoval(payload);
            }}
            onSetWorkflowActionTrigger={wfManager.setWorkflowActionTrigger}
            onNewWorkflow={() => wfManager.setWorkflowCreatorOpen(true)}
            onContinueChat={handleContinueChat}
            onNewChat={handleNewChat}
            onEditIdentity={charActions.openIdentityEditor}
            onEditTools={toolEditor.openToolEditor}
            onEditFolders={charActions.openFolderManager}
            onEditMcp={charActions.openMcpToolEditor}
            onEditPlugins={charActions.openPluginEditor}
            onDuplicate={charActions.handleDuplicate}
            onDeleteCharacter={charActions.openDeleteDialog}
            onOpenFolderManager={charActions.openFolderManager}
          />
        )}

        {showAgentsHeader && (
          <div className="flex min-h-9 items-center gap-3">
            <h2 className="font-mono text-sm font-medium text-terminal-muted uppercase tracking-wider">
              {t("agents.sectionTitle")}
            </h2>
            <div className="h-px flex-1 bg-terminal-border/60" />
          </div>
        )}

        {characters.length > 4 && (
          <div className="relative">
            <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-terminal-muted pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
              placeholder={t("searchPlaceholder")}
              className="w-full pl-10 pr-4 py-2 bg-terminal-bg/30 border border-terminal-border rounded-lg font-mono text-sm text-terminal-dark placeholder:text-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-green/50 focus:border-terminal-green"
            />
          </div>
        )}

        <div ref={gridRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          <AnimatedCard data-animate-card hoverLift className="bg-terminal-cream/50 hover:bg-terminal-cream">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              aria-label={t("create")}
              className="flex h-full min-h-[200px] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-lg p-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green focus-visible:ring-offset-2 focus-visible:ring-offset-terminal-cream"
            >
              <div className="w-16 h-16 rounded-full bg-terminal-green/10 flex items-center justify-center shadow-sm">
                <Plus className="w-8 h-8 text-terminal-green" />
              </div>
              <div className="text-center">
                <p className="font-medium font-mono text-terminal-dark">{t("create")}</p>
                <p className="text-sm text-terminal-muted font-mono">{t("createDescription")}</p>
              </div>
            </button>
          </AnimatedCard>

          {standaloneCharacters.map((character) => (
            <AgentCardInWorkflow
              key={character.id}
              dataAnimateCard
              character={character}
              t={t}
              hasActiveSession={hasActiveSession}
              onContinueChat={handleContinueChat}
              onNewChat={handleNewChat}
              onEditIdentity={charActions.openIdentityEditor}
              onEditTools={toolEditor.openToolEditor}
              onEditFolders={charActions.openFolderManager}
              onEditMcp={charActions.openMcpToolEditor}
              onEditPlugins={charActions.openPluginEditor}
              onDuplicate={charActions.handleDuplicate}
              addToWorkflowLabel={t("workflows.addToWorkflow")}
              onAddToWorkflow={openAddToWorkflowDialog}
              canAddToWorkflow={(availableWorkflowsByAgentId.get(character.id) || []).length > 0}
              onDelete={charActions.openDeleteDialog}
              router={router}
            />
          ))}
        </div>

        {characters.length > 0 && standaloneCharacters.length === 0 && searchQuery.trim() !== "" && (
          <div className="text-center py-8">
            <p className="font-mono text-sm text-terminal-muted">{t("noResults", { query: searchQuery.trim() })}</p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-2 font-mono text-xs text-terminal-green hover:underline"
            >
              {t("clearSearch")}
            </button>
          </div>
        )}

        {characters.length === 0 && (
          <AnimatedContainer delay={200} className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-terminal-green/10 flex items-center justify-center">
              <LucideSparkles className="w-10 h-10 text-terminal-green" />
            </div>
            <h2 className="font-mono text-lg font-medium text-terminal-dark mb-2">
              {t("emptyTitle")}
            </h2>
            <p className="font-mono text-terminal-muted max-w-md mx-auto mb-6">
              {t("emptyDescription")}
            </p>
            <AnimatedButton
              onClick={() => setCreateModalOpen(true)}
              className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
            >
              <Plus className="w-4 h-4" />
              {t("create")}
            </AnimatedButton>
          </AnimatedContainer>
        )}

        <CreateAgentModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          onCreated={() => { void loadCharacters(); }}
        />

        <WorkflowCreatorDialog
          open={wfManager.workflowCreatorOpen}
          onOpenChange={wfManager.setWorkflowCreatorOpen}
          newWorkflowName={wfManager.newWorkflowName}
          setNewWorkflowName={wfManager.setNewWorkflowName}
          newWorkflowInitiatorId={wfManager.newWorkflowInitiatorId}
          setNewWorkflowInitiatorId={wfManager.setNewWorkflowInitiatorId}
          newWorkflowSubagentIds={wfManager.newWorkflowSubagentIds}
          setNewWorkflowSubagentIds={wfManager.setNewWorkflowSubagentIds}
          allStandaloneCharacters={allStandaloneCharacters}
          creatingWorkflow={wfManager.creatingWorkflow}
          onSubmit={wfManager.createWorkflowGroup}
        />

        <ToolEditorDialog
          open={toolEditor.toolEditorOpen}
          onOpenChange={toolEditor.setToolEditorOpen}
          editingCharacter={toolEditor.editingCharacter}
          selectedTools={toolEditor.selectedTools}
          isSaving={toolEditor.isSaving}
          toolSearchQuery={toolEditor.toolSearchQuery}
          setToolSearchQuery={toolEditor.setToolSearchQuery}
          collapsedCategories={toolEditor.collapsedCategories}
          filteredToolsByCategory={toolEditor.filteredToolsByCategory}
          toolsByCategory={toolEditor.toolsByCategory}
          availableTools={toolEditor.availableTools}
          areDependenciesMet={toolEditor.areDependenciesMet}
          getDependencyWarning={toolEditor.getDependencyWarning}
          toggleCategory={toolEditor.toggleCategory}
          toggleAllInCategory={toolEditor.toggleAllInCategory}
          getSelectedCountInCategory={toolEditor.getSelectedCountInCategory}
          toggleTool={toolEditor.toggleTool}
          onSave={toolEditor.saveTools}
        />

        <PluginEditorDialog
          open={charActions.pluginEditorOpen}
          onOpenChange={charActions.setPluginEditorOpen}
          editingCharacter={charActions.pluginEditingCharacter}
          agentPlugins={charActions.agentPlugins}
          loadingAgentPlugins={charActions.loadingAgentPlugins}
          savingPluginId={charActions.savingPluginId}
          toggleAgentPlugin={charActions.toggleAgentPlugin}
        />

        <FolderManagerDialog
          open={charActions.folderManagerOpen}
          onOpenChange={charActions.setFolderManagerOpen}
          folderManagerCharacter={charActions.folderManagerCharacter}
        />

        <McpToolEditorDialog
          open={charActions.mcpToolEditorOpen}
          onOpenChange={charActions.setMcpToolEditorOpen}
          editingCharacter={charActions.mcpEditingCharacter}
          mcpServers={charActions.mcpServers}
          mcpTools={charActions.mcpTools}
          mcpToolPreferences={charActions.mcpToolPreferences}
          onUpdate={charActions.onUpdateMcp}
          onComplete={charActions.saveMcpTools}
        />

        <AddToWorkflowDialog
          open={wfManager.addToWorkflowDialogOpen}
          onOpenChange={wfManager.setAddToWorkflowDialogOpen}
          addToWorkflowCharacter={wfManager.addToWorkflowCharacter}
          availableWorkflowsByAgentId={availableWorkflowsByAgentId}
          selectedWorkflowId={wfManager.selectedWorkflowId}
          setSelectedWorkflowId={wfManager.setSelectedWorkflowId}
          isAddingToWorkflow={wfManager.isAddingToWorkflow}
          onConfirm={wfManager.confirmAddToWorkflow}
          onClose={wfManager.closeAddToWorkflowDialog}
        />

        <IdentityEditorDialog
          open={charActions.identityEditorOpen}
          onOpenChange={charActions.setIdentityEditorOpen}
          identityForm={charActions.identityForm}
          setIdentityForm={charActions.setIdentityForm}
          generatedPrompt={charActions.generatedPrompt}
          isSaving={charActions.isSavingIdentity}
          onSave={charActions.saveIdentity}
        />

        <McpRemovalWarningDialog
          open={charActions.mcpRemovalWarningOpen}
          onOpenChange={charActions.setMcpRemovalWarningOpen}
          mcpToolsBeingRemoved={charActions.mcpToolsBeingRemoved}
          isSaving={charActions.isSavingMcp}
          onConfirm={(e) => {
            e.preventDefault();
            charActions.performMcpToolSave();
          }}
        />

        <DeleteAgentDialog
          open={charActions.deleteDialogOpen}
          onOpenChange={charActions.setDeleteDialogOpen}
          characterToDelete={charActions.characterToDelete}
          isDeleting={charActions.isDeleting}
          onConfirm={(e) => {
            e.preventDefault();
            charActions.deleteCharacter();
          }}
        />

        <WorkflowActionDialog
          open={wfManager.workflowActionDialogOpen}
          onOpenChange={wfManager.handleWorkflowActionDialogOpenChange}
          pendingWorkflowMemberRemoval={wfManager.pendingWorkflowMemberRemoval}
          pendingWorkflowDeletion={wfManager.pendingWorkflowDeletion}
          workflowMutationBusy={wfManager.workflowMutationBusy}
          onConfirmRemoveSubagent={(event) => {
            event.preventDefault();
            if (!wfManager.pendingWorkflowMemberRemoval) return;
            wfManager.removeSubagentFromWorkflow(
              wfManager.pendingWorkflowMemberRemoval.workflowId,
              wfManager.pendingWorkflowMemberRemoval.agentId
            ).finally(wfManager.closeWorkflowActionDialog);
          }}
          onConfirmDeleteWorkflow={(event) => {
            event.preventDefault();
            if (!wfManager.pendingWorkflowDeletion) return;
            wfManager.deleteWorkflowGroup(wfManager.pendingWorkflowDeletion.workflowId).finally(wfManager.closeWorkflowActionDialog);
          }}
        />

        <WorkspaceOnboarding
          open={showWorkspaceOnboarding}
          onComplete={() => setShowWorkspaceOnboarding(false)}
        />
      </div>
    </TooltipProvider>
  );
}
