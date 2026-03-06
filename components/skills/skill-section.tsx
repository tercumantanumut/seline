"use client";

import { Badge } from "@/components/ui/badge";

interface SkillSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
}

export function SkillSection({ title, count, children }: SkillSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-terminal-muted">
          {title}
        </h2>
        {count !== undefined && (
          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
            {count}
          </Badge>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}
