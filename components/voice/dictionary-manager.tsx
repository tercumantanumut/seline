"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PlusIcon, XIcon, Loader2Icon, BookOpenIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface DictionaryManagerProps {
  autoLearnEnabled?: boolean;
  className?: string;
}

export function DictionaryManager({ autoLearnEnabled = true, className }: DictionaryManagerProps) {
  const [words, setWords] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newWord, setNewWord] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingWord, setRemovingWord] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("voice");

  const loadDictionary = useCallback(async () => {
    try {
      const response = await fetch("/api/voice/dictionary");
      const data = await response.json() as { words?: string[] };
      if (Array.isArray(data.words)) {
        setWords(data.words);
      }
    } catch (error) {
      console.error("[DictionaryManager] Failed to load:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDictionary();
  }, [loadDictionary]);

  const handleAdd = useCallback(async () => {
    const trimmed = newWord.trim();
    if (!trimmed) return;

    setIsAdding(true);
    try {
      const response = await fetch("/api/voice/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: [trimmed] }),
      });
      if (!response.ok) throw new Error("Failed to add word");
      const data = await response.json() as { words?: string[] };
      if (Array.isArray(data.words)) {
        setWords(data.words);
        setNewWord("");
        inputRef.current?.focus();
        toast.success(t("dictionaryAdded", { word: trimmed }));
      }
    } catch (error) {
      console.error("[DictionaryManager] Add failed:", error);
      toast.error(t("dictionaryAddFailed"));
    } finally {
      setIsAdding(false);
    }
  }, [newWord, t]);

  const handleRemove = useCallback(async (word: string) => {
    setRemovingWord(word);
    try {
      const response = await fetch(`/api/voice/dictionary?word=${encodeURIComponent(word)}`, {
        method: "DELETE",
      });
      const data = await response.json() as { words?: string[] };
      if (Array.isArray(data.words)) {
        setWords(data.words);
        toast.success(t("dictionaryRemoved", { word }));
      }
    } catch (error) {
      console.error("[DictionaryManager] Remove failed:", error);
      toast.error(t("dictionaryRemoveFailed"));
    } finally {
      setRemovingWord(null);
    }
  }, [t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleAdd();
      }
    },
    [handleAdd]
  );

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2Icon className="size-4 animate-spin text-terminal-muted" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Add word input */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("dictionaryPlaceholder")}
          className="flex-1 rounded-md border border-terminal-border bg-transparent px-3 py-1.5 text-xs font-mono text-terminal-dark placeholder:text-terminal-muted/50 outline-none focus:border-terminal-dark/30 transition-colors"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleAdd()}
          disabled={isAdding || !newWord.trim()}
          className="h-7 px-2 text-xs font-mono"
        >
          {isAdding ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <PlusIcon className="size-3" />
          )}
        </Button>
      </div>

      {/* Auto-learn indicator */}
      {autoLearnEnabled && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-terminal-muted/60">
          <SparklesIcon className="size-3" />
          {t("dictionaryAutoLearnHint")}
        </div>
      )}

      {/* Word list */}
      {words.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-terminal-muted">
          <BookOpenIcon className="size-5" />
          <span className="text-xs font-mono">{t("dictionaryEmpty")}</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {words.map((word) => (
            <span
              key={word}
              className="group flex items-center gap-1 rounded-full border border-terminal-border/50 bg-terminal-cream/40 px-2.5 py-0.5 text-xs font-mono text-terminal-dark transition-colors hover:bg-terminal-cream/70"
            >
              {word}
              <button
                onClick={() => void handleRemove(word)}
                disabled={removingWord === word}
                className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-terminal-muted hover:text-red-500"
                title={`Remove "${word}"`}
              >
                {removingWord === word ? (
                  <Loader2Icon className="size-2.5 animate-spin" />
                ) : (
                  <XIcon className="size-2.5" />
                )}
              </button>
            </span>
          ))}
        </div>
      )}

      {words.length > 0 && (
        <div className="text-[10px] font-mono text-terminal-muted/50">
          {t("dictionaryCount", { count: words.length })}
        </div>
      )}
    </div>
  );
}
