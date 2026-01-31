"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Thread } from "@/components/assistant-ui/thread";
import { ChatProvider } from "@/components/chat-provider";
import { CharacterProvider, type CharacterDisplayData } from "@/components/assistant-ui/character-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Loader2, PlusCircle, MessageCircle, Trash2, Clock, BarChart2, Camera, Brain, Pencil, Calendar, CircleStop, Plug, Hash, Phone, Send, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { AvatarSelectionDialog } from "@/components/avatar-selection-dialog";
import { ChannelConnectionsDialog } from "@/components/channels/channel-connections-dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslations, useFormatter } from "next-intl";
import { convertDBMessagesToUIMessages, convertContentPartsToUIParts, getContentPartsSignature, type DBContentPart } from "@/lib/messages/converter";
import { toast } from "sonner";
import type { TaskEvent } from "@/lib/scheduler/task-events";
import { useActiveTasksStore } from "@/lib/stores/active-tasks-store";

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

interface SessionInfo {
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    metadata: {
        characterId?: string;
        characterName?: string;
        channelType?: "whatsapp" | "telegram" | "slack";
        channelPeerName?: string | null;
        channelPeerId?: string | null;
    };
}

interface ChannelConnectionSummary {
    id: string;
    channelType: "whatsapp" | "telegram" | "slack";
    status: "disconnected" | "connecting" | "connected" | "error";
    displayName?: string | null;
}

interface ChatInterfaceProps {
    character: CharacterFullData;
    initialSessionId: string;
    initialSessions: SessionInfo[];
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

const CHANNEL_TYPE_ICONS = {
    whatsapp: Phone,
    telegram: Send,
    slack: Hash,
};

// Combined state to ensure sessionId and messages always update atomically
interface SessionState {
    sessionId: string;
    messages: UIMessage[];
}

interface ActiveRunState {
    runId: string;
    taskName: string;
    startedAt: string;
}

export default function ChatInterface({
    character,
    initialSessionId,
    initialSessions,
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
    const [characterDisplay, setCharacterDisplay] = useState<CharacterDisplayData>(initialCharacterDisplay);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const activeTasks = useActiveTasksStore((state) => state.activeTasks);
    const activeTaskForSession = sessionId ? activeTasks.find((task) => task.sessionId === sessionId) : undefined;
    const [activeRun, setActiveRun] = useState<ActiveRunState | null>(null);
    const [isCancellingRun, setIsCancellingRun] = useState(false);
    const activeSessionMeta = useMemo(
        () => sessions.find((session) => session.id === sessionId)?.metadata,
        [sessions, sessionId]
    );
    const isChannelSession = Boolean(activeSessionMeta?.channelType);

    // Refs for debouncing and memoization to prevent UI flashing
    const reloadDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastProgressSignatureRef = useRef<string>("");
    const lastProgressPartsRef = useRef<UIMessage["parts"] | null>(null);
    const lastProgressTimeRef = useRef<number>(0);
    const lastSessionSignatureRef = useRef<string>(getMessagesSignature(initialMessages));
    const PROGRESS_THROTTLE_MS = 100; // Minimum time between UI updates

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

    const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false;
        try {
            if (!silent) {
                setLoadingSessions(true);
            }
            const response = await fetch(`/api/sessions?characterId=${character.id}`);
            if (response.ok) {
                const data = await response.json();
                const nextSessions = sortSessionsByUpdatedAt(data.sessions || []);
                setSessions((prev) => (areSessionsEquivalent(prev, nextSessions) ? prev : nextSessions));
            }
        } catch (err) {
            console.error("Failed to load sessions:", err);
        } finally {
            if (!silent) {
                setLoadingSessions(false);
            }
        }
    }, [character.id]);

    const fetchSessionMessages = useCallback(async (targetSessionId: string) => {
        try {
            const response = await fetch(`/api/sessions/${targetSessionId}`);
            if (response.ok) {
                const data = await response.json();
                const dbMessages = (data.messages || []) as DBMessage[];
                return convertDBMessagesToUIMessages(dbMessages);
            }
        } catch (err) {
            console.error("Failed to fetch session messages:", err);
        }
        return null;
    }, []);

    const reloadSessionMessages = useCallback(async (targetSessionId: string) => {
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
        lastSessionSignatureRef.current = nextSignature;
        refreshSessionTimestamp(targetSessionId);
    }, [fetchSessionMessages, refreshSessionTimestamp, sessionId]);

    useEffect(() => {
        if (activeTaskForSession) {
            setActiveRun({
                runId: activeTaskForSession.runId,
                taskName: activeTaskForSession.taskName,
                startedAt: activeTaskForSession.startedAt,
            });
        } else {
            setActiveRun(null);
        }
    }, [activeTaskForSession]);

    const switchSession = useCallback(
        async (newSessionId: string) => {
            try {
                setIsLoading(true);
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
        [character.id, router, fetchSessionMessages, refreshSessionTimestamp]
    );

    const createNewSession = useCallback(
        async () => {
            try {
                setIsLoading(true);
                const response = await fetch("/api/sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        forceNew: true,
                        metadata: { characterId: character.id, characterName: character.name },
                    }),
                });
                if (response.ok) {
                    const { session } = await response.json();
                    // CRITICAL: Update sessionId and messages atomically
                    setSessionState({
                        sessionId: session.id,
                        messages: [],
                    });
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

    const resetChannelSession = useCallback(
        async (sessionToResetId: string, options?: { archiveOld?: boolean }) => {
            try {
                setIsLoading(true);
                const response = await fetch(`/api/sessions/${sessionToResetId}/reset-channel`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ archiveOld: options?.archiveOld ?? false }),
                });
                if (!response.ok) {
                    throw new Error("Failed to reset channel session");
                }
                const { session } = await response.json();
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
                const response = await fetch(`/api/sessions/${sessionToDeleteId}`, {
                    method: "DELETE",
                });
                if (response.ok) {
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
            const response = await fetch(`/api/schedules/runs/${activeRun.runId}/cancel`, {
                method: "POST",
            });
            if (!response.ok) {
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

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const handleTaskCompleted = (event: Event) => {
            const detail = (event as CustomEvent<TaskEvent>).detail;
            if (!detail) return;

            if (detail.sessionId && detail.sessionId === sessionId) {
                // Debounce the reload to allow final progress update to settle
                if (reloadDebounceRef.current) {
                    clearTimeout(reloadDebounceRef.current);
                }

                reloadDebounceRef.current = setTimeout(() => {
                    void reloadSessionMessages(sessionId);
                    reloadDebounceRef.current = null;
                }, 150); // Small delay to let final state settle

                setActiveRun((current) => {
                    if (current?.runId === detail.runId) {
                        return null;
                    }
                    return current;
                });
            }

            if (detail.characterId === character.id) {
                void loadSessions();
            }
        };

        const handleTaskStarted = (event: Event) => {
            const detail = (event as CustomEvent<TaskEvent>).detail;
            if (!detail) return;

            if (detail.sessionId && detail.sessionId === sessionId) {
                setActiveRun({
                    runId: detail.runId,
                    taskName: detail.taskName,
                    startedAt: detail.startedAt,
                });
                void reloadSessionMessages(sessionId);
            }

            if (detail.characterId === character.id) {
                void loadSessions();
            }
        };

        window.addEventListener("scheduled-task-completed", handleTaskCompleted);
        window.addEventListener("scheduled-task-started", handleTaskStarted);

        return () => {
            window.removeEventListener("scheduled-task-completed", handleTaskCompleted);
            window.removeEventListener("scheduled-task-started", handleTaskStarted);
        };
    }, [character.id, loadSessions, reloadSessionMessages, sessionId]);

    useEffect(() => {
        if (!sessionId) {
            return;
        }

      const interval = setInterval(() => {
          if (document.visibilityState !== "visible") {
              return;
          }
          void loadSessions({ silent: true });
          if (isChannelSession) {
              void reloadSessionMessages(sessionId);
          }
      }, 20000);

        return () => clearInterval(interval);
    }, [isChannelSession, loadSessions, reloadSessionMessages, sessionId]);

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
            if (!detail || detail.sessionId !== sessionId) {
                return;
            }
            const messageId = detail.assistantMessageId || `${detail.runId}-assistant`;

            // Early return if no progress content
            if (!detail.progressContent?.length && !detail.progressText) {
                return;
            }

            // Time-based throttle to reduce UI updates
            const now = Date.now();
            if (now - lastProgressTimeRef.current < PROGRESS_THROTTLE_MS) {
                return;
            }
            lastProgressTimeRef.current = now;

            // Compute signature to check if content meaningfully changed
            const contentSignature = detail.progressContent?.length
                ? getContentPartsSignature(detail.progressContent as DBContentPart[])
                : `text:${detail.progressText?.length || 0}`;

            // Skip update if content hasn't meaningfully changed
            if (contentSignature === lastProgressSignatureRef.current) {
                return;
            }
            lastProgressSignatureRef.current = contentSignature;

            // Only convert if we have new content
            const progressParts = detail.progressContent?.length
                ? convertContentPartsToUIParts(detail.progressContent as DBContentPart[])
                : ([{ type: "text", text: detail.progressText }] as UIMessage["parts"]);

            // Cache the converted parts
            lastProgressPartsRef.current = progressParts;

            setSessionState((prev) => {
                if (prev.sessionId !== sessionId) {
                    return prev;
                }
                const existingIndex = prev.messages.findIndex((msg) => msg.id === messageId);
                const baseMessage = existingIndex === -1 ? { id: messageId, role: "assistant", parts: [] as UIMessage["parts"] } : prev.messages[existingIndex];

                if (!progressParts || progressParts.length === 0) {
                    return prev;
                }

                const updatedMessage: UIMessage = {
                    ...baseMessage,
                    id: messageId,
                    role: "assistant",
                    parts: progressParts,
                };
                const nextMessages = [...prev.messages];
                if (existingIndex === -1) {
                    nextMessages.push(updatedMessage);
                } else {
                    nextMessages[existingIndex] = updatedMessage;
                }
                return {
                    sessionId: prev.sessionId,
                    messages: nextMessages,
                };
            });
            refreshSessionTimestamp(detail.sessionId);
        };

        window.addEventListener("scheduled-task-progress", handleTaskProgress);
        return () => {
            window.removeEventListener("scheduled-task-progress", handleTaskProgress);
            // Reset memoization refs when effect cleans up
            lastProgressSignatureRef.current = "";
            lastProgressPartsRef.current = null;
        };
    }, [refreshSessionTimestamp, sessionId]);

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

            try {
                const response = await fetch(`/api/sessions/${sessionToRenameId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: normalizedTitle }),
                });
                if (!response.ok) {
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

    const handleAvatarChange = useCallback((newAvatarUrl: string | null) => {
        setCharacterDisplay((prev) => ({
            ...prev,
            avatarUrl: newAvatarUrl,
            primaryImageUrl: newAvatarUrl || prev.primaryImageUrl,
        }));
    }, []);

    const chatProviderKey = useMemo(() => {
        const lastMessage = messages[messages.length - 1];
        const lastMessageId = lastMessage?.id || "none";
        const lastMessageRole = lastMessage?.role || "unknown";
        const partsCount = Array.isArray((lastMessage as { parts?: unknown[] })?.parts)
            ? ((lastMessage as { parts?: unknown[] }).parts?.length ?? 0)
            : 0;
        const textDigest =
            lastMessage && "parts" in lastMessage && Array.isArray((lastMessage as { parts?: Array<{ type?: string; text?: string }> }).parts)
                ? (lastMessage as { parts?: Array<{ type?: string; text?: string }> })
                    .parts?.filter((part) => part?.type === "text")
                    .map((part) => part?.text || "")
                    .join("|")
                : "";
        return `${sessionId || "no-session"}-${messages.length}-${lastMessageId}-${lastMessageRole}-${partsCount}-${textDigest}`;
    }, [messages, sessionId]);

    useEffect(() => {
        lastSessionSignatureRef.current = getMessagesSignature(messages);
    }, [messages]);

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
                    onNewSession={createNewSession}
                    onSwitchSession={switchSession}
                    onDeleteSession={deleteSession}
                    onResetChannelSession={resetChannelSession}
                    onRenameSession={renameSession}
                    onAvatarChange={handleAvatarChange}
                />
            }
        >
            <CharacterProvider character={characterDisplay}>
                <ChatProvider
                    key={chatProviderKey}
                    sessionId={sessionId}
                    characterId={character.id}
                    initialMessages={messages}
                >
                    <div className="flex h-full flex-col gap-3">
                        {activeRun && (
                            <ScheduledRunBanner
                                run={activeRun}
                                onCancel={handleCancelRun}
                                cancelling={isCancellingRun}
                            />
                        )}
                        <Thread onSessionActivity={handleSessionActivity} />
                    </div>
                </ChatProvider>
            </CharacterProvider>
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

function CharacterSidebar({
    character,
    characterDisplay,
    sessions,
    currentSessionId,
    loadingSessions,
    onNewSession,
    onSwitchSession,
    onDeleteSession,
    onResetChannelSession,
    onRenameSession,
    onAvatarChange,
}: {
    character: CharacterFullData;
    characterDisplay: CharacterDisplayData | null;
    sessions: SessionInfo[];
    currentSessionId: string | null;
    loadingSessions: boolean;
    onNewSession: () => void;
    onSwitchSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
    onResetChannelSession: (sessionId: string, options?: { archiveOld?: boolean }) => Promise<void>;
    onRenameSession: (sessionId: string, title: string) => Promise<boolean>;
    onAvatarChange: (newAvatarUrl: string | null) => void;
}) {
    const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const editInputRef = useRef<HTMLInputElement | null>(null);
    const skipBlurRef = useRef(false);
    const avatarUrl = characterDisplay?.avatarUrl || characterDisplay?.primaryImageUrl;
    const initials = characterDisplay?.initials || character.name.substring(0, 2).toUpperCase();
    const t = useTranslations("chat");
    const tChannels = useTranslations("channels");
    const formatter = useFormatter();
    const [channelsOpen, setChannelsOpen] = useState(false);
    const [channelConnections, setChannelConnections] = useState<ChannelConnectionSummary[]>([]);
    const [channelsLoading, setChannelsLoading] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [pendingDeleteSession, setPendingDeleteSession] = useState<SessionInfo | null>(null);

    const stopEditing = useCallback(() => {
        setEditingSessionId(null);
        setEditTitle("");
        editInputRef.current = null;
        skipBlurRef.current = false;
    }, []);

    const startEditingSession = useCallback((session: SessionInfo) => {
        setEditingSessionId(session.id);
        setEditTitle(session.title || "");
        skipBlurRef.current = false;
    }, []);

    useEffect(() => {
        if (editingSessionId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingSessionId]);

    const handleRename = useCallback(async () => {
        if (!editingSessionId) {
            return;
        }
        const success = await onRenameSession(editingSessionId, editTitle);
        if (success) {
            stopEditing();
        }
    }, [editTitle, editingSessionId, onRenameSession, stopEditing]);

    const closeDeleteDialog = useCallback(() => {
        setDeleteDialogOpen(false);
        setPendingDeleteSession(null);
    }, []);

    const isChannelBoundSession = useCallback(
        (session: SessionInfo) => Boolean(session.metadata?.channelType),
        []
    );

    const handleDeleteRequest = useCallback(
        (session: SessionInfo) => {
            if (isChannelBoundSession(session)) {
                setPendingDeleteSession(session);
                setDeleteDialogOpen(true);
                return;
            }
            onDeleteSession(session.id);
        },
        [isChannelBoundSession, onDeleteSession]
    );

    const handleArchiveAndReset = useCallback(async () => {
        if (!pendingDeleteSession) {
            return;
        }
        await onResetChannelSession(pendingDeleteSession.id, { archiveOld: true });
        closeDeleteDialog();
    }, [closeDeleteDialog, onResetChannelSession, pendingDeleteSession]);

    const handleConfirmDelete = useCallback(async () => {
        if (!pendingDeleteSession) {
            return;
        }
        await onDeleteSession(pendingDeleteSession.id);
        closeDeleteDialog();
    }, [closeDeleteDialog, onDeleteSession, pendingDeleteSession]);

    const handleInputBlur = useCallback(() => {
        if (skipBlurRef.current) {
            skipBlurRef.current = false;
            return;
        }
        void handleRename();
    }, [handleRename]);

    const handleInputKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                event.preventDefault();
                void handleRename();
            } else if (event.key === "Escape") {
                event.preventDefault();
                stopEditing();
            }
        },
        [handleRename, stopEditing]
    );

    const handleActionMouseDown = useCallback(() => {
        skipBlurRef.current = true;
    }, []);

    const handleSaveClick = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            void handleRename();
        },
        [handleRename]
    );

    const handleCancelClick = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            stopEditing();
        },
        [stopEditing]
    );

    const parseAsUTC = (dateStr: string): Date => {
        const normalized =
            dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
                ? dateStr
                : dateStr.replace(" ", "T") + "Z";
        return new Date(normalized);
    };

    const formatSessionDate = (dateStr: string): string => {
        const date = parseAsUTC(dateStr);

        if (isNaN(date.getTime())) {
            return t("session.invalid");
        }

        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            return formatter.dateTime(date, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        } else if (days === 1) {
            return t("session.yesterday");
        } else if (days < 7) {
            return formatter.dateTime(date, { weekday: "short" });
        } else {
            return formatter.dateTime(date, { month: "short", day: "numeric" });
        }
    };

    const loadChannelConnections = useCallback(async () => {
        try {
            setChannelsLoading(true);
            const response = await fetch(`/api/channels/connections?characterId=${character.id}`);
            if (response.ok) {
                const data = await response.json();
                setChannelConnections((data.connections || []) as ChannelConnectionSummary[]);
            }
        } catch (error) {
            console.error("Failed to load channel connections:", error);
        } finally {
            setChannelsLoading(false);
        }
    }, [character.id]);

    useEffect(() => {
        void loadChannelConnections();
    }, [loadChannelConnections]);

    const connectedCount = channelConnections.filter((connection) => connection.status === "connected").length;

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <AvatarSelectionDialog
                open={avatarDialogOpen}
                onOpenChange={setAvatarDialogOpen}
                characterId={character.id}
                characterName={character.displayName || character.name}
                currentAvatarUrl={avatarUrl || null}
                onAvatarChange={(url) => {
                    onAvatarChange(url);
                    setAvatarDialogOpen(false);
                }}
            />
            <ChannelConnectionsDialog
                open={channelsOpen}
                onOpenChange={setChannelsOpen}
                characterId={character.id}
                characterName={character.displayName || character.name}
                onConnectionsChange={setChannelConnections}
            />
            <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeDeleteDialog();
                    } else {
                        setDeleteDialogOpen(true);
                    }
                }}
            >
                <AlertDialogContent className="font-mono">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-terminal-dark uppercase tracking-tight">
                            {t("channelSession.deleteTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-terminal-muted">
                            {t("channelSession.deleteDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="font-mono">
                            {t("sidebar.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="font-mono bg-terminal-green text-terminal-cream hover:bg-terminal-green/90"
                            onClick={() => void handleArchiveAndReset()}
                        >
                            {t("channelSession.archiveReset")}
                        </AlertDialogAction>
                        <AlertDialogAction
                            className="font-mono bg-red-600 text-white hover:bg-red-600/90"
                            onClick={() => void handleConfirmDelete()}
                        >
                            {t("channelSession.deleteAnyway")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="shrink-0 px-4 pt-3 pb-3">
                <div
                    className={cn(
                        "flex flex-col items-center text-center gap-3 p-4 rounded-lg",
                        "bg-terminal-cream/80 border border-terminal-border/30",
                        "shadow-sm transition-all duration-200",
                        "hover:bg-terminal-cream/90 hover:border-terminal-border/50"
                    )}
                >
                    <button
                        onClick={() => setAvatarDialogOpen(true)}
                        className="relative group cursor-pointer"
                        title={t("sidebar.changeAvatar")}
                    >
                        <Avatar className="w-16 h-16 shadow-md transition-transform duration-200 group-hover:scale-105">
                            {avatarUrl ? <AvatarImage src={avatarUrl} alt={character.name} /> : null}
                            <AvatarFallback className="bg-terminal-green/10 text-xl font-mono text-terminal-green">
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                        <div className="absolute inset-0 rounded-full bg-terminal-dark/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                            <Camera className="w-5 h-5 text-terminal-cream" />
                        </div>
                    </button>
                    <div>
                        <h2 className="font-semibold font-mono text-terminal-dark">
                            {character.displayName || character.name}
                        </h2>
                        {character.tagline && (
                            <p className="text-xs text-terminal-muted/80 font-mono mt-1.5 line-clamp-2 leading-relaxed">
                                {character.tagline}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setChannelsOpen(true)}
                            className="h-7 px-2 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10"
                        >
                            <Plug className="mr-1 h-3.5 w-3.5" />
                            <span className="text-xs font-mono">{t("sidebar.channels")}</span>
                        </Button>
                        <div className="flex flex-wrap items-center justify-center gap-1">
                            {channelsLoading ? (
                                <span className="text-[11px] font-mono text-terminal-muted">
                                    {tChannels("connections.loading")}
                                </span>
                            ) : channelConnections.length === 0 ? (
                                <span className="text-[11px] font-mono text-terminal-muted">
                                    {tChannels("connections.empty")}
                                </span>
                            ) : (
                                channelConnections.map((connection) => {
                                    const Icon = CHANNEL_TYPE_ICONS[connection.channelType];
                                    const badgeClass = connection.status === "connected"
                                        ? "bg-emerald-500/15 text-emerald-700"
                                        : connection.status === "connecting"
                                            ? "bg-amber-500/15 text-amber-700"
                                            : connection.status === "error"
                                                ? "bg-red-500/15 text-red-700"
                                                : "bg-terminal-dark/10 text-terminal-muted";
                                    return (
                                        <Badge
                                            key={connection.id}
                                            className={cn("border border-transparent px-2 py-0.5 text-[10px] font-mono", badgeClass)}
                                        >
                                            <Icon className="mr-1 h-3 w-3" />
                                            {tChannels(`types.${connection.channelType}`)}
                                        </Badge>
                                    );
                                })
                            )}
                        </div>
                        {connectedCount > 0 && (
                            <span className="text-[11px] font-mono text-terminal-muted">
                                {tChannels("connections.connectedCount", { count: connectedCount })}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div className="shrink-0 flex items-center justify-between px-4 py-2 mb-1">
                        <h3 className="text-xs font-semibold font-mono text-terminal-dark uppercase tracking-wider">
                            {t("sidebar.history")}
                        </h3>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-8 w-8 p-0 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10 transition-all duration-200 active:bg-terminal-green/15"
                                title={t("sidebar.agentMemory")}
                            >
                                <Link href={`/agents/${character.id}/memory`}>
                                    <Brain className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-8 w-8 p-0 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10 transition-all duration-200 active:bg-terminal-green/15"
                                title={t("sidebar.schedules")}
                            >
                                <Link href={`/agents/${character.id}/schedules`}>
                                    <Calendar className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-8 w-8 p-0 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10 transition-all duration-200 active:bg-terminal-green/15"
                                title={t("sidebar.usage")}
                            >
                                <Link href="/usage">
                                    <BarChart2 className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onNewSession}
                                className="h-8 px-2.5 text-terminal-green hover:bg-terminal-green/10 transition-all duration-200 active:bg-terminal-green/15"
                                title={t("sidebar.startNew")}
                            >
                                <PlusCircle className="h-4 w-4 mr-1" />
                                <span className="text-xs font-mono font-medium">{t("sidebar.new")}</span>
                            </Button>
                        </div>
                    </div>

                    <ScrollArea className="flex-1 min-h-0 px-4">
                        <div className="space-y-1.5 pr-2 pb-2">
                            {loadingSessions ? (
                                <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-4 w-4 animate-spin text-terminal-muted" />
                                </div>
                            ) : sessions.length === 0 ? (
                                <p className="text-xs text-terminal-muted font-mono py-6 text-center">
                                    {t("sidebar.empty")}
                                </p>
                            ) : (
                                sessions.map((session) => {
                                    const isCurrent = session.id === currentSessionId;
                                    const isEditing = editingSessionId === session.id;
                                    return (
                                        <div
                                            key={session.id}
                                            className={cn(
                                                "group relative flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer",
                                                "transition-all duration-200 ease-out",
                                                isCurrent
                                                    ? "bg-terminal-green/15 border-l-2 border-terminal-green shadow-sm"
                                                    : "hover:bg-terminal-dark/8 border-l-2 border-transparent"
                                            )}
                                            onClick={() => {
                                                if (isEditing) {
                                                    return;
                                                }
                                                onSwitchSession(session.id);
                                            }}
                                        >
                                            <MessageCircle
                                                className={cn(
                                                    "h-4 w-4 flex-shrink-0 transition-colors duration-200",
                                                    isCurrent ? "text-terminal-green" : "text-terminal-muted"
                                                )}
                                            />
                                            <div className="flex-1 min-w-0">
                                                {isEditing ? (
                                                    <div
                                                        className="space-y-2"
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        <Input
                                                            ref={isEditing ? editInputRef : undefined}
                                                            type="text"
                                                            value={editTitle}
                                                            onChange={(event) => setEditTitle(event.target.value)}
                                                            onKeyDown={handleInputKeyDown}
                                                            onBlur={handleInputBlur}
                                                            onClick={(event) => event.stopPropagation()}
                                                            placeholder={t("sidebar.edit")}
                                                            className="h-8 text-sm font-mono"
                                                            aria-label={t("sidebar.edit")}
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 px-3 text-xs font-mono"
                                                                onMouseDown={handleActionMouseDown}
                                                                onClick={handleSaveClick}
                                                            >
                                                                {t("sidebar.save")}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 px-3 text-xs font-mono"
                                                                onMouseDown={handleActionMouseDown}
                                                                onClick={handleCancelClick}
                                                            >
                                                                {t("sidebar.cancel")}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p
                                                        className={cn(
                                                            "text-sm font-mono truncate transition-colors duration-200",
                                                            isCurrent ? "text-terminal-dark font-medium" : "text-terminal-muted"
                                                        )}
                                                    >
                                                        {session.title || t("session.untitled")}
                                                    </p>
                                                )}
                                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-mono text-terminal-muted/70">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {formatSessionDate(session.updatedAt)}
                                                    </span>
                                                    {session.metadata?.channelType && (
                                                        <Badge className="border border-terminal-dark/10 bg-terminal-cream/80 px-2 py-0.5 text-[10px] font-mono text-terminal-dark">
                                                            {(() => {
                                                                const Icon = CHANNEL_TYPE_ICONS[session.metadata.channelType];
                                                                return (
                                                                    <>
                                                                        <Icon className="mr-1 h-3 w-3" />
                                                                        {tChannels(`types.${session.metadata.channelType}`)}
                                                                    </>
                                                                );
                                                            })()}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {!isEditing && (
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10 rounded hover:shadow-sm"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            startEditingSession(session);
                                                        }}
                                                        title={t("sidebar.rename")}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    {session.metadata?.channelType && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0 text-terminal-muted hover:text-terminal-green hover:bg-terminal-green/10 rounded hover:shadow-sm"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                onResetChannelSession(session.id);
                                                            }}
                                                            title={t("sidebar.resetChannel")}
                                                        >
                                                            <RotateCcw className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-terminal-muted hover:text-red-500 hover:bg-red-50 rounded hover:shadow-sm"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleDeleteRequest(session);
                                                        }}
                                                        title={t("sidebar.delete")}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-4 pb-4">
                    <DocumentsPanel agentId={character.id} agentName={character.name} />
                </div>
            </div>
        </div>
    );
}

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
        <div className="rounded-lg border border-terminal-dark/15 bg-terminal-dark/5 p-3 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-terminal-green" />
                    <div className="space-y-1">
                        <p className="font-mono text-sm text-terminal-dark">
                            {t("scheduledRun.active", { taskName: run.taskName })}
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
