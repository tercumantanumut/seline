"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { resilientFetch, resilientPost, resilientPatch, resilientDelete } from "@/lib/utils/resilient-fetch";
import { convertDBMessagesToUIMessages } from "@/lib/messages/converter";
import type { TaskEvent, TaskStatus, UnifiedTask } from "@/lib/background-tasks/types";
import { useUnifiedTasksStore } from "@/lib/stores/unified-tasks-store";
import { useSessionSync } from "@/lib/hooks/use-session-sync";
import { useSessionSyncNotifier } from "@/lib/hooks/use-session-sync";
import { useSessionSyncStore, sessionInfoArrayToSyncData } from "@/lib/stores/session-sync-store";
import type { SessionInfo } from "@/components/chat/chat-sidebar/types";
import type { DBMessage, ActiveRunState, SessionState, ChannelFilter, DateRangeFilter } from "@/components/chat/chat-interface-types";
import {
    sortSessionsByUpdatedAt,
    areSessionsEquivalent,
    getSessionSignature,
    getMessagesSignature,
} from "@/components/chat/chat-interface-utils";

// ---------------------------------------------------------------------------
// useBackgroundProcessing
// Manages background run polling, zombie detection, and message refresh.
// ---------------------------------------------------------------------------

interface UseBackgroundProcessingOptions {
    sessionId: string;
    refreshSessionTimestamp: (id: string) => void;
    notifySessionUpdate: (id: string, data: Record<string, unknown>) => void;
    setSessionState: React.Dispatch<React.SetStateAction<SessionState>>;
    setBackgroundRefreshCounter: React.Dispatch<React.SetStateAction<number>>;
}

export function useBackgroundProcessing({
    sessionId,
    refreshSessionTimestamp,
    notifySessionUpdate,
    setSessionState,
    setBackgroundRefreshCounter,
}: UseBackgroundProcessingOptions) {
    const t = useTranslations("chat");
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [isProcessingInBackground, setIsProcessingInBackground] = useState(false);
    const [processingRunId, setProcessingRunId] = useState<string | null>(null);
    const [isZombieRun, setIsZombieRun] = useState(false);
    const [isCancellingBackgroundRun, setIsCancellingBackgroundRun] = useState(false);

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

        refreshSessionTimestamp(sessionId);
        notifySessionUpdate(sessionId, {
            updatedAt: new Date().toISOString(),
            messageCount: data.messages?.length || 0
        });

        flushSync(() => setIsChatFading(true));
        await new Promise<void>(resolve => setTimeout(resolve, 150));
        flushSync(() => {
            setSessionState(prev => ({ ...prev, messages: uiMessages }));
            setBackgroundRefreshCounter(prev => prev + 1);
        });
        requestAnimationFrame(() => setIsChatFading(false));

        console.log("[Background Processing] Messages updated successfully, triggering UI refresh");
    }, [sessionId, refreshSessionTimestamp, notifySessionUpdate, setSessionState, setBackgroundRefreshCounter]);

    // isChatFading is local to this hook's refreshMessages but needs to be surfaced
    // back to the component. We keep a state for it here too.
    const [isChatFading, setIsChatFading] = useState(false);

    const startPollingForCompletion = useCallback((runId: string) => {
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
                    return;
                }
                if (data.status === "running") {
                    setIsZombieRun(Boolean(data.isZombie));
                    if (data.isZombie) {
                        console.warn("[Background Processing] Zombie run detected, stopping polling");
                        if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current);
                            pollingIntervalRef.current = null;
                        }
                        return;
                    }
                    return;
                }
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
            }
        }, pollIntervalMs);
    }, [refreshMessages]);

    // Clear polling interval on unmount to prevent stale updates after navigation
    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, []);

    const handleCancelBackgroundRun = useCallback(async () => {
        const runId = processingRunId;
        if (!runId) return;
        setIsCancellingBackgroundRun(true);
        try {
            const result = await resilientFetch<{ status?: string }>(
                `/api/agent-runs/${runId}/cancel`,
                { method: "POST", headers: { "Content-Type": "application/json" }, retries: 0 }
            );
            if (result.error) {
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

    return {
        pollingIntervalRef,
        isProcessingInBackground,
        setIsProcessingInBackground,
        processingRunId,
        setProcessingRunId,
        isZombieRun,
        setIsZombieRun,
        isChatFading,
        isCancellingBackgroundRun,
        setIsCancellingBackgroundRun,
        refreshMessages,
        startPollingForCompletion,
        handleCancelBackgroundRun,
    };
}

// ---------------------------------------------------------------------------
// useSessionManager
// Manages session CRUD operations: load, create, switch, delete, rename, etc.
// ---------------------------------------------------------------------------

interface UseSessionManagerOptions {
    character: { id: string; name: string };
    initialNextCursor: string | null;
    initialSessions: SessionInfo[];
    sessionId: string;
    setSessionState: React.Dispatch<React.SetStateAction<SessionState>>;
    pollingIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
    setIsProcessingInBackground: (v: boolean) => void;
    setProcessingRunId: (v: string | null) => void;
    setIsZombieRun: (v: boolean) => void;
    setIsCancellingBackgroundRun: (v: boolean) => void;
}

export function useSessionManager({
    character,
    initialNextCursor,
    initialSessions,
    sessionId,
    setSessionState,
    pollingIntervalRef,
    setIsProcessingInBackground,
    setProcessingRunId,
    setIsZombieRun,
    setIsCancellingBackgroundRun,
}: UseSessionManagerOptions) {
    const router = useRouter();
    const tc = useTranslations("common");
    const t = useTranslations("chat");
    const { syncSessions, updateSession: notifySessionUpdate, notifySessionDeleted: notifySessionRemoval } = useSessionSync();
    const sessionSyncNotifier = useSessionSyncNotifier();
    const setSyncSessions = useSessionSyncStore((state) => state.setSessions);

    const [sessions, setSessions] = useState<SessionInfo[]>(() => sortSessionsByUpdatedAt(initialSessions));
    const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
    const [hasMoreSessions, setHasMoreSessions] = useState(Boolean(initialNextCursor));
    const [totalSessionCount, setTotalSessionCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
    const [dateRange, setDateRange] = useState<DateRangeFilter>("all");
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const nextCursorRef = useRef<string | null>(initialNextCursor);
    const userLoadedMoreRef = useRef(false);
    const filterKeyRef = useRef(`${searchQuery}|${channelFilter}|${dateRange}`);
    const filtersRef = useRef({ searchQuery, channelFilter, dateRange });
    filtersRef.current = { searchQuery, channelFilter, dateRange };

    // Sync sessions to global store whenever local sessions change
    useEffect(() => {
        if (sessions.length > 0) {
            setSyncSessions(sessionInfoArrayToSyncData(sessions), character.id);
        }
    }, [sessions, character.id, setSyncSessions]);

    const refreshSessionTimestamp = useCallback((targetSessionId: string) => {
        const nextUpdatedAt = new Date().toISOString();
        notifySessionUpdate(targetSessionId, { updatedAt: nextUpdatedAt });
        setSessions((prev) => {
            let updated = false;
            const next = prev.map((session) => {
                if (session.id !== targetSessionId) return session;
                updated = true;
                return { ...session, updatedAt: nextUpdatedAt };
            });
            if (!updated) return prev;
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
            if (!silent) setLoadingSessions(true);
            const { searchQuery, channelFilter, dateRange } = filtersRef.current;
            const params = new URLSearchParams({ characterId: character.id, limit: "20" });
            if (cursor) params.set("cursor", cursor);
            if (searchQuery.trim()) params.set("search", searchQuery.trim());
            if (channelFilter !== "all") params.set("channelType", channelFilter);
            if (dateRange !== "all") params.set("dateRange", dateRange);
            const { data, error } = await resilientFetch<{ sessions: SessionInfo[]; nextCursor?: string; totalCount?: number }>(
                `/api/sessions?${params.toString()}`,
                { retries: 0 }
            );
            if (error || !data) return false;
            const pageSessions = sortSessionsByUpdatedAt((data.sessions || []) as SessionInfo[]);
            syncSessions(pageSessions);
            setSessions((prev) => {
                if (!append) {
                    if (preserveExtra && prev.length > pageSessions.length) {
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
            if (!silent) setLoadingSessions(false);
        }
    }, [character.id]);

    const fetchSessionMessages = useCallback(async (targetSessionId: string) => {
        const { data, error } = await resilientFetch<{ messages: DBMessage[] }>(
            `/api/sessions/${targetSessionId}`,
            { retries: 0 }
        );
        if (error || !data) {
            if (error) console.error("Failed to fetch session messages:", error);
            return null;
        }
        return convertDBMessagesToUIMessages((data.messages || []) as DBMessage[]);
    }, []);

    const loadMoreSessions = useCallback(async () => {
        if (!hasMoreSessions || loadingSessions) return;
        userLoadedMoreRef.current = true;
        await loadSessions({ append: true });
    }, [hasMoreSessions, loadingSessions, loadSessions]);

    useEffect(() => {
        const filterKey = `${searchQuery}|${channelFilter}|${dateRange}`;
        if (filterKey === filterKeyRef.current) return;
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

    const clearBackgroundState = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        setIsProcessingInBackground(false);
        setProcessingRunId(null);
        setIsZombieRun(false);
        setIsCancellingBackgroundRun(false);
    }, [pollingIntervalRef, setIsProcessingInBackground, setProcessingRunId, setIsZombieRun, setIsCancellingBackgroundRun]);

    const switchSession = useCallback(async (newSessionId: string) => {
        // Guard: clicking the same session while a run is active must be a no-op.
        // clearBackgroundState() would drop processingRunId / isProcessingInBackground,
        // making the UI think nothing is running and allowing a new message to be sent
        // while the old run is still executing server-side.
        if (newSessionId === sessionId) return;
        try {
            setIsLoading(true);
            clearBackgroundState();
            const uiMessages = await fetchSessionMessages(newSessionId);
            if (!uiMessages) return;
            setSessionState({ sessionId: newSessionId, messages: uiMessages });
            router.replace(`/chat/${character.id}?sessionId=${newSessionId}`, { scroll: false });
        } catch (err) {
            console.error("Failed to switch session:", err);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, character.id, router, fetchSessionMessages, clearBackgroundState, setSessionState]);

    const createNewSession = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data: createData, error } = await resilientPost<{ session: SessionInfo }>(
                "/api/sessions",
                { forceNew: true, metadata: { characterId: character.id, characterName: character.name } }
            );
            if (!error && createData) {
                const { session } = createData;
                clearBackgroundState();
                setSessionState({ sessionId: session.id, messages: [] });
                syncSessions([session]);
                await loadSessions();
                router.replace(`/chat/${character.id}?sessionId=${session.id}`, { scroll: false });
            }
        } catch (err) {
            console.error("Failed to create new session:", err);
        } finally {
            setIsLoading(false);
        }
    }, [character.id, character.name, loadSessions, router, clearBackgroundState, setSessionState]);

    const resetChannelSession = useCallback(async (sessionToResetId: string, options?: { archiveOld?: boolean }) => {
        try {
            setIsLoading(true);
            const { data, error } = await resilientPost<{ session: { id: string } }>(
                `/api/sessions/${sessionToResetId}/reset-channel`,
                { archiveOld: options?.archiveOld ?? false }
            );
            if (error || !data) throw new Error("Failed to reset channel session");
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
    }, [loadSessions, switchSession, t]);

    const deleteSession = useCallback(async (sessionToDeleteId: string) => {
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
    }, [sessionId, sessions, switchSession, createNewSession, loadSessions]);

    const renameSession = useCallback(async (sessionToRenameId: string, newTitle: string): Promise<boolean> => {
        const trimmed = newTitle.trim();
        const normalizedTitle = trimmed.length > 0 ? trimmed : null;
        const optimisticUpdatedAt = new Date().toISOString();
        let found = false;
        let changed = false;
        setSessions((prev) => {
            const next = prev.map((session) => {
                if (session.id !== sessionToRenameId) return session;
                found = true;
                if (session.title === normalizedTitle) return session;
                changed = true;
                return { ...session, title: normalizedTitle, updatedAt: optimisticUpdatedAt };
            });
            if (!found || !changed) return prev;
            return sortSessionsByUpdatedAt(next);
        });
        if (!found) {
            toast.error(tc("error"));
            await loadSessions();
            return false;
        }
        if (!changed) return true;
        notifySessionUpdate(sessionToRenameId, { title: normalizedTitle, updatedAt: optimisticUpdatedAt });
        try {
            const { error } = await resilientPatch(`/api/sessions/${sessionToRenameId}`, { title: normalizedTitle });
            if (error) throw new Error("Failed to rename session");
            return true;
        } catch (err) {
            console.error("Failed to rename session:", err);
            toast.error(tc("error"));
            await loadSessions();
            return false;
        }
    }, [loadSessions, tc]);

    const exportSession = useCallback(async (sessionToExportId: string, format: "markdown" | "json" | "text") => {
        try {
            const { data, error } = await resilientFetch<{ content: string; filename: string }>(
                `/api/sessions/${sessionToExportId}/export?format=${format}`
            );
            if (error || !data) throw new Error("Failed to export session");
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
            await resilientPatch(`/api/sessions/${sessionToPinId}`, { metadata: { pinned: !isPinned } });
            await loadSessions({ silent: true, overrideCursor: null, preserveExtra: userLoadedMoreRef.current });
            toast.success(t(isPinned ? "sidebar.unpin" : "sidebar.pin"));
        } catch (error) {
            console.error("Failed to pin session:", error);
        }
    }, [sessions, loadSessions, t]);

    const archiveSession = useCallback(async (sessionToArchiveId: string) => {
        try {
            await resilientPatch(`/api/sessions/${sessionToArchiveId}`, { status: "archived" });
            toast.success(t("sidebar.archiveSuccess"));
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
            toast.error(t("sidebar.archiveError"));
        }
    }, [sessionId, sessions, switchSession, loadSessions, router, character.id, t]);

    const restoreSession = useCallback(async (sessionToRestoreId: string) => {
        try {
            await resilientPatch(`/api/sessions/${sessionToRestoreId}`, { status: "active" });
            toast.success(t("sidebar.restore"));
            await loadSessions({ silent: true, overrideCursor: null, preserveExtra: userLoadedMoreRef.current });
        } catch (error) {
            console.error("Failed to restore session:", error);
            toast.error(t("sidebar.archiveError"));
        }
    }, [loadSessions, t]);

    return {
        sessions,
        setSessions,
        nextCursor,
        hasMoreSessions,
        totalSessionCount,
        searchQuery,
        setSearchQuery,
        channelFilter,
        setChannelFilter,
        dateRange,
        setDateRange,
        loadingSessions,
        isLoading,
        userLoadedMoreRef,
        refreshSessionTimestamp,
        notifySessionUpdate,
        loadSessions,
        fetchSessionMessages,
        loadMoreSessions,
        switchSession,
        createNewSession,
        resetChannelSession,
        deleteSession,
        renameSession,
        exportSession,
        pinSession,
        archiveSession,
        restoreSession,
    };
}
