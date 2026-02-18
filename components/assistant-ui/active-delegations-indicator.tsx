"use client";

import { FC } from "react";
import { useDelegationStatus } from "@/lib/hooks/use-delegation-status";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export const ActiveDelegationsIndicator: FC<{
  characterId: string | null;
}> = ({ characterId }) => {
  const { delegations } = useDelegationStatus(characterId);

  const running = delegations.filter((d) => d.running);
  if (running.length === 0) return null;

  return (
    <div className="mt-1 w-full px-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-terminal-muted cursor-default">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {running.length} active delegation{running.length !== 1 ? "s" : ""}
              {" · "}
              {running
                .map((d) => `${d.delegateAgent} (${formatElapsed(d.elapsed)})`)
                .join(" · ")}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-terminal-dark text-terminal-cream font-mono text-xs max-w-sm"
        >
          <div className="space-y-1">
            {running.map((d) => (
              <div key={d.delegationId}>
                <div className="font-semibold">{d.delegateAgent}</div>
                <div className="text-terminal-muted">
                  {d.task} — {formatElapsed(d.elapsed)} — {d.delegationId}
                </div>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
