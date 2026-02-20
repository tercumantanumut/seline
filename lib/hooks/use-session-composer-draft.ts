"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const COMPOSER_DRAFT_STORAGE_PREFIX = "seline:composer-draft";
const inMemoryDraftCache = new Map<string, string>();

function resolveStorageKey(sessionId?: string | null): string {
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  return `${COMPOSER_DRAFT_STORAGE_PREFIX}:${normalizedSessionId || "default"}`;
}

function readDraft(storageKey: string): string {
  const cached = inMemoryDraftCache.get(storageKey);
  if (cached !== undefined) {
    return cached;
  }

  if (typeof window === "undefined") {
    return "";
  }

  try {
    const value = window.sessionStorage.getItem(storageKey) || "";
    inMemoryDraftCache.set(storageKey, value);
    return value;
  } catch {
    return "";
  }
}

function persistDraft(storageKey: string, value: string): void {
  inMemoryDraftCache.set(storageKey, value);

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value.length === 0) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, value);
  } catch {
    // Ignore persistence failures (private mode/quota), keep in-memory fallback.
  }
}

export function useSessionComposerDraft(sessionId?: string | null) {
  const storageKey = useMemo(() => resolveStorageKey(sessionId), [sessionId]);
  const storageKeyRef = useRef(storageKey);
  const [draft, setDraftState] = useState<string>(() => readDraft(storageKey));

  useEffect(() => {
    storageKeyRef.current = storageKey;
    setDraftState(readDraft(storageKey));
  }, [storageKey]);

  const setDraft = useCallback((value: string | ((previous: string) => string)) => {
    setDraftState((previous) => {
      const nextValue = typeof value === "function" ? value(previous) : value;
      persistDraft(storageKeyRef.current, nextValue);
      return nextValue;
    });
  }, []);

  const clearDraft = useCallback(() => {
    persistDraft(storageKeyRef.current, "");
    setDraftState("");
  }, []);

  return {
    draft,
    setDraft,
    clearDraft,
  };
}
