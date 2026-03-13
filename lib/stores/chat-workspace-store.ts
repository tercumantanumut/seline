"use client";

import { create } from "zustand";

const STORAGE_KEY = "selene-chat-workspace-v1";
const MAX_RECENTLY_CLOSED = 8;

export interface ChatWorkspaceTab {
  sessionId: string;
  title: string | null;
  characterId: string | null;
  characterName: string | null;
  updatedAt: string | null;
  unavailable: boolean;
}

interface PersistedChatWorkspaceState {
  tabs: ChatWorkspaceTab[];
  activeSessionId: string | null;
  recentlyClosed: ChatWorkspaceTab[];
}

export interface OpenChatWorkspaceSession {
  sessionId: string;
  title?: string | null;
  characterId?: string | null;
  characterName?: string | null;
  updatedAt?: string | null;
}

interface ChatWorkspaceCloseResult {
  closed: boolean;
  nextActiveSessionId: string | null;
}

interface ChatWorkspaceState extends PersistedChatWorkspaceState {
  hydrated: boolean;
  hydrate: (fallbackSession?: OpenChatWorkspaceSession | null) => void;
  openSession: (session: OpenChatWorkspaceSession) => void;
  syncSessions: (sessions: OpenChatWorkspaceSession[]) => void;
  setActiveSession: (sessionId: string | null) => void;
  closeSession: (sessionId: string) => ChatWorkspaceCloseResult;
  removeSession: (sessionId: string) => void;
  markUnavailable: (sessionId: string, unavailable: boolean) => void;
  reopenLastClosed: () => string | null;
  reset: () => void;
}

function buildTab(session: OpenChatWorkspaceSession, existing?: ChatWorkspaceTab): ChatWorkspaceTab {
  return {
    sessionId: session.sessionId,
    title: session.title ?? existing?.title ?? null,
    characterId: session.characterId ?? existing?.characterId ?? null,
    characterName: session.characterName ?? existing?.characterName ?? null,
    updatedAt: session.updatedAt ?? existing?.updatedAt ?? null,
    unavailable: existing?.unavailable ?? false,
  };
}

function isChatWorkspaceTab(value: unknown): value is ChatWorkspaceTab {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ChatWorkspaceTab>;
  return (
    typeof candidate.sessionId === "string" &&
    candidate.sessionId.length > 0 &&
    (candidate.title === null || typeof candidate.title === "string" || candidate.title === undefined) &&
    (candidate.characterId === null || typeof candidate.characterId === "string" || candidate.characterId === undefined) &&
    (candidate.characterName === null || typeof candidate.characterName === "string" || candidate.characterName === undefined) &&
    (candidate.updatedAt === null || typeof candidate.updatedAt === "string" || candidate.updatedAt === undefined) &&
    typeof candidate.unavailable === "boolean"
  );
}

function sanitizePersistedState(value: unknown): PersistedChatWorkspaceState {
  if (!value || typeof value !== "object") {
    return { tabs: [], activeSessionId: null, recentlyClosed: [] };
  }

  const candidate = value as Partial<PersistedChatWorkspaceState>;
  const tabs = Array.isArray(candidate.tabs)
    ? candidate.tabs.filter(isChatWorkspaceTab)
    : [];
  const recentlyClosed = Array.isArray(candidate.recentlyClosed)
    ? candidate.recentlyClosed.filter(isChatWorkspaceTab).slice(0, MAX_RECENTLY_CLOSED)
    : [];
  const activeSessionId =
    typeof candidate.activeSessionId === "string" && candidate.activeSessionId.length > 0
      ? candidate.activeSessionId
      : null;

  return { tabs, activeSessionId, recentlyClosed };
}

function readPersistedState(): PersistedChatWorkspaceState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return sanitizePersistedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function getEmptyPersistedState(): PersistedChatWorkspaceState {
  return { tabs: [], activeSessionId: null, recentlyClosed: [] };
}

function persistState(state: PersistedChatWorkspaceState): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore persistence failures in constrained runtimes.
  }
}

function computeNextActiveSessionId(
  tabs: ChatWorkspaceTab[],
  closedSessionId: string,
  currentActiveSessionId: string | null,
): string | null {
  if (currentActiveSessionId !== closedSessionId) {
    return currentActiveSessionId;
  }

  const closedIndex = tabs.findIndex((tab) => tab.sessionId === closedSessionId);
  if (closedIndex === -1) {
    return currentActiveSessionId;
  }

  const fallback = tabs[closedIndex + 1] ?? tabs[closedIndex - 1] ?? null;
  return fallback?.sessionId ?? null;
}

function pushRecentlyClosed(recentlyClosed: ChatWorkspaceTab[], tab: ChatWorkspaceTab): ChatWorkspaceTab[] {
  const next = [tab, ...recentlyClosed.filter((item) => item.sessionId !== tab.sessionId)];
  return next.slice(0, MAX_RECENTLY_CLOSED);
}

export const useChatWorkspaceStore = create<ChatWorkspaceState>((set, get) => ({
  tabs: [],
  activeSessionId: null,
  recentlyClosed: [],
  hydrated: false,
  hydrate: (fallbackSession) => {
    const current = get();
    if (current.hydrated) {
      return;
    }

    const persisted = readPersistedState();
    const fallbackTab = fallbackSession ? buildTab(fallbackSession) : null;
    const shouldSeedFallback = persisted == null;
    const baseState = persisted ?? getEmptyPersistedState();
    const hasFallback = fallbackTab && !baseState.tabs.some((tab) => tab.sessionId === fallbackTab.sessionId);
    const tabs = shouldSeedFallback && hasFallback && fallbackTab
      ? [fallbackTab, ...baseState.tabs]
      : baseState.tabs;
    const activeSessionId =
      baseState.activeSessionId ??
      (shouldSeedFallback ? fallbackTab?.sessionId ?? null : null) ??
      tabs[0]?.sessionId ??
      null;
    const nextState = {
      tabs,
      activeSessionId,
      recentlyClosed: baseState.recentlyClosed,
      hydrated: true,
    };
    persistState(nextState);
    set(nextState);
  },
  openSession: (session) => {
    const current = get();
    const existing = current.tabs.find((tab) => tab.sessionId === session.sessionId);
    const nextTab = buildTab(session, existing);
    const nextTabs = existing
      ? current.tabs.map((tab) => (tab.sessionId === session.sessionId ? nextTab : tab))
      : [...current.tabs, nextTab];
    const nextState = {
      tabs: nextTabs,
      activeSessionId: session.sessionId,
      recentlyClosed: current.recentlyClosed.filter((tab) => tab.sessionId !== session.sessionId),
    };
    persistState(nextState);
    set(nextState);
  },
  syncSessions: (sessions) => {
    if (sessions.length === 0) {
      return;
    }

    const current = get();
    const sessionMap = new Map(sessions.map((session) => [session.sessionId, session]));
    const nextTabs = current.tabs.map((tab) => {
      const session = sessionMap.get(tab.sessionId);
      return session ? buildTab(session, tab) : tab;
    });
    const nextRecentlyClosed = current.recentlyClosed.map((tab) => {
      const session = sessionMap.get(tab.sessionId);
      return session ? buildTab(session, tab) : tab;
    });
    const nextState = {
      tabs: nextTabs,
      activeSessionId: current.activeSessionId,
      recentlyClosed: nextRecentlyClosed,
    };
    persistState(nextState);
    set(nextState);
  },
  setActiveSession: (sessionId) => {
    const current = get();
    const nextState = {
      tabs: current.tabs,
      activeSessionId: sessionId,
      recentlyClosed: current.recentlyClosed,
    };
    persistState(nextState);
    set(nextState);
  },
  closeSession: (sessionId) => {
    const current = get();
    const tab = current.tabs.find((item) => item.sessionId === sessionId);
    if (!tab) {
      return { closed: false, nextActiveSessionId: current.activeSessionId };
    }

    const nextActiveSessionId = computeNextActiveSessionId(current.tabs, sessionId, current.activeSessionId);
    const nextState = {
      tabs: current.tabs.filter((item) => item.sessionId !== sessionId),
      activeSessionId: nextActiveSessionId,
      recentlyClosed: pushRecentlyClosed(current.recentlyClosed, tab),
    };
    persistState(nextState);
    set(nextState);
    return { closed: true, nextActiveSessionId };
  },
  removeSession: (sessionId) => {
    const current = get();
    const nextActiveSessionId = current.activeSessionId === sessionId
      ? current.tabs.find((item) => item.sessionId !== sessionId)?.sessionId ?? null
      : current.activeSessionId;
    const nextState = {
      tabs: current.tabs.filter((item) => item.sessionId !== sessionId),
      activeSessionId: nextActiveSessionId,
      recentlyClosed: current.recentlyClosed.filter((item) => item.sessionId !== sessionId),
    };
    persistState(nextState);
    set(nextState);
  },
  markUnavailable: (sessionId, unavailable) => {
    const current = get();
    const nextTabs = current.tabs.map((tab) =>
      tab.sessionId === sessionId ? { ...tab, unavailable } : tab,
    );
    const nextState = {
      tabs: nextTabs,
      activeSessionId: current.activeSessionId,
      recentlyClosed: current.recentlyClosed,
    };
    persistState(nextState);
    set(nextState);
  },
  reopenLastClosed: () => {
    const current = get();
    const [lastClosed, ...rest] = current.recentlyClosed;
    if (!lastClosed) {
      return null;
    }

    const nextTabs = current.tabs.some((tab) => tab.sessionId === lastClosed.sessionId)
      ? current.tabs.map((tab) => (tab.sessionId === lastClosed.sessionId ? lastClosed : tab))
      : [...current.tabs, { ...lastClosed, unavailable: false }];
    const nextState = {
      tabs: nextTabs,
      activeSessionId: lastClosed.sessionId,
      recentlyClosed: rest,
    };
    persistState(nextState);
    set(nextState);
    return lastClosed.sessionId;
  },
  reset: () => {
    const nextState = { tabs: [], activeSessionId: null, recentlyClosed: [], hydrated: true };
    persistState(nextState);
    set(nextState);
  },
}));

export {
  computeNextActiveSessionId,
  sanitizePersistedState,
};
