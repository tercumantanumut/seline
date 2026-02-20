"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const COMPOSER_DRAFT_STORAGE_PREFIX = "seline:composer-draft";

interface ComposerDraftSnapshot {
  text: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

const inMemoryDraftCache = new Map<string, ComposerDraftSnapshot>();

function resolveStorageKey(sessionId?: string | null): string {
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  return `${COMPOSER_DRAFT_STORAGE_PREFIX}:${normalizedSessionId || "default"}`;
}

function normalizeSnapshot(value: unknown): ComposerDraftSnapshot {
  if (typeof value === "string") {
    return {
      text: value,
      selectionStart: null,
      selectionEnd: null,
    };
  }

  if (!value || typeof value !== "object") {
    return {
      text: "",
      selectionStart: null,
      selectionEnd: null,
    };
  }

  const candidate = value as Partial<ComposerDraftSnapshot>;
  return {
    text: typeof candidate.text === "string" ? candidate.text : "",
    selectionStart: typeof candidate.selectionStart === "number" ? candidate.selectionStart : null,
    selectionEnd: typeof candidate.selectionEnd === "number" ? candidate.selectionEnd : null,
  };
}

function readDraft(storageKey: string): ComposerDraftSnapshot {
  const cached = inMemoryDraftCache.get(storageKey);
  if (cached !== undefined) {
    return cached;
  }

  if (typeof window === "undefined") {
    return {
      text: "",
      selectionStart: null,
      selectionEnd: null,
    };
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) {
      const emptySnapshot = {
        text: "",
        selectionStart: null,
        selectionEnd: null,
      };
      inMemoryDraftCache.set(storageKey, emptySnapshot);
      return emptySnapshot;
    }

    let parsed: unknown = rawValue;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      // Backward-compatible fallback for older plain-text draft values.
    }

    const snapshot = normalizeSnapshot(parsed);
    inMemoryDraftCache.set(storageKey, snapshot);
    return snapshot;
  } catch {
    return {
      text: "",
      selectionStart: null,
      selectionEnd: null,
    };
  }
}

function persistDraft(storageKey: string, snapshot: ComposerDraftSnapshot): void {
  const normalizedSnapshot = snapshot.text.length === 0
    ? { text: "", selectionStart: null, selectionEnd: null }
    : snapshot;

  inMemoryDraftCache.set(storageKey, normalizedSnapshot);

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (normalizedSnapshot.text.length === 0) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(normalizedSnapshot));
  } catch {
    // Ignore persistence failures (private mode/quota), keep in-memory fallback.
  }
}

export function useSessionComposerDraft(sessionId?: string | null) {
  const storageKey = useMemo(() => resolveStorageKey(sessionId), [sessionId]);
  const storageKeyRef = useRef(storageKey);
  const initialSnapshot = useMemo(() => readDraft(storageKey), [storageKey]);
  const [draft, setDraftState] = useState<string>(initialSnapshot.text);
  const draftRef = useRef(initialSnapshot.text);
  const selectionRef = useRef<Pick<ComposerDraftSnapshot, "selectionStart" | "selectionEnd">>({
    selectionStart: initialSnapshot.selectionStart,
    selectionEnd: initialSnapshot.selectionEnd,
  });
  const [restoredSelection, setRestoredSelection] = useState<Pick<ComposerDraftSnapshot, "selectionStart" | "selectionEnd">>({
    selectionStart: initialSnapshot.selectionStart,
    selectionEnd: initialSnapshot.selectionEnd,
  });

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    storageKeyRef.current = storageKey;
    const snapshot = readDraft(storageKey);
    draftRef.current = snapshot.text;
    selectionRef.current = {
      selectionStart: snapshot.selectionStart,
      selectionEnd: snapshot.selectionEnd,
    };
    setDraftState(snapshot.text);
    setRestoredSelection({
      selectionStart: snapshot.selectionStart,
      selectionEnd: snapshot.selectionEnd,
    });
  }, [storageKey]);

  const setDraft = useCallback((value: string | ((previous: string) => string)) => {
    setDraftState((previous) => {
      const nextValue = typeof value === "function" ? value(previous) : value;
      draftRef.current = nextValue;
      persistDraft(storageKeyRef.current, {
        text: nextValue,
        selectionStart: selectionRef.current.selectionStart,
        selectionEnd: selectionRef.current.selectionEnd,
      });
      return nextValue;
    });
  }, []);

  const setSelection = useCallback((selectionStart: number | null, selectionEnd: number | null) => {
    selectionRef.current = {
      selectionStart,
      selectionEnd,
    };

    persistDraft(storageKeyRef.current, {
      text: draftRef.current,
      selectionStart,
      selectionEnd,
    });
  }, []);

  const clearDraft = useCallback(() => {
    selectionRef.current = {
      selectionStart: null,
      selectionEnd: null,
    };
    setRestoredSelection({
      selectionStart: null,
      selectionEnd: null,
    });
    persistDraft(storageKeyRef.current, {
      text: "",
      selectionStart: null,
      selectionEnd: null,
    });
    draftRef.current = "";
    setDraftState("");
  }, []);

  return {
    draft,
    setDraft,
    setSelection,
    restoredSelection,
    clearDraft,
  };
}
