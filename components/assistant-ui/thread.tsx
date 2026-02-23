"use client";

import type { FC } from "react";
import { useEffect, useState, useCallback } from "react";
import {
  ThreadPrimitive,
  useThread,
  useThreadRuntime,
} from "@assistant-ui/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCharacter } from "./character-context";
import { useOptionalDeepResearch } from "./deep-research-context";
import { useTranslations } from "next-intl";
import { useContextStatus } from "@/lib/hooks/use-context-status";
import {
  ContextWindowBlockedBanner,
  type ContextWindowBlockedPayload,
} from "./context-window-blocked-banner";
import { resilientFetch } from "@/lib/utils/resilient-fetch";
import { PluginStatusBadge } from "@/components/plugins/plugin-status-badge";
import { type VoiceUiSettings } from "./thread-drop-utils";
import { useThreadDropHandler } from "./use-thread-drop-handler";
import {
  DragOverlay,
  SkillImportOverlay,
  ComfyImportDialog,
} from "./thread-import-overlays";
import { ThreadWelcome } from "./thread-welcome";
import { GalleryWrapper, SessionActivityWatcher, ThreadScrollToBottom } from "./thread-scroll-to-bottom";
import {
  AssistantMessage,
  UserMessage,
  SystemMessage,
  EditComposer as EditComposerComponent,
} from "./thread-message-components";
import { Composer } from "./thread-composer";

interface ThreadProps {
  onSessionActivity?: (message: { id?: string; role: "user" | "assistant" }) => void;
  footer?: React.ReactNode;
  isBackgroundTaskRunning?: boolean;
  isProcessingInBackground?: boolean;
  sessionId?: string;
  activeRunId?: string | null;
  onCancelBackgroundRun?: () => void;
  isCancellingBackgroundRun?: boolean;
  canCancelBackgroundRun?: boolean;
  isZombieBackgroundRun?: boolean;
  onLivePromptInjected?: () => void | Promise<void>;
}

export const Thread: FC<ThreadProps> = ({
  onSessionActivity,
  footer,
  isBackgroundTaskRunning = false,
  isProcessingInBackground = false,
  sessionId,
  activeRunId,
  onCancelBackgroundRun,
  isCancellingBackgroundRun = false,
  canCancelBackgroundRun = false,
  isZombieBackgroundRun = false,
}) => {
  const isRunning = useThread((t) => t.isRunning);
  const router = useRouter();
  const { character } = useCharacter();
  const threadRuntime = useThreadRuntime();
  const t = useTranslations("assistantUi");

  // Deep research mode (for drag-drop gating)
  const deepResearch = useOptionalDeepResearch();
  const isDeepResearchMode = deepResearch?.isDeepResearchMode ?? false;

  const [voiceUiSettings, setVoiceUiSettings] = useState<VoiceUiSettings>({
    ttsEnabled: false,
    sttEnabled: false,
  });

  useEffect(() => {
    let cancelled = false;

    const loadVoiceSettings = async () => {
      const { data, error } = await resilientFetch<{
        ttsEnabled?: boolean;
        sttEnabled?: boolean;
      }>("/api/settings", {
        timeout: 10_000,
        retries: 0,
      });

      if (cancelled || error || !data) {
        return;
      }

      setVoiceUiSettings({
        ttsEnabled: Boolean(data.ttsEnabled),
        sttEnabled: Boolean(data.sttEnabled),
      });
    };

    void loadVoiceSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const {
    isDragging,
    isImportingSkill,
    skillImportPhase,
    skillImportProgress,
    skillImportName,
    skillImportError,
    importResultDetail,
    comfyImportDialogOpen,
    setComfyImportDialogOpen,
    comfyImportPreviews,
    comfyImportLoading,
    comfyImportSelected,
    setComfyImportSelected,
    comfyImportNameOverrides,
    setComfyImportNameOverrides,
    comfyImportExpanded,
    setComfyImportExpanded,
    comfyImportSubmitting,
    selectedComfyPreviewCount,
    validComfyPreviewCount,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    resetComfyImportState,
    submitComfyWorkflowImport,
  } = useThreadDropHandler({
    characterId: character?.id,
    characterName: character?.name,
    sessionId,
    isDeepResearchMode,
    threadRuntime,
    router,
  });

  // Context window status tracking
  const {
    status: contextStatus,
    isLoading: contextLoading,
    refresh: refreshContextStatus,
    compact: triggerCompact,
    isCompacting,
  } = useContextStatus({ sessionId });

  // Blocked banner state — set when a 413 error is received
  const [blockedPayload, setBlockedPayload] =
    useState<ContextWindowBlockedPayload | null>(null);

  // Refresh context status after each session activity (message sent/received)
  const wrappedOnSessionActivity = useCallback(
    (message: { id?: string; role: "user" | "assistant" }) => {
      onSessionActivity?.(message);
      // Refresh context status after assistant responds (slight delay for DB to settle)
      if (message.role === "assistant") {
        setTimeout(() => refreshContextStatus(), 1500);
      }
    },
    [onSessionActivity, refreshContextStatus]
  );

  const AssistantMessageWithVoice: FC = useCallback(
    () => <AssistantMessage ttsEnabled={voiceUiSettings.ttsEnabled} />,
    [voiceUiSettings.ttsEnabled]
  );

  return (
    <TooltipProvider>
      <ThreadPrimitive.Root
        className="flex h-full flex-col bg-terminal-cream"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <DragOverlay isDragging={isDragging} isImportingSkill={isImportingSkill} />

        <SkillImportOverlay
          isImportingSkill={isImportingSkill}
          skillImportPhase={skillImportPhase}
          skillImportProgress={skillImportProgress}
          skillImportName={skillImportName}
          skillImportError={skillImportError}
          importResultDetail={importResultDetail}
        />

        <ComfyImportDialog
          open={comfyImportDialogOpen}
          previews={comfyImportPreviews}
          loading={comfyImportLoading}
          selected={comfyImportSelected}
          nameOverrides={comfyImportNameOverrides}
          expanded={comfyImportExpanded}
          submitting={comfyImportSubmitting}
          selectedCount={selectedComfyPreviewCount}
          validCount={validComfyPreviewCount}
          agentName={character?.name || "Agent"}
          onOpenChange={setComfyImportDialogOpen}
          onReset={resetComfyImportState}
          onSelectAll={() => {
            setComfyImportSelected((prev) => {
              const next = { ...prev };
              for (const preview of comfyImportPreviews) {
                if (!preview.error) {
                  next[preview.fileName] = true;
                }
              }
              return next;
            });
          }}
          onClearSelection={() => {
            setComfyImportSelected((prev) => {
              const next = { ...prev };
              for (const key of Object.keys(next)) {
                next[key] = false;
              }
              return next;
            });
          }}
          onToggleSelect={(fileName, checked) => {
            setComfyImportSelected((prev) => ({ ...prev, [fileName]: checked }));
          }}
          onNameChange={(fileName, name) => {
            setComfyImportNameOverrides((prev) => ({ ...prev, [fileName]: name }));
          }}
          onToggleExpand={(fileName) => {
            setComfyImportExpanded((prev) => ({ ...prev, [fileName]: !prev[fileName] }));
          }}
          onSubmit={submitComfyWorkflowImport}
        />

        <SessionActivityWatcher onSessionActivity={wrappedOnSessionActivity} />
        <GalleryWrapper>
          <ThreadPrimitive.Viewport className={cn(
            "flex min-w-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto px-4 pt-8 [overflow-anchor:auto] animate-in fade-in duration-200",
            !isRunning && "scroll-smooth"
          )}>
            <ThreadWelcome />
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage: AssistantMessageWithVoice,
                SystemMessage,
                EditComposer: EditComposerComponent,
              }}
            />
            {/* Context window blocked banner */}
            {blockedPayload && (
              <ContextWindowBlockedBanner
                payload={blockedPayload}
                onCompact={async () => {
                  const result = await triggerCompact();
                  if (result.success) {
                    setTimeout(() => setBlockedPayload(null), 2000);
                  }
                  return result;
                }}
                onDismiss={() => setBlockedPayload(null)}
                isCompacting={isCompacting}
              />
            )}
            {footer}
            <div className="min-h-8 flex-shrink-0 [overflow-anchor:auto]" />
          </ThreadPrimitive.Viewport>

          <div className="sticky bottom-0 mt-3 flex w-full max-w-4xl flex-col items-center justify-end rounded-t-lg bg-terminal-cream pb-4 mx-auto px-4">
            <ThreadScrollToBottom />
            {/* Plugin status badge in chat header */}
            <PluginStatusBadge />
            <Composer
              isBackgroundTaskRunning={isBackgroundTaskRunning}
              isProcessingInBackground={isProcessingInBackground}
              sessionId={sessionId}
              activeRunId={activeRunId}
              sttEnabled={voiceUiSettings.sttEnabled}
              onCancelBackgroundRun={onCancelBackgroundRun}
              isCancellingBackgroundRun={isCancellingBackgroundRun}
              canCancelBackgroundRun={canCancelBackgroundRun}
              isZombieBackgroundRun={isZombieBackgroundRun}
              onLivePromptInjected={onLivePromptInjected}
              contextStatus={contextStatus}
              contextLoading={contextLoading}
              onCompact={triggerCompact}
              isCompacting={isCompacting}
            />
          </div>
        </GalleryWrapper>
      </ThreadPrimitive.Root>
    </TooltipProvider>
  );
};
