"use client";

import { useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const isMacOS = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const mod = isMacOS ? "⌘" : "Ctrl";

const SHORTCUTS = [
  { label: "New tab", keys: `${mod}+T` },
  { label: "Close tab", keys: `${mod}+W` },
  { label: "Reopen tab", keys: `${mod}+⇧+T` },
  { label: "Next tab", keys: "Ctrl+Tab" },
  { label: "Prev tab", keys: "Ctrl+⇧+Tab" },
  { label: "Tab 1–9", keys: `${mod}+1–9` },
  { divider: true } as const,
  { label: "Focus composer", keys: "/" },
  { label: "Focus composer", keys: `${mod}+L` },
  { label: "Library", keys: `${mod}+K` },
] satisfies ReadonlyArray<{ label: string; keys: string } | { divider: true }>;

export function BrowserShortcutGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-full text-muted-foreground/50 hover:text-muted-foreground"
          title="Keyboard shortcuts"
        >
          <Keyboard className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-52 rounded-lg border border-border bg-popover p-0 shadow-xl data-[state=closed]:animate-none data-[state=open]:animate-none"
      >
        <div className="border-b border-border/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Shortcuts
        </div>
        <div className="flex flex-col py-1">
          {SHORTCUTS.map((item, i) =>
            "divider" in item ? (
              <div key={i} className="my-1 border-t border-border/40" />
            ) : (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-1"
              >
                <span className="text-xs text-popover-foreground/80">
                  {item.label}
                </span>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {item.keys}
                </kbd>
              </div>
            ),
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
