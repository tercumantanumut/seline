/**
 * Active Tasks Indicator
 * 
 * Header component showing currently running scheduled tasks.
 * Displays a pulsing indicator with count and dropdown for details.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clock, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useActiveTaskCount, useActiveTasks } from "@/lib/stores/active-tasks-store";
import { cn } from "@/lib/utils";

export function ActiveTasksIndicator() {
  const t = useTranslations("schedules.notifications");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const count = useActiveTaskCount();
  const tasks = useActiveTasks();

  // Don't render if no active tasks
  if (count === 0) {
    return null;
  }

  const formatTimeAgo = (startedAt: string) => {
    const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative gap-2 font-mono text-sm",
            "text-terminal-green hover:text-terminal-green/80",
            "hover:bg-terminal-green/10"
          )}
        >
          {/* Pulsing indicator */}
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terminal-green opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-terminal-green" />
          </span>
          
          {/* Count */}
          <span>{t("activeTasks", { count })}</span>
          
          {/* Spinning loader */}
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-0 bg-terminal-cream border-terminal-green/30"
        align="end"
      >
        <div className="p-3 border-b border-terminal-green/20">
          <h4 className="font-mono font-semibold text-terminal-dark text-sm">
            {t("activeTasks", { count })}
          </h4>
        </div>
        
        <div className="max-h-64 overflow-y-auto">
          {tasks.map((task) => (
            <div
              key={task.runId}
              className="p-3 border-b border-terminal-green/10 last:border-0 hover:bg-terminal-green/5 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-medium text-terminal-dark truncate">
                    {task.taskName}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-terminal-muted font-mono">
                    <Clock className="h-3 w-3" />
                    <span>{t("startedAgo", { time: formatTimeAgo(task.startedAt) })}</span>
                  </div>
                </div>
                
                {task.sessionId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs font-mono text-terminal-green hover:text-terminal-green/80"
                    onClick={() => {
                      const url = `/chat/${task.characterId}?sessionId=${task.sessionId}`;
                      router.push(url);
                      setOpen(false);
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {t("viewTask")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
