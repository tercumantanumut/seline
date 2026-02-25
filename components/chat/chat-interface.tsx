"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type MutableRefObject, type FC } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Thread } from "@/components/assistant-ui/thread";
import { ChatProvider, useChatSetMessages } from "@/components/chat-provider";
import { CharacterProvider, type CharacterDisplayData } from "@/components/assistant-ui/character-context";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { resilientFetch, resilientPost } from "@/lib/utils/resilient-fetch";
import type { TaskEvent, TaskStatus } from "@/lib/background-tasks/types";
import { useUnifiedTasksStore } from "@/lib/stores/unified-tasks-store";
import { CharacterSidebar } from "@/components/chat/chat-sidebar";
import { WorkspaceIndicator } from "@/components/workspace/workspace-indicator";
import { DiffReviewPanel } from "@/components/workspace/diff-review-panel";
import { getWorkspaceInfo } from "@/lib/workspace/types";
import type { UIMessage } from "ai";
import type { ChatInterfaceProps, ActiveRunState, SessionState, ActiveRunLookupResponse } from "@/components/chat/chat-interface-types";

/** Bridge component: lives inside ChatProvider to pipe setMessages out via ref */
const ChatSetMessagesBridge: FC<{ setMessagesRef: MutableRefObject<((msgs: UIMessage[]) => void) | null> }> = ({ setMessagesRef }) => {
    const setMessages = useChatSetMessages();
    useEffect(() => { setMessagesRef.current = setMessages; }, [setMessages, setMessagesRef]);
    return null;
};
import { getSessionSignature, getMessagesSignature } from "@/components/chat/chat-interface-utils";
import { ChatSidebarHeader, ScheduledRunBanner } from "@/components/chat/chat-interface-parts";
import { useBackgroundProcessing, useSessionManager } from "@/components/chat/chat-interface-hooks";

export default function ChatInterface({
    character,
    initialSessionId,
    initialSessions,
    initialNextCursor,
    initialTotalSessionCount,
    initialMessages,
    characterDisplay: initialCharacterDisplay,
}: ChatInterfaceProps) {
    const router = useRouter();
    const t = useTranslations("chat");
    const tc = useTranslations("common");

    // Combined state to prevent race conditions where sessionId changes
    // but messages haven't updated yet
    const [sessionState, setSessionState] = useState<SessionState>(() => ({
        sessionId: initialSessionId,
        messages: initialMessages,
    }));
    const { sessionId, messages } = sessionState;
    const chatSetMessagesRef = useRef<((msgs: UIMessage[]) => void) | null>(null);
    const [characterDisplay, setCharacterDisplay] = useState<CharacterDisplayData>(initialCharacterDisplay);
    const [activeRun, setActiveRun] = useState<ActiveRunState | null>(null);
    const [isCancellingRun, setIsCancellingRun] = useState(false);
    const [isDiffPanelOpen, setIsDiffPanelOpen] = useState(false);

    const activeTasks = useUnifiedTasksStore((state) => state.tasks);
    const completeTask = useUnifiedTasksStore((state) => state.completeTask);
    const activeTaskForSession = sessionId
        ? activeTasks.find((task) => task.sessionId === sessionId && task.type === "scheduled")
        : undefined;

    // Stable ref-based wrappers to break the circular dependency between
    // useBackgroundProcessing (needs sm callbacks) and useSessionManager (needs bg state).
    // Using refs ensures the callbacks passed to useBackgroundProcessing never change
    // identity, keeping startPollingForCompletion stable and preventing checkActiveRun
    // from firing on every render.
    const refreshSessionTimestampRef = useRef<(id: string) => void>(() => {});
    const notifySessionUpdateRef = useRef<(id: string, data: Record<string, unknown>) => void>(() => {});
    const stableRefreshSessionTimestamp = useCallback((id: string) => refreshSessionTimestampRef.current(id), []);
    const stableNotifySessionUpdate = useCallback((id: string, data: Record<string, unknown>) => notifySessionUpdateRef.current(id, data), []);

    // ── Background processing (polling, refresh, cancel) ──
    const bg = useBackgroundProcessing({
        sessionId,
        refreshSessionTimestamp: stableRefreshSessionTimestamp,
        notifySessionUpdate: stableNotifySessionUpdate,
        setSessionState,
        chatSetMessagesRef,
    });

    // ── Session CRUD & list management ──
    const sm = useSessionManager({
        character,
        initialNextCursor,
        initialSessions,
        sessionId,
        setSessionState,
        pollingIntervalRef: bg.pollingIntervalRef,
        setIsProcessingInBackground: bg.setIsProcessingInBackground,
        setProcessingRunId: bg.setProcessingRunId,
        setIsZombieRun: bg.setIsZombieRun,
        setIsCancellingBackgroundRun: bg.setIsCancellingBackgroundRun,
    });

    // Wire up refs to real implementations now that sm is initialized
    refreshSessionTimestampRef.current = sm.refreshSessionTimestamp;
    notifySessionUpdateRef.current = sm.notifySessionUpdate;

    const isChannelSession = Boolean(
        useMemo(
            () => sm.sessions.find((session) => session.id === sessionId)?.metadata,
            [sm.sessions, sessionId]
        )?.channelType
    );

    const currentWorkspaceInfo = useMemo(() => {
        const session = sm.sessions.find((s) => s.id === sessionId);
        const metadata = session?.metadata as Record<string, unknown> | undefined;
        return metadata ? getWorkspaceInfo(metadata) : null;
    }, [sm.sessions, sessionId]);

    const adaptivePollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const adaptivePollBackoffRef = useRef(5000);
    const isPollingRef = useRef(false);
    const lastProgressTimeRef = useRef<number>(0);
    const lastSessionSignatureRef = useRef<string>(getMessagesSignature(initialMessages));
    const sessionListSignatureRef = useRef<string>(sm.sessions.map(getSessionSignature).join("||"));
    const reloadDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const PROGRESS_THROTTLE_MS = 2500;

    // Sync server-provided initial data when props change
    useEffect(() => {
        if (initialSessionId && initialSessionId !== sessionState.sessionId) {
            setSessionState({ sessionId: initialSessionId, messages: initialMessages });
            lastSessionSignatureRef.current = getMessagesSignature(initialMessages);
        }
    }, [initialSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

    const reloadSessionMessages = useCallback(async (
        targetSessionId: string,
        options?: { remount?: boolean }
    ) => {
        const uiMessages = await sm.fetchSessionMessages(targetSessionId);
        if (!uiMessages) return;
        if (sessionId && sessionId !== targetSessionId) return;
        const nextSignature = getMessagesSignature(uiMessages);
        if (nextSignature === lastSessionSignatureRef.current) return;
        setSessionState((prev) => {
            if (prev.sessionId !== targetSessionId) return prev;
            return { sessionId: targetSessionId, messages: uiMessages };
        });
        // Update thread in-place via AI SDK setMessages (no remount needed)
        if (chatSetMessagesRef.current) {
            chatSetMessagesRef.current(uiMessages);
        }
        lastSessionSignatureRef.current = nextSignature;
        sm.refreshSessionTimestamp(targetSessionId);
    }, [sm.fetchSessionMessages, sm.refreshSessionTimestamp, sessionId]);

    // ── Reusable active-run checker ──────────────────────────────────────────
    // Extracted so it can be called on mount, visibility change, AND SSE reconnect.
    const checkActiveRunRef = useRef<() => Promise<void>>(() => Promise.resolve());
    const checkActiveRunCancelledRef = useRef(false);

    useEffect(() => {
        checkActiveRunRef.current = async () => {
            const { data, error } = await resilientFetch<ActiveRunLookupResponse>(
                `/api/sessions/${sessionId}/active-run`,
                { retries: 0 }
            );
            if (checkActiveRunCancelledRef.current) return;
            if (error || !data) {
                if (error) console.error("[Background Processing] Failed to check active run:", error);
                return;
            }

            const backgroundRunId = data.hasActiveRun
                ? data.runId ?? null
                : (data.latestDeepResearchStatus === "running" ? data.latestDeepResearchRunId ?? null : null);

            if (backgroundRunId) {
                console.log("[Background Processing] Detected active run:", backgroundRunId);
                bg.setIsProcessingInBackground(true);
                bg.setProcessingRunId(backgroundRunId);
                bg.startPollingForCompletion(backgroundRunId);
                void reloadSessionMessages(sessionId, { remount: true });
            } else {
                bg.setIsProcessingInBackground(false);
                bg.setProcessingRunId(null);
                bg.setIsZombieRun(false);
            }
        };
    });

    // Check for active run on mount and when sessionId changes
    useEffect(() => {
        checkActiveRunCancelledRef.current = false;
        if (sessionId) void checkActiveRunRef.current();
        return () => {
            checkActiveRunCancelledRef.current = true;
            if (bg.pollingIntervalRef.current) {
                clearInterval(bg.pollingIntervalRef.current);
                bg.pollingIntervalRef.current = null;
            }
        };
    }, [sessionId, bg.startPollingForCompletion]);

    useEffect(() => {
        if (!bg.processingRunId || !sessionId) return;
        if (!bg.pollingIntervalRef.current) {
            bg.startPollingForCompletion(bg.processingRunId);
        }
    }, [bg.processingRunId, sessionId, bg.startPollingForCompletion]);

    // ── Visibility change: re-check active run (not just restart existing polling) ──
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleVisibility = () => {
            if (document.visibilityState !== "visible" || !sessionId) return;
            if (bg.processingRunId) {
                // Already tracking a run — restart polling + refresh messages
                bg.startPollingForCompletion(bg.processingRunId);
                void reloadSessionMessages(sessionId, { remount: true });
            } else {
                // No known run — check server for any active run we missed
                void checkActiveRunRef.current();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [bg.processingRunId, reloadSessionMessages, sessionId, bg.startPollingForCompletion]);

    // ── SSE reconnect bridge: re-check when task store reconciles ──
    useEffect(() => {
        if (typeof window === "undefined" || !sessionId) return;
        const handleReconciled = () => {
            if (!bg.processingRunId) {
                void checkActiveRunRef.current();
            }
        };
        window.addEventListener("sse-tasks-reconciled", handleReconciled);
        return () => window.removeEventListener("sse-tasks-reconciled", handleReconciled);
    }, [sessionId, bg.processingRunId]);

    // ── Zustand task store bridge: catch tasks that arrived via SSE ──
    // If the unified store has a running task for this session but we don't
    // know about it yet (processingRunId is null), trigger a server check.
    const storeCheckDebounceRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (!sessionId || bg.processingRunId) return;
        const activeTask = activeTasks.find(
            (t) => t.sessionId === sessionId && t.status === "running"
        );
        if (!activeTask) return;
        // Debounce to avoid racing with foreground useChat streams that also
        // register tasks momentarily. If the task persists for >1.5s, it's background.
        if (storeCheckDebounceRef.current) clearTimeout(storeCheckDebounceRef.current);
        storeCheckDebounceRef.current = setTimeout(() => {
            storeCheckDebounceRef.current = null;
            // Re-check: task might have completed during the debounce window
            const stillActive = useUnifiedTasksStore.getState().tasks.find(
                (t) => t.sessionId === sessionId && t.status === "running"
            );
            if (stillActive && !bg.processingRunId) {
                console.log("[Background Processing] Detected active task from store:", stillActive.runId);
                void checkActiveRunRef.current();
            }
        }, 1500);
        return () => {
            if (storeCheckDebounceRef.current) {
                clearTimeout(storeCheckDebounceRef.current);
                storeCheckDebounceRef.current = null;
            }
        };
    }, [activeTasks, sessionId, bg.processingRunId]);

    useEffect(() => {
        if (activeTaskForSession?.type === "scheduled") {
            setActiveRun({
                runId: activeTaskForSession.runId,
                taskName: activeTaskForSession.taskName || t("scheduledRun.backgroundTask"),
                startedAt: activeTaskForSession.startedAt,
            });
        } else {
            setActiveRun(null);
        }
    }, [activeTaskForSession]);

    useEffect(() => {
        if (!activeTaskForSession?.runId) return;
        let isCancelled = false;
        let interval: NodeJS.Timeout | null = null;
        const pollRunStatus = async () => {
            try {
                const { data, error } = await resilientFetch<{ status: TaskStatus; completedAt?: string; durationMs?: number }>(
                    `/api/schedules/runs/${activeTaskForSession.runId}/status`,
                    { retries: 0 }
                );
                if (error || !data || isCancelled) return;
                if (!["pending", "queued", "running"].includes(data.status)) {
                    completeTask({
                        ...activeTaskForSession,
                        status: data.status,
                        completedAt: data.completedAt ?? new Date().toISOString(),
                        durationMs: data.durationMs ?? activeTaskForSession.durationMs,
                    });
                    setActiveRun(null);
                    if (interval) { clearInterval(interval); interval = null; }
                }
            } catch (error) {
                console.error("[Scheduled Run] Status polling error:", error);
            }
        };
        pollRunStatus();
        interval = setInterval(pollRunStatus, 5000);
        return () => {
            isCancelled = true;
            if (interval) clearInterval(interval);
        };
    }, [activeTaskForSession, completeTask]);

    const handleCancelRun = useCallback(async () => {
        if (!activeRun || !sessionId) return;
        setIsCancellingRun(true);
        try {
            const { error } = await resilientPost(`/api/schedules/runs/${activeRun.runId}/cancel`, {});
            if (error) throw new Error("Failed to cancel run");
            const { toast } = await import("sonner");
            toast.success(t("scheduledRun.cancelled"));
            setActiveRun(null);
        } catch (err) {
            console.error("Failed to cancel scheduled run:", err);
            const { toast } = await import("sonner");
            toast.error(t("scheduledRun.cancelError"));
        } finally {
            setIsCancellingRun(false);
        }
    }, [activeRun, sessionId, t]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const isBackgroundTask = (task: Parameters<typeof bg.setIsProcessingInBackground>[0] extends boolean ? never : any) =>
            task.type === "scheduled" ||
            (task.type === "chat" && task.metadata && typeof task.metadata === "object" && "isDelegation" in task.metadata);

        const handleTaskCompleted = (event: Event) => {
            const detail = (event as CustomEvent<TaskEvent>).detail;
            if (!detail) return;
            if (detail.eventType === "task:completed" && isBackgroundTask(detail.task) && detail.task.sessionId === sessionId) {
                if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
                reloadDebounceRef.current = setTimeout(() => {
                    void reloadSessionMessages(sessionId, { remount: true });
                    reloadDebounceRef.current = null;
                }, 150);
                setActiveRun((current) => {
                    if (current?.runId === detail.task.runId) return null;
                    return current;
                });
            }
            if (detail.eventType === "task:completed" && detail.task.characterId === character.id) {
                void sm.loadSessions();
            }
        };

        const handleTaskStarted = (event: Event) => {
            const detail = (event as CustomEvent<TaskEvent>).detail;
            if (!detail) return;
            if (detail.eventType === "task:started" && isBackgroundTask(detail.task) && detail.task.sessionId === sessionId) {
                setActiveRun({
                    runId: detail.task.runId,
                    taskName: "taskName" in detail.task ? detail.task.taskName : undefined,
                    startedAt: detail.task.startedAt,
                });
                void reloadSessionMessages(sessionId, { remount: true });
            }
            if (detail.eventType === "task:started" && detail.task.characterId === character.id) {
                void sm.loadSessions();
            }
        };

        window.addEventListener("background-task-completed", handleTaskCompleted);
        window.addEventListener("background-task-started", handleTaskStarted);
        return () => {
            window.removeEventListener("background-task-completed", handleTaskCompleted);
            window.removeEventListener("background-task-started", handleTaskStarted);
        };
    }, [character.id, sm.loadSessions, reloadSessionMessages, sessionId]);

    useEffect(() => {
        if (!sessionId) return;
        if (adaptivePollTimeoutRef.current) {
            clearTimeout(adaptivePollTimeoutRef.current);
            adaptivePollTimeoutRef.current = null;
        }
        if (isChannelSession || bg.isProcessingInBackground) {
            const interval = setInterval(() => {
                if (document.visibilityState !== "visible") return;
                void sm.loadSessions({ silent: true, overrideCursor: null, preserveExtra: sm.userLoadedMoreRef.current });
                void reloadSessionMessages(sessionId, { remount: true });
            }, 2500);
            return () => clearInterval(interval);
        }
        adaptivePollBackoffRef.current = 5000;
        let cancelled = false;
        const schedulePoll = () => {
            if (cancelled || isPollingRef.current) return;
            const delay = adaptivePollBackoffRef.current;
            adaptivePollTimeoutRef.current = setTimeout(async () => {
                if (cancelled || isPollingRef.current) return;
                if (document.visibilityState !== "visible") { schedulePoll(); return; }
                const previousSignature = sessionListSignatureRef.current;
                isPollingRef.current = true;
                try {
                    const success = await sm.loadSessions({ silent: true, overrideCursor: null, preserveExtra: sm.userLoadedMoreRef.current });
                    const nextSignature = sessionListSignatureRef.current;
                    if (success && previousSignature !== nextSignature) {
                        adaptivePollBackoffRef.current = 5000;
                    } else {
                        adaptivePollBackoffRef.current = Math.min(Math.floor(adaptivePollBackoffRef.current * 1.5), 60000);
                    }
                } finally {
                    isPollingRef.current = false;
                }
                schedulePoll();
            }, delay);
        };
        schedulePoll();
        return () => {
            cancelled = true;
            if (adaptivePollTimeoutRef.current) {
                clearTimeout(adaptivePollTimeoutRef.current);
                adaptivePollTimeoutRef.current = null;
            }
        };
    }, [isChannelSession, bg.isProcessingInBackground, sm.loadSessions, reloadSessionMessages, sessionId]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleTaskProgress = (event: Event) => {
            const detail = (event as CustomEvent<TaskEvent>).detail;
            if (!detail || detail.eventType !== "task:progress" || detail.sessionId !== sessionId) return;
            if (!isChannelSession && !bg.isProcessingInBackground) return;
            const now = Date.now();
            if (now - lastProgressTimeRef.current < PROGRESS_THROTTLE_MS) return;
            lastProgressTimeRef.current = now;
            void reloadSessionMessages(sessionId, { remount: true });
            if (detail.sessionId) sm.refreshSessionTimestamp(detail.sessionId);
        };
        window.addEventListener("background-task-progress", handleTaskProgress);
        return () => window.removeEventListener("background-task-progress", handleTaskProgress);
    }, [isChannelSession, bg.isProcessingInBackground, sm.refreshSessionTimestamp, reloadSessionMessages, sessionId]);

    // Global keyboard shortcut: Cmd+N / Ctrl+N → new session
    useEffect(() => {
        const handleNewSessionShortcut = (e: KeyboardEvent) => {
            const isCombo = e.metaKey ? e.metaKey && e.key === "n" : e.ctrlKey && e.key === "n";
            if (!isCombo) return;
            const tag = (document.activeElement as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
            e.preventDefault();
            void sm.createNewSession();
        };
        window.addEventListener("keydown", handleNewSessionShortcut);
        return () => window.removeEventListener("keydown", handleNewSessionShortcut);
    }, [sm.createNewSession]);

    const handleAvatarChange = useCallback((newAvatarUrl: string | null) => {
        setCharacterDisplay((prev) => ({
            ...prev,
            avatarUrl: newAvatarUrl,
            primaryImageUrl: newAvatarUrl || prev.primaryImageUrl,
        }));
    }, []);

    // Re-key only on session change. Background polling now updates the thread
    // in-place via chat.setMessages (no remount needed).
    const chatProviderKey = sessionId || "no-session";

    useEffect(() => {
        lastSessionSignatureRef.current = getMessagesSignature(messages);
    }, [messages]);

    useEffect(() => {
        sessionListSignatureRef.current = sm.sessions.map(getSessionSignature).join("||");
    }, [sm.sessions]);

    const handleSessionActivity = useCallback(() => {
        if (!sessionId) return;
        sm.refreshSessionTimestamp(sessionId);
    }, [sm.refreshSessionTimestamp, sessionId]);

    if (sm.isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">{t("loading")}</p>
                </div>
            </div>
        );
    }

    return (
        <Shell
            sidebarHeader={<ChatSidebarHeader label={tc("back")} onBack={() => router.push("/")} />}
            sidebar={
                <CharacterSidebar
                    character={character}
                    characterDisplay={characterDisplay}
                    sessions={sm.sessions}
                    currentSessionId={sessionId}
                    loadingSessions={sm.loadingSessions}
                    hasMore={sm.hasMoreSessions}
                    totalCount={sm.totalSessionCount}
                    searchQuery={sm.searchQuery}
                    channelFilter={sm.channelFilter}
                    dateRange={sm.dateRange}
                    onSearchChange={sm.setSearchQuery}
                    onChannelFilterChange={sm.setChannelFilter}
                    onDateRangeChange={sm.setDateRange}
                    onLoadMore={sm.loadMoreSessions}
                    onNewSession={sm.createNewSession}
                    onSwitchSession={sm.switchSession}
                    onDeleteSession={sm.deleteSession}
                    onResetChannelSession={sm.resetChannelSession}
                    onRenameSession={sm.renameSession}
                    onExportSession={sm.exportSession}
                    onPinSession={sm.pinSession}
                    onArchiveSession={sm.archiveSession}
                    onRestoreSession={sm.restoreSession}
                    characterId={character.id}
                    onAvatarChange={handleAvatarChange}
                />
            }
        >
            <CharacterProvider character={characterDisplay}>
                <div
                    style={{
                        opacity: bg.isChatFading ? 0 : 1,
                        transition: "opacity 150ms ease-in-out",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <ChatProvider
                        key={chatProviderKey}
                        sessionId={sessionId}
                        characterId={character.id}
                        initialMessages={messages}
                    >
                        <ChatSetMessagesBridge setMessagesRef={chatSetMessagesRef} />
                        <div className="flex h-full flex-col gap-3">
                            {currentWorkspaceInfo && (
                                <div className="flex items-center justify-end px-4 pt-2">
                                    <WorkspaceIndicator
                                        sessionId={sessionId}
                                        workspaceInfo={currentWorkspaceInfo}
                                        onOpenDiffPanel={() => setIsDiffPanelOpen(true)}
                                    />
                                </div>
                            )}
                            {activeRun && (
                                <div className="px-4 pt-2 space-y-2">
                                    <ScheduledRunBanner
                                        run={activeRun}
                                        onCancel={handleCancelRun}
                                        cancelling={isCancellingRun}
                                    />
                                </div>
                            )}
                            <Thread
                                onSessionActivity={handleSessionActivity}
                                footer={null}
                                isBackgroundTaskRunning={Boolean(activeRun || bg.isProcessingInBackground)}
                                isProcessingInBackground={bg.isProcessingInBackground}
                                sessionId={sessionId}
                                onCancelBackgroundRun={bg.handleCancelBackgroundRun}
                                isCancellingBackgroundRun={bg.isCancellingBackgroundRun}
                                canCancelBackgroundRun={Boolean(bg.processingRunId)}
                                isZombieBackgroundRun={bg.isZombieRun}
                                onLivePromptInjected={async () => {
                                    // remount:true so ChatProvider reinitialises from DB (same as background mode).
                                    // Safe here: the run has ended before this callback fires (isQueueBlocked=false).
                                    await reloadSessionMessages(sessionId ?? "", { remount: true });
                                    // Check if the run had undrained queue messages that need a new run.
                                    // Returns true → thread-composer converts injected-live chips to fallback.
                                    try {
                                        const res = await fetch(`/api/sessions/${sessionId}/consume-undrained-signal`, { method: "POST" });
                                        if (res.ok) {
                                            const data = await res.json() as { hasPending?: boolean };
                                            return data.hasPending === true;
                                        }
                                    } catch { /* non-fatal */ }
                                    return false;
                                }}
                            />
                        </div>
                    </ChatProvider>
                </div>
            </CharacterProvider>
            {currentWorkspaceInfo && (
                <DiffReviewPanel
                    sessionId={sessionId}
                    workspaceInfo={currentWorkspaceInfo}
                    isOpen={isDiffPanelOpen}
                    onClose={() => setIsDiffPanelOpen(false)}
                />
            )}
        </Shell>
    );
}
