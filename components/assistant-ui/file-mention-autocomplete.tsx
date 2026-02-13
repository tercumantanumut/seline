"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { FileIcon, FolderIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { resilientFetch } from "@/lib/utils/resilient-fetch";

interface FileResult {
  relativePath: string;
  filePath: string;
}

interface FileMentionAutocompleteProps {
  characterId: string | null;
  inputValue: string;
  cursorPosition: number;
  onInsertMention: (mention: string, atIndex: number, queryLength: number) => void;
}

/**
 * File mention autocomplete dropdown.
 * Appears when the user types `@` in the chat composer.
 * Queries synced files and shows matching results.
 */
const FileMentionAutocomplete = forwardRef<HTMLDivElement, FileMentionAutocompleteProps>(({
  characterId,
  inputValue,
  cursorPosition,
  onInsertMention,
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [atIndex, setAtIndex] = useState(-1);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect @ trigger and extract query
  useEffect(() => {
    if (!characterId) {
      setIsOpen(false);
      return;
    }

    // Look backwards from cursor for an @ that starts a mention
    const textBeforeCursor = inputValue.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1) {
      setIsOpen(false);
      return;
    }

    // Check that @ is at start of input or preceded by whitespace
    if (lastAtIndex > 0 && !/\s/.test(textBeforeCursor[lastAtIndex - 1])) {
      setIsOpen(false);
      return;
    }

    // Extract query text after @
    const mentionQuery = textBeforeCursor.slice(lastAtIndex + 1);

    // Close if there's a space after the query (mention complete)
    if (mentionQuery.includes(" ") || mentionQuery.includes("\n")) {
      setIsOpen(false);
      return;
    }

    setAtIndex(lastAtIndex);
    setQuery(mentionQuery);
    setIsOpen(true);
    setSelectedIndex(0);

    // Debounced API call
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const params = new URLSearchParams({
        characterId,
        query: mentionQuery,
        limit: "15",
      });
      const { data } = await resilientFetch<{ files?: FileResult[] }>(`/api/files/search?${params}`, { retries: 0 });
      setResults(data?.files || []);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, cursorPosition, characterId]);

  // Handle selection
  const handleSelect = useCallback(
    (file: FileResult) => {
      onInsertMention(file.relativePath, atIndex, query.length);
      setIsOpen(false);
    },
    [onInsertMention, atIndex, query.length]
  );

  // Keyboard handler (called from parent textarea)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        return true;
      }
      return false;
    },
    [isOpen, results, selectedIndex, handleSelect]
  );

  // Expose handleKeyDown via the forwarded ref's DOM element
  useImperativeHandle(ref, () => {
    const el = containerRef.current || document.createElement("div");
    (el as unknown as { handleKeyDown: typeof handleKeyDown }).handleKeyDown = handleKeyDown;
    return el;
  }, [handleKeyDown]);

  if (!isOpen || results.length === 0) return <div ref={containerRef} className="hidden" />;

  return (
    <div ref={containerRef} className="absolute bottom-full left-0 right-0 mb-1 z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
        <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border">
          Files — {results.length} match{results.length !== 1 ? "es" : ""}
        </div>
        {results.map((file, index) => {
          const isDir = file.relativePath.endsWith("/");
          const Icon = isDir ? FolderIcon : FileIcon;

          return (
            <button
              key={file.filePath}
              type="button"
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                "hover:bg-accent/50 transition-colors",
                index === selectedIndex && "bg-accent"
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent textarea blur
                handleSelect(file);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs">
                {file.relativePath}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

FileMentionAutocomplete.displayName = "FileMentionAutocomplete";

export default FileMentionAutocomplete;
