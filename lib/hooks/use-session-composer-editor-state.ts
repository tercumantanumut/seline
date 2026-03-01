"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";

const COMPOSER_EDITOR_MODE_STORAGE_PREFIX = "seline:composer-editor-mode";
const COMPOSER_TIPTAP_DRAFT_STORAGE_PREFIX = "seline:composer-tiptap-draft";

const inMemoryEditorModeCache = new Map<string, boolean>();
const inMemoryTiptapDraftCache = new Map<string, JSONContent | null>();

function resolveStorageKey(prefix: string, sessionId?: string | null): string {
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  return `${prefix}:${normalizedSessionId || "default"}`;
}

function readEditorMode(storageKey: string): boolean {
  const cached = inMemoryEditorModeCache.get(storageKey);
  if (cached !== undefined) {
    return cached;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    const value = rawValue === "true";
    inMemoryEditorModeCache.set(storageKey, value);
    return value;
  } catch {
    return false;
  }
}

function persistEditorMode(storageKey: string, isEditorMode: boolean): void {
  inMemoryEditorModeCache.set(storageKey, isEditorMode);

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!isEditorMode) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, "true");
  } catch {
    // Ignore storage failures and keep in-memory fallback.
  }
}

function readTiptapDraft(storageKey: string): JSONContent | null {
  const cached = inMemoryTiptapDraftCache.get(storageKey);
  if (cached !== undefined) {
    return cached;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) {
      inMemoryTiptapDraftCache.set(storageKey, null);
      return null;
    }

    const parsed = JSON.parse(rawValue) as JSONContent;
    if (!parsed || typeof parsed !== "object") {
      inMemoryTiptapDraftCache.set(storageKey, null);
      return null;
    }

    inMemoryTiptapDraftCache.set(storageKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function persistTiptapDraft(storageKey: string, draft: JSONContent | null): void {
  inMemoryTiptapDraftCache.set(storageKey, draft);

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (draft === null) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Ignore storage failures and keep in-memory fallback.
  }
}

export function useSessionComposerEditorState(sessionId?: string | null) {
  const editorModeStorageKey = useMemo(
    () => resolveStorageKey(COMPOSER_EDITOR_MODE_STORAGE_PREFIX, sessionId),
    [sessionId],
  );
  const tiptapDraftStorageKey = useMemo(
    () => resolveStorageKey(COMPOSER_TIPTAP_DRAFT_STORAGE_PREFIX, sessionId),
    [sessionId],
  );

  const editorModeStorageKeyRef = useRef(editorModeStorageKey);
  const tiptapDraftStorageKeyRef = useRef(tiptapDraftStorageKey);

  const [isEditorMode, setIsEditorModeState] = useState<boolean>(() => readEditorMode(editorModeStorageKey));
  const [tiptapDraft, setTiptapDraftState] = useState<JSONContent | null>(() => readTiptapDraft(tiptapDraftStorageKey));

  useEffect(() => {
    editorModeStorageKeyRef.current = editorModeStorageKey;
    setIsEditorModeState(readEditorMode(editorModeStorageKey));
  }, [editorModeStorageKey]);

  useEffect(() => {
    tiptapDraftStorageKeyRef.current = tiptapDraftStorageKey;
    setTiptapDraftState(readTiptapDraft(tiptapDraftStorageKey));
  }, [tiptapDraftStorageKey]);

  const setIsEditorMode = useCallback(
    (value: boolean | ((previous: boolean) => boolean)) => {
      setIsEditorModeState((previous) => {
        const nextValue = typeof value === "function" ? value(previous) : value;
        persistEditorMode(editorModeStorageKeyRef.current, nextValue);
        return nextValue;
      });
    },
    [],
  );

  const setTiptapDraft = useCallback(
    (
      value:
        | JSONContent
        | null
        | ((previous: JSONContent | null) => JSONContent | null),
    ) => {
      setTiptapDraftState((previous) => {
        const nextValue = typeof value === "function" ? value(previous) : value;
        persistTiptapDraft(tiptapDraftStorageKeyRef.current, nextValue);
        return nextValue;
      });
    },
    [],
  );

  const clearTiptapDraft = useCallback(() => {
    setTiptapDraft(null);
  }, [setTiptapDraft]);

  return {
    isEditorMode,
    setIsEditorMode,
    tiptapDraft,
    setTiptapDraft,
    clearTiptapDraft,
  };
}
