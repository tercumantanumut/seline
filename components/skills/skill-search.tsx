"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SkillSearch({ value, onChange, placeholder = "Search skills...", className }: SkillSearchProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-terminal-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-terminal-border bg-white py-2 pl-9 pr-3 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/60 focus:border-terminal-green/40 focus:outline-none focus:ring-1 focus:ring-terminal-green/20"
      />
    </div>
  );
}
