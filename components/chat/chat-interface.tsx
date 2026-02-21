"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Thread } from "@/components/assistant-ui/thread";
import { ChatProvider } from "@/components/chat-provider";
import { CharacterProvider, type CharacterDisplayData } from "@/components/assistant-ui/character-context";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, CircleStop } from "lucide-react";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { convertDBMessagesToUIMessages } from "@/lib/messages/converter";
import { toast } from "sonner";
import { resilientFetch, resilientPost, resilientPatch, resilientDelete } from "@/lib/utils/resilient-fetch";
import type { TaskEvent, TaskStatus, UnifiedTask } from "@/lib/background-tasks/types";
import { useUnifiedTasksStore } from "@/lib/stores/unified-tasks-store";
import { useSessionSync } from "@/lib/hooks/use-session-sync";
import { CharacterSidebar } from "@/components/chat/chat-sidebar";
import type { SessionInfo, SessionChannelType } from "@/components/chat/chat-sidebar/types";
import { useSessionSyncNotifier } from "@/lib/hooks/use-session-sync";
import {
    useSessionSyncStore,
    sessionInfoArrayToSyncData,
} from "@/lib/stores/session-sync-store";
import { WorkspaceIndicator } from "@/components/workspace/workspace-indicator";
import { DiffReviewPanel } from "@/components/workspace/diff-review-panel";
import { getWorkspaceInfo } from "@/lib/workspace/types";

interface CharacterFullData {
    id: string;
    name: string;
    displayName?: string | null;
    tagline?: string | null;
    status: string;
    voice?: {
        exampleGreeting?: string | null;
    } | null;
    images?: Array<{
        url: string;
        isPrimary: boolean;
        imageType: string;
    }>;
}

interface DBMessage {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: unknown;
    createdAt: Date | string;
}

interface ChatInterfaceProps {
    character: CharacterFullData;
    initialSessionId: string;
    initialSessions: SessionInfo[];
    initialNextCursor: string | null;
    initialTotalSessionCount: number;
    initialMessages: UIMessage[];
    characterDisplay: CharacterDisplayData;
}

const sortSessionsByUpdatedAt = (sessions: SessionInfo[]) =>
    [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

const getSessionSignature = (session: SessionInfo) =>
    [
        session.id,
        session.updatedAt,
        session.title ?? "",
        session.metadata?.channelType ?? "",
        session.metadata?.channelPeerId ?? "",
        session.metadata?.channelPeerName ?? "",
    ].join("|");

const areSessionsEquivalent = (prev: SessionInfo[], next: SessionInfo[]) => {
    if (prev.length !== next.length) {
        return false;
    }
    for (let index = 0; index < prev.length; index += 1) {
        if (getSessionSignature(prev[index]) !== getSessionSignature(next[index])) {
            return false;
        }
    }
    return true;
};

const isTextPart = (part: UIMessage["parts"][number] | undefined | null): part is { type: "text"; text: string } => {
    return Boolean(
        part &&
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    );
};

const getMessageSignature = (message: UIMessage) => {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const partTypes = parts.map((part) => (part?.type ? String(part.type) : "text")).join(",");
    const textDigest = parts
        .filter(isTextPart)
        .map((part) => {
            const text = part.text || "";
            return `${text.length}:${text.slice(0, 80)}`;
        })
        .join("|");
    return `${message.id || ""}:${message.role}:${partTypes}:${textDigest}`;
};

const getMessagesSignature = (messages: UIMessage[]) => {
    if (!messages.length) {
        return "0";
    }
    const lastMessage = messages[messages.length - 1];
    return `${messages.length}:${getMessageSignature(lastMessage)}`;
};

// Combined state to ensure sessionId and messages always update atomically
interface SessionState {
    sessionId: string;
    messages: UIMessage[];
}

interface ActiveRunState {
    runId: string;
    taskName?: string;
    startedAt: string;
}

type ChannelFilter = "all" | SessionChannelType;
type DateRangeFilter = "all" | "today" | "week" | "month";

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

    // Use combined state to prevent race conditions where sessionId changes
    // but messages haven't updated yet, causing the ChatProvider to remount
    // with stale message data (fixes intermittent last message not displaying)
    const [sessionState, setSessionState] = useState<SessionState>(() => ({
        sessionId: initialSessionId,
        messages: initialMessages,
    }));
    const { sessionId, messages } = sessionState;
    // Sort initialSessions to ensure consistent ordering (most recent first)
    const [sessions, setSessions] = useState<SessionInfo[]>(() => sortSessionsByUpdatedAt(initialSessions));
    const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
    const [hasMoreSessions, setHasMoreSessions] = useState(Boolean(initialNextCursor));
    const [totalSessionCount, setTotalSessionCount] = useState(initialTotalSessionCount);
    const [searchQuery, setSearchQuery] = useState("");
    const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
    const [dateRange, setDateRange] = useState<DateRangeFilter>("all");
    const [characterDisplay, setCharacterDisplay] = useState<CharacterDisplayData>(initialCharacterDisplay);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const { syncSessions, updateSession: notifySessionUpdate, notifySessionDeleted: notifySessionRemoval } = useSessionSync();
    const activeTasks = useUnifiedTasksStore((state) => state.tasks);
    const completeTask = useUnifiedTasksStore((state) => state.completeTask);
    const activeTaskForSession = sessionId
        ? activeTasks.find((task) => task.sessionId === sessionId && task.type === "scheduled")
        : undefined;
    const [activeRun, setActiveRun] = useState<ActiveRunState | null>(null);
    const [isCancellingRun, setIsCancellingRun] = useState(false);
    const [isCancellingBackgroundRun, setIsCancellingBackgroundRun] = useState(false);
    const [isProcessingInBackground, setIsProcessingInBackground] = useState(false);
    const [processingRunId, setProcessingRunId] = useState<string | null>(null);
    const [isZombieRun, setIsZombieRun] = useState(false);
    const [backgroundRefreshCounter, setBackgroundRefreshCounter] = useState(0);
    const [isChatFading, setIsChatFading] = useState(false);
    const activeSessionMeta = useMemo(
        () => sessions.find((session) => session.id === sessionId)?.metadata,
        [sessions, sessionId]
    );
    const isChannelSession = Boolean(activeSessionMeta?.channelType);
    const currentWorkspaceInfo = useMemo(() => {
        const session = sessions.find((s) => s.id === sessionId);
        const metadata = session?.metadata as Record<string, unknown> | undefined;
        return metadata ? getWorkspaceInfo(metadata) : null;
    }, [sessions, sessionId]);
    const [isDiffPanelOpen, setIsDiffPanelOpen] = useState(false);

    // Refs for debouncing and memoization to prevent UI flashing
    const reloadDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const adaptivePollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const adaptivePollBackoffRef = useRef(5000);
    const nextCursorRef = useRef<string | null>(initialNextCursor);
    const userLoadedMoreRef = useRef(false);
    const filterKeyRef = useRef(`${searchQuery}|${channelFilter}|${dateRange}`);
    const isPollingRef = useRef(false);
    const lastProgressTimeRef = useRef<number>(0);
    const lastSessionSignatureRef = useRef<string>(getMessagesSignature(initialMessages));
    const sessionListSignatureRef = useRef<string>(sessions.map(getSessionSignature).join("||"));
    const PROGRESS_THROTTLE_MS = 2500; // Background/live refresh cadence target

    // Keep refs of filters to prevent loadSessions from changing when filters change
    // This prevents the filter change useEffect from running unnecessarily
    const filtersRef = useRef({ searchQuery, channelFilter, dateRange });
    filtersRef.current = { searchQuery, channelFilter, dateRange };

    // Session sync for cross-component synchronization
    const sessionSyncNotifier = useSessionSyncNotifier();
    const setSyncSessions = useSessionSyncStore((state) => state.setSessions);

    // Sync sessions to global store whenever local sessions change
    useEffect(() => {
        if (sessions.length > 0) {
            setSyncSessions(sessionInfoArrayToSyncData(sessions), character.id);
        }
    }, [sessions, character.id, setSyncSessions]);

    // Sync server-provided initial data when props change (e.g., after navigation)
    // This handles the case where the component is reused but props are different
    useEffect(() => {
        // Only update if the sessionId from props is different from current state
        // This prevents unnecessary updates when user has manually switched sessions
        if (initialSessionId && initialSessionId !== sessionState.sessionId) {
            setSessionState({
                sessionId: initialSessionId,
                messages: initialMessages,
            });
            lastSessionSignatureRef.current = getMessagesSignature(initialMessages);
        }
    }, [initialSessionId]); // Only depend on initialSessionId to avoid infinite loops

    const refreshSessionTimestamp = useCallback((targetSessionId: string) => {
        const nextUpdatedAt = new Date().toISOString();
        
        // Notify global store
        notifySessionUpdate(targetSessionId, { updatedAt: nextUpdatedAt });

        setSessions((prev) => {
            let updated = false;
            const next = prev.map((session) => {
                if (session.id !== targetSessionId) {
                    return session;
                }
                updated = true;
                return { ...session, updatedAt: nextUpdatedAt };
            });
            if (!updated) {
                return prev;
            }
            return sortSessionsByUpdatedAt(next);
        });
    }, []);

    const loadSessions = useCallback(async (options?: {
        silent?: boolean;
        append?: boolean;
        overrideCursor?: string | null;
        preserveExtra?: boolean;
    }) => {
        const silent = options?.silent ?? false;
        const append = options?.append ?? false;
        const preserveExtra = options?.preserveExtra ?? false;
        const cursor = options?.overrideCursor !== undefined
            ? options.overrideCursor
            : (append ? nextCursorRef.current : null);

        try {
            if (!silent) {
                setLoadingSessions(true);
            }

            const { searchQuery, channelFilter, dateRange } = filtersRef.current;

            const params = new URLSearchParams({
                characterId: character.id,
                limit: "20",
            });
            if (cursor) {
                params.set("cursor", cursor);
            }
            if (searchQuery.trim()) {
                params.set("search", searchQuery.trim());
            }
            if (channelFilter !== "all") {
                params.set("channelType", channelFilter);
            }
            if (dateRange !== "all") {
                params.set("dateRange", dateRange);
            }

            const { data, error } = await resilientFetch<{ sessions: SessionInfo[]; nextCursor?: string; totalCount?: number }>(
                `/api/sessions?${params.toString()}`,
                { retries: 0 }
            );
            if (error || !data) {
                return false;
            }

            const pageSessions = sortSessionsByUpdatedAt((data.sessions || []) as SessionInfo[]);
            
            // Sync loaded sessions with global store
            syncSessions(pageSessions);

            setSessions((prev) => {
                if (!append) {
                    if (preserveExtra && prev.length > pageSessions.length) {
                        // User has loaded more pages — merge fresh page-1 data without
                        // truncating the extra sessions they loaded.
                        const freshById = new Map(pageSessions.map((s) => [s.id, s]));
                        const prevIds = new Set(prev.map((s) => s.id));
                        const newOnes = pageSessions.filter((s) => !prevIds.has(s.id));
                        const refreshed = prev.map((s) => freshById.get(s.id) ?? s);
                        return sortSessionsByUpdatedAt([...newOnes, ...refreshed]);
                    }
                    return areSessionsEquivalent(prev, pageSessions) ? prev : pageSessions;
                }
                const existingIds = new Set(prev.map((session) => session.id));
                const merged = [...prev, ...pageSessions.filter((session) => !existingIds.has(session.id))];
                return sortSessionsByUpdatedAt(merged);
            });
            // When preserveExtra, keep the existing cursor/hasMore so "Load more"
            // continues working from where the user left off.
            if (!preserveExtra) {
                nextCursorRef.current = data.nextCursor ?? null;
                setNextCursor(data.nextCursor ?? null);
                setHasMoreSessions(Boolean(data.nextCursor));
            }
            setTotalSessionCount(typeof data.totalCount === "number" ? data.totalCount : pageSessions.length);
            return true;
        } catch (err) {
            console.error("Failed to load sessions:", err);
            return false;
        } finally {
            if (!silent) {
                setLoadingSessions(false);
            }
        }
    }, [character.id]);

    const fetchSessionMessages = useCallback(async (targetSessionId: string) => {
        const { data, error } = await resilientFetch<{ messages: DBMessage[] }>(
            `/api/sessions/${targetSessionId}`,
            { retries: 0 }
        );
        if (error || !data) {
            if (error) {
                console.error("Failed to fetch session messages:", error);
            }
            return null;
        }
        const dbMessages = (data.messages || []) as DBMessage[];
        return convertDBMessagesToUIMessages(dbMessages);
    }, []);

    const loadMoreSessions = useCallback(async () => {
        if (!hasMoreSessions || loadingSessions) {
            return;
        }
        userLoadedMoreRef.current = true;
        await loadSessions({ append: true });
    }, [hasMoreSessions, loadingSessions, loadSessions]);

    useEffect(() => {
        const filterKey = `${searchQuery}|${channelFilter}|${dateRange}`;
        if (filterKey === filterKeyRef.current) {
            return;
        }
        filterKeyRef.current = filterKey;
        userLoadedMoreRef.current = false;
        nextCursorRef.current = null;
        setNextCursor(null);
        setHasMoreSessions(true);
        const timeout = setTimeout(() => {
            void loadSessions({ overrideCursor: null });
        }, 250);
        return () => clearTimeout(timeout);
    }, [searchQuery, channelFilter, dateRange, loadSessions]);

    const reloadSessionMessages = useCallback(async (
        targetSessionId: string,
        options?: { remount?: boolean }
    ) => {
        const uiMessages = await fetchSessionMessages(targetSessionId);
        if (!uiMessages) return;
        if (sessionId && sessionId !== targetSessionId) {
            return;
        }
        const nextSignature = getMessagesSignature(uiMessages);
        if (nextSignature === lastSessionSignatureRef.current) {
            return;
        }

        setSessionState((prev) => {
            if (prev.sessionId !== targetSessionId) {
                return prev;
            }
            return { sessionId: targetSessionId, messages: uiMessages };
        });
        if (options?.remount) {
            setBackgroundRefreshCounter((prev) => prev + 1);
        }
        lastSessionSignatureRef.current = nextSignature;
        refreshSessionTimestamp(targetSessionId);
    }, [fetchSessionMessages, refreshSessionTimestamp, sessionId]);

    // Refresh messages when background processing completes
    const refreshMessages = useCallback(async () => {
        console.log("[Background Processing] Fetching updated messages for session:", sessionId);
        const { data, error, status } = await resilientFetch<{ messages: DBMessage[] }>(
            `/api/sessions/${sessionId}/messages`,
            { retries: 0 }
        );
        if (error || !data) {
            console.error("[Background Processing] Failed to fetch messages:", status, error);
            return;
        }
        console.log("[Background Processing] Received messages:", data.messages?.length || 0);
        const uiMessages = convertDBMessagesToUIMessages(data.messages);

        lastSessionSignatureRef.current = getMessagesSignature(uiMessages);
        refreshSessionTimestamp(sessionId);

        // Update global store with new message count and timestamp
        notifySessionUpdate(sessionId, {
            updatedAt: new Date().toISOString(),
            messageCount: data.messages?.length || 0
        });

        // Fade out → update messages → remount ChatProvider → fade in.
        // flushSync ensures the opacity-0 class is committed and painted before
        // we start the timer, giving the CSS transition time to complete.
        flushSync(() => setIsChatFading(true));
        await new Promise<void>(resolve => setTimeout(resolve, 150));

        // Swap messages and remount in a single flush so the new ChatProvider
        // renders immediately at opacity-0 (isChatFading still true).
        flushSync(() => {
            setSessionState(prev => ({ ...prev, messages: uiMessages }));
            setBackgroundRefreshCounter(prev => prev + 1);
        });

        // Let the new tree paint one frame, then fade in.
        requestAnimationFrame(() => setIsChatFading(false));

        console.log("[Background Processing] Messages updated successfully, triggering UI refresh");
    }, [sessionId, refreshSessionTimestamp]);

    // Poll for completion of background processing
    // No hard timeout — uses zombie detection instead to handle truly stuck runs.
    // SSE task:completed is the authoritative termination signal.
    const startPollingForCompletion = useCallback((runId: string) => {
        // Clear any existing polling interval
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }

        setIsZombieRun(false);
        const pollIntervalMs = 2000;

        pollingIntervalRef.current = setInterval(async () => {
            try {
                const { data, error } = await resilientFetch<{ status: string; isZombie?: boolean }>(
                    `/api/agent-runs/${runId}/status`,
                    { retries: 0 }
                );
                if (error || !data) {
                    console.error("[Background Processing] Polling error:", error);
                    return; // Continue polling on error (network might recover)
                }

                if (data.status === "running") {
                    setIsZombieRun(Boolean(data.isZombie));
                    // If zombie detected, stop polling — SSE or user action will handle cleanup
                    if (data.isZombie) {
                        console.warn("[Background Processing] Zombie run detected, stopping polling");
                        if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current);
                            pollingIntervalRef.current = null;
                        }
                        return;
                    }
                    // Don't remount ChatProvider every poll tick — it causes a full
                    // DOM teardown every 2 s while the user may be typing.
                    // The completion path handles the final message refresh.
                    return;
                }

                // Run completed - fetch updated messages
                console.log("[Background Processing] Run completed with status:", data.status);
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
                setIsProcessingInBackground(false);
                setProcessingRunId(null);
                setIsZombieRun(false);
                await refreshMessages();
            } catch (error) {
                console.error("[Background Processing] Polling error:", error);
                // Continue polling on error (network might recover)
            }
        }, pollIntervalMs);
    }, [refreshMessages, reloadSessionMessages, sessionId]);

    // Check for active run on mount and when sessionId changes
    useEffect(() => {
        let cancelled = false;

        async function checkActiveRun() {
            const { data, error } = await resilientFetch<{ hasActiveRun: boolean; runId?: string }>(
                `/api/sessions/${sessionId}/active-run`,
                { retries: 0 }
            );
            if (cancelled) return;
            if (error || !data) {
                if (error) {
                    console.error("[Background Processing] Failed to check active run:", error);
                }
                return;
            }
            if (cancelled) return;
            if (data.hasActiveRun) {
                console.log("[Background Processing] Detected active run:", data.runId);
                setIsProcessingInBackground(true);
                setProcessingRunId(data.runId!);
                startPollingForCompletion(data.runId!);
                void reloadSessionMessages(sessionId, { remount: true });
            } else {
                // No active run on this session — clear any stale state
                setIsProcessingInBackground(false);
                setProcessingRunId(null);
                setIsZombieRun(false);
            }
        }

        if (sessionId) {
            checkActiveRun();
        }

        // Cleanup polling on unmount or session change
        return () => {
            cancelled = true;
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, [sessionId, startPollingForCompletion]);

    useEffect(() => {
        if (!processingRunId || !sessionId) {
            return;
        }

        if (!pollingIntervalRef.current) {
            startPollingForCompletion(processingRunId);
        }
    }, [processingRunId, sessionId, startPollingForCompletion]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const handleVisibility = () => {
            if (document.visibilityState !== "visible") {
                return;
            }
            if (processingRunId && sessionId) {
                startPollingForCompletion(processingRunId);
                void reloadSessionMessages(sessionId, { remount: true });
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [processingRunId, reloadSessionMessages, sessionId, startPollingForCompletion]);

    useEffect(() => {
        if (activeTaskForSession?.type === "scheduled") {
            setActiveRun({
                runId: activeTaskForSession.runId,
                taskName: activeTaskForSession.taskName || "Scheduled task",
                startedAt: activeTaskForSession.startedAt,
            });
        } else {
            setActiveRun(null);
        }
    }, [activeTaskForSession]);

    useEffect(() => {
        if (!activeTaskForSession?.runId) {
            return;
        }

        let isCancelled = false;
        let interval: NodeJS.Timeout | null = null;

        const pollRunStatus = async () => {
            try {
                const { data, error } = await resilientFetch<{ status: TaskStatus; completedAt?: string; durationMs?: number }>(
                    `/api/schedules/runs/${activeTaskForSession.runId}/status`,
                    { retries: 0 }
                );
                if (error || !data) {
                    return;
                }
                if (isCancelled) return;

                if (!["pending", "queued", "running"].includes(data.status)) {
                    completeTask({
                        ...activeTaskForSession,
                        status: data.status,
                        completedAt: data.completedAt ?? new Date().toISOString(),
                        durationMs: data.durationMs ?? activeTaskForSession.durationMs,
                    });
                    setActiveRun(null);
                    if (interval) {
                        clearInterval(interval);
                        interval = null;
                    }
                }
            } catch (error) {
                console.error("[Scheduled Run] Status polling error:", error);
            }
        };

        pollRunStatus();
        interval = setInterval(pollRunStatus, 5000);

        return () => {
            isCancelled = true;
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [activeTaskForSession, completeTask]);

    const switchSession = useCallback(
        async (newSessionId: string) => {
            try {
                setIsLoading(true);

                // Eagerly clear background processing state from the previous session.
                // The checkActiveRun effect will re-enable it if the *new* session has one.
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
                
                // Only clear LOCAL state — the old session's run may still be active.
                // The SSE task:completed event will clear session-sync-store when it truly completes.
                setIsProcessingInBackground(false);
                setProcessingRunId(null);
                setActiveRun(null);
                setIsZombieRun(false);
                setIsCancellingBackgroundRun(false);

                const uiMessages = await fetchSessionMessages(newSessionId);
                if (!uiMessages) return;
                setSessionState({
                    sessionId: newSessionId,
                    messages: uiMessages,
                });
                router.replace(`/chat/${character.id}?sessionId=${newSessionId}`, { scroll: false });
            } catch (err) {
                console.error("Failed to switch session:", err);
            } finally {
                setIsLoading(false);
            }
        },
        [character.id, router, fetchSessionMessages, refreshSessionTimestamp, sessionId, processingRunId, sessionSyncNotifier]
    );

    const createNewSession = useCallback(
        async () => {
            try {
                setIsLoading(true);
                const { data: createData, error } = await resilientPost<{ session: SessionInfo }>(
                    "/api/sessions",
                    { forceNew: true, metadata: { characterId: character.id, characterName: character.name } }
                );
                if (!error && createData) {
                    const { session } = createData;

                    // Clear background processing state from the previous session
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                    
                    // Only clear LOCAL state — the old session's run may still be active.
                    // The SSE task:completed event will clear session-sync-store when it truly completes.
                    setIsProcessingInBackground(false);
                    setProcessingRunId(null);
                    setActiveRun(null);
                    setIsZombieRun(false);
                    setIsCancellingBackgroundRun(false);

                    // CRITICAL: Update sessionId and messages atomically
                    setSessionState({
                        sessionId: session.id,
                        messages: [],
                    });
                    
                    // Sync new session to global store
                    syncSessions([session]);
                    
                    await loadSessions();
                    router.replace(`/chat/${character.id}?sessionId=${session.id}`, { scroll: false });
                }
            } catch (err) {
                console.error("Failed to create new session:", err);
            } finally {
                setIsLoading(false);
            }
        },
        [character.id, character.name, loadSessions, router]
    );

    // Global keyboard shortcut: Cmd+N (Mac) / Ctrl+N (Win/Linux) → new session
    useEffect(() => {
        const handleNewSessionShortcut = (e: KeyboardEvent) => {
            const isCombo = e.metaKey ? e.metaKey && e.key === "n" : e.ctrlKey && e.key === "n";
            if (!isCombo) return;
            // Don't intercept when an input/textarea is focused (let browser handle)
            const tag = (document.activeElement as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
            e.preventDefault();
            void createNewSession();
        };
        window.addEventListener("keydown", handleNewSessionShortcut);
        return () => window.removeEventListener("keydown", handleNewSessionShortcut);
    }, [createNewSession]);

    const resetChannelSession = useCallback(
        async (sessionToResetId: string, options?: { archiveOld?: boolean }) => {
            try {
                setIsLoading(true);
                const { data, error } = await resilientPost<{ session: { id: string } }>(
                    `/api/sessions/${sessionToResetId}/reset-channel`,
                    { archiveOld: options?.archiveOld ?? false }
                );
                if (error || !data) {
                    throw new Error("Failed to reset channel session");
                }
                const { session } = data;
                if (session?.id) {
                    await loadSessions();
                    await switchSession(session.id);
                }
            } catch (err) {
                console.error("Failed to reset channel session:", err);
                toast.error(t("channelSession.resetError"));
            } finally {
                setIsLoading(false);
            }
        },
        [loadSessions, switchSession, t]
    );

    const deleteSession = useCallback(
        async (sessionToDeleteId: string) => {
            try {
                const { error } = await resilientDelete(`/api/sessions/${sessionToDeleteId}`);
                if (!error) {
                    notifySessionRemoval(sessionToDeleteId);
                    if (sessionToDeleteId === sessionId) {
                        const remainingSessions = sessions.filter((s) => s.id !== sessionToDeleteId);
                        if (remainingSessions.length > 0) {
                            await switchSession(remainingSessions[0].id);
                        } else {
                            await createNewSession();
                        }
                    }
                    await loadSessions();
                }
            } catch (err) {
                console.error("Failed to delete session:", err);
            }
        },
        [sessionId, sessions, switchSession, createNewSession, loadSessions]
    );

    const handleCancelRun = useCallback(async () => {
        if (!activeRun || !sessionId) {
            return;
        }
        setIsCancellingRun(true);
        try {
            const { error } = await resilientPost(`/api/schedules/runs/${activeRun.runId}/cancel`, {});
            if (error) {
                throw new Error("Failed to cancel run");
            }
            toast.success(t("scheduledRun.cancelled"));
            setActiveRun(null);
        } catch (err) {
            console.error("Failed to cancel scheduled run:", err);
            toast.error(t("scheduledRun.cancelError"));
        } finally {
            setIsCancellingRun(false);
        }
    }, [activeRun, sessionId, t]);

    const handleCancelBackgroundRun = useCallback(async () => {
        const runId = processingRunId;
        if (!runId) {
            return;
        }
        setIsCancellingBackgroundRun(true);
        try {
            const result = await resilientFetch<{ status?: string }>(
                `/api/agent-runs/${runId}/cancel`,
                { method: "POST", headers: { "Content-Type": "application/json" }, retries: 0 }
            );
            if (result.error) {
                // 409 Conflict means the run already finished — treat as cancelled
                const shouldTreatAsCancelled = result.status === 409;
                if (!shouldTreatAsCancelled) {
                    throw new Error("Failed to cancel run");
                }
            }
            toast.success(t("backgroundRun.cancelled"));
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
            setIsProcessingInBackground(false);
            setProcessingRunId(null);
            setIsZombieRun(false);
            await refreshMessages();
        } catch (err) {
            console.error("Failed to cancel background run:", err);
            toast.error(t("backgroundRun.cancelError"));
        } finally {
            setIsCancellingBackgroundRun(false);
        }
    }, [processingRunId, refreshMessages, t]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const isBackgroundTask = (task: UnifiedTask) =>
            task.type === "scheduled" ||
            (task.type === "chat" && task.metadata && typeof task.metadata === "object" && "isDelegation" in task.metadata);

        const handleTaskCompleted = (event: Event) => {
            const detail = (event as CustomEvent<TaskEvent>).detail;
            if (!detail) return;

            if (detail.eventType === "task:completed" && isBackgroundTask(detail.task) && detail.task.sessionId === sessionId) {
                // Debounce the reload to allow final progress update to settle
                if (reloadDebounceRef.current) {
                    clearTimeout(reloadDebounceRef.current);
                }

                reloadDebounceRef.current = setTimeout(() => {
                    void reloadSessionMessages(sessionId, { remount: true });
                    reloadDebounceRef.current = null;
                }, 150); // Small delay to let final state settle

                setActiveRun((current) => {
                    if (current?.runId === detail.task.runId) {
                        return null;
                    }
                    return current;
                });
            }

            if (detail.eventType === "task:completed" && detail.task.characterId === character.id) {
                void loadSessions();
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
                void loadSessions();
            }
        };

        window.addEventListener("background-task-completed", handleTaskCompleted);
        window.addEventListener("background-task-started", handleTaskStarted);

        return () => {
            window.removeEventListener("background-task-completed", handleTaskCompleted);
            window.removeEventListener("background-task-started", handleTaskStarted);
        };
    }, [character.id, loadSessions, reloadSessionMessages, sessionId]);

    useEffect(() => {
        if (!sessionId) {
            return;
        }

        if (adaptivePollTimeoutRef.current) {
            clearTimeout(adaptivePollTimeoutRef.current);
            adaptivePollTimeoutRef.current = null;
        }

        if (isChannelSession || isProcessingInBackground) {
            const interval = setInterval(() => {
                if (document.visibilityState !== "visible") {
                    return;
                }
                void loadSessions({ silent: true, overrideCursor: null, preserveExtra: userLoadedMoreRef.current });
                void reloadSessionMessages(sessionId, { remount: true });
            }, 2500);

            return () => clearInterval(interval);
        }

        adaptivePollBackoffRef.current = 5000;
        let cancelled = false;

        const schedulePoll = () => {
            if (cancelled || isPollingRef.current) {
                return;
            }
            const delay = adaptivePollBackoffRef.current;
            adaptivePollTimeoutRef.current = setTimeout(async () => {
                if (cancelled || isPollingRef.current) {
                    return;
                }
                if (document.visibilityState !== "visible") {
                    schedulePoll();
                    return;
                }
                const previousSignature = sessionListSignatureRef.current;
                isPollingRef.current = true;
                try {
                    const success = await loadSessions({ silent: true, overrideCursor: null, preserveExtra: userLoadedMoreRef.current });
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
    }, [isChannelSession, isProcessingInBackground, loadSessions, reloadSessionMessages, sessionId]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (reloadDebounceRef.current) {
                clearTimeout(reloadDebounceRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const handleTaskProgress = (event: Event) => {
            const detail = (event as CustomEvent<TaskEvent>).detail;
            if (!detail || detail.eventType !== "task:progress" || detail.sessionId !== sessionId) {
                return;
            }
            if (!isChannelSession && !isProcessingInBackground) {
                return;
            }
            const now = Date.now();
            if (now - lastProgressTimeRef.current < PROGRESS_THROTTLE_MS) {
                return;
            }
            lastProgressTimeRef.current = now;
            void reloadSessionMessages(sessionId, { remount: true });
            if (detail.sessionId) {
                refreshSessionTimestamp(detail.sessionId);
            }
        };

        window.addEventListener("background-task-progress", handleTaskProgress);
        return () => {
            window.removeEventListener("background-task-progress", handleTaskProgress);
        };
    }, [isChannelSession, isProcessingInBackground, refreshSessionTimestamp, reloadSessionMessages, sessionId]);

    const renameSession = useCallback(
        async (sessionToRenameId: string, newTitle: string): Promise<boolean> => {
            const trimmed = newTitle.trim();
            const normalizedTitle = trimmed.length > 0 ? trimmed : null;
            const optimisticUpdatedAt = new Date().toISOString();
            let found = false;
            let changed = false;

            setSessions((prev) => {
                const next = prev.map((session) => {
                    if (session.id !== sessionToRenameId) {
                        return session;
                    }
                    found = true;
                    if (session.title === normalizedTitle) {
                        return session;
                    }
                    changed = true;
                    return { ...session, title: normalizedTitle, updatedAt: optimisticUpdatedAt };
                });

                if (!found || !changed) {
                    return prev;
                }

                return sortSessionsByUpdatedAt(next);
            });

            if (!found) {
                toast.error(tc("error"));
                await loadSessions();
                return false;
            }

            if (!changed) {
                return true;
            }
            
            // Optimistic update to global store
            notifySessionUpdate(sessionToRenameId, { title: normalizedTitle, updatedAt: optimisticUpdatedAt });

            try {
                const { error } = await resilientPatch(`/api/sessions/${sessionToRenameId}`, { title: normalizedTitle });
                if (error) {
                    throw new Error("Failed to rename session");
                }
                return true;
            } catch (err) {
                console.error("Failed to rename session:", err);
                toast.error(tc("error"));
                await loadSessions();
                return false;
            }
        },
        [loadSessions, tc]
    );

    const exportSession = useCallback(async (
        sessionToExportId: string,
        format: "markdown" | "json" | "text"
    ) => {
        try {
            const { data, error } = await resilientFetch<{ content: string; filename: string }>(
                `/api/sessions/${sessionToExportId}/export?format=${format}`
            );
            if (error || !data) {
                throw new Error("Failed to export session");
            }
            const content = typeof data.content === "string" ? data.content : "";
            const filename = typeof data.filename === "string" ? data.filename : `session-${sessionToExportId}.${format === "markdown" ? "md" : format}`;
            const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            toast.success(t("sidebar.exportSuccess"));
        } catch (error) {
            console.error("Failed to export session:", error);
            toast.error(t("sidebar.exportError"));
        }
    }, [t]);

    const pinSession = useCallback(async (sessionToPinId: string) => {
        const currentSession = sessions.find((s) => s.id === sessionToPinId);
        const isPinned = currentSession?.metadata?.pinned === true;
        try {
            await resilientPatch(`/api/sessions/${sessionToPinId}`, {
                metadata: { pinned: !isPinned },
            });
            await loadSessions({ silent: true, overrideCursor: null, preserveExtra: userLoadedMoreRef.current });
        } catch (error) {
            console.error("Failed to pin session:", error);
        }
    }, [sessions, loadSessions]);

    const archiveSession = useCallback(async (sessionToArchiveId: string) => {
        try {
            await resilientPatch(`/api/sessions/${sessionToArchiveId}`, { status: "archived" });
            // If archiving the current session, clear it
            if (sessionToArchiveId === sessionId) {
                const remaining = sessions.filter((s) => s.id !== sessionToArchiveId);
                if (remaining.length > 0) {
                    await switchSession(remaining[0].id);
                } else {
                    router.replace(`/chat/${character.id}`, { scroll: false });
                }
            }
            await loadSessions({ silent: true, overrideCursor: null, preserveExtra: userLoadedMoreRef.current });
        } catch (error) {
            console.error("Failed to archive session:", error);
        }
    }, [sessionId, sessions, switchSession, loadSessions, router, character.id]);

    const restoreSession = useCallback(async (sessionToRestoreId: string) => {
        try {
            await resilientPatch(`/api/sessions/${sessionToRestoreId}`, { status: "active" });
            await loadSessions({ silent: true, overrideCursor: null, preserveExtra: userLoadedMoreRef.current });
        } catch (error) {
            console.error("Failed to restore session:", error);
        }
    }, [loadSessions]);

    const handleAvatarChange = useCallback((newAvatarUrl: string | null) => {
        setCharacterDisplay((prev) => ({
            ...prev,
            avatarUrl: newAvatarUrl,
            primaryImageUrl: newAvatarUrl || prev.primaryImageUrl,
        }));
    }, []);

    // Use sessionId + refresh counter for key
    // Stable during normal chat, but remounts when background processing completes
    // This keeps the ChatProvider alive during streaming but refreshes when returning to completed background run
    const chatProviderKey = `${sessionId || "no-session"}-${backgroundRefreshCounter}`;

    useEffect(() => {
        lastSessionSignatureRef.current = getMessagesSignature(messages);
    }, [messages]);

    useEffect(() => {
        sessionListSignatureRef.current = sessions.map(getSessionSignature).join("||");
    }, [sessions]);

    const handleSessionActivity = useCallback(() => {
        if (!sessionId) {
            return;
        }
        refreshSessionTimestamp(sessionId);
    }, [refreshSessionTimestamp, sessionId]);

    if (isLoading) {
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
                    sessions={sessions}
                    currentSessionId={sessionId}
                    loadingSessions={loadingSessions}
                    hasMore={hasMoreSessions}
                    totalCount={totalSessionCount}
                    searchQuery={searchQuery}
                    channelFilter={channelFilter}
                    dateRange={dateRange}
                    onSearchChange={setSearchQuery}
                    onChannelFilterChange={setChannelFilter}
                    onDateRangeChange={setDateRange}
                    onLoadMore={loadMoreSessions}
                    onNewSession={createNewSession}
                    onSwitchSession={switchSession}
                    onDeleteSession={deleteSession}
                    onResetChannelSession={resetChannelSession}
                    onRenameSession={renameSession}
                    onExportSession={exportSession}
                    onPinSession={pinSession}
                    onArchiveSession={archiveSession}
                    onRestoreSession={restoreSession}
                    characterId={character.id}
                    onAvatarChange={handleAvatarChange}
                />
            }
        >
            <CharacterProvider character={characterDisplay}>
                <div
                    style={{
                        opacity: isChatFading ? 0 : 1,
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
                            isBackgroundTaskRunning={Boolean(activeRun || isProcessingInBackground)}
                            isProcessingInBackground={isProcessingInBackground}
                            sessionId={sessionId}
                            onCancelBackgroundRun={handleCancelBackgroundRun}
                            isCancellingBackgroundRun={isCancellingBackgroundRun}
                            canCancelBackgroundRun={Boolean(processingRunId)}
                            isZombieBackgroundRun={isZombieRun}
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

function ChatSidebarHeader({
    label,
    onBack,
}: {
    label: string;
    onBack: () => void;
}) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-2 text-terminal-dark hover:bg-terminal-dark/8 transition-all duration-200"
        >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-mono">{label}</span>
        </Button>
    );
}

// BackgroundProgressPlaceholder removed - background processing UI now lives inline with the prompt input in thread.tsx

function ScheduledRunBanner({
    run,
    onCancel,
    cancelling,
}: {
    run: ActiveRunState;
    onCancel: () => void;
    cancelling: boolean;
}) {
    const t = useTranslations("chat");

    return (
        <div className="rounded-xl border border-terminal-border/60 bg-terminal-cream/80 shadow-sm">
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-8 w-1.5 rounded-full bg-terminal-green/60" />
                    <div className="space-y-1">
                        <p className="font-mono text-sm text-terminal-dark">
                            {t("scheduledRun.active", { taskName: run.taskName || "Background task" })}
                        </p>
                        <p className="text-xs text-terminal-muted">
                            {t("scheduledRun.description")}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-xs font-mono text-terminal-muted">
                        {t("scheduledRun.startedAt", {
                            time: new Date(run.startedAt).toLocaleTimeString(),
                        })}
                    </span>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="font-mono"
                        onClick={onCancel}
                        disabled={cancelling}
                    >
                        {cancelling ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("scheduledRun.stopping")}
                            </>
                        ) : (
                            <>
                                <CircleStop className="mr-2 h-4 w-4" />
                                {t("scheduledRun.stop")}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
