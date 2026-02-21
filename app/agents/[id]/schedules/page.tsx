"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertCircle, Plus } from "lucide-react";
import { ScheduleList } from "@/components/schedules/schedule-list";
import { useTranslations } from "next-intl";
import { getElectronAPI } from "@/lib/electron/types";
import { cn } from "@/lib/utils";

interface CharacterBasic {
  id: string;
  name: string;
  displayName?: string | null;
}

export default function AgentSchedulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: characterId } = use(params);
  const t = useTranslations("schedules");
  const tc = useTranslations("common");
  const router = useRouter();

  const [character, setCharacter] = useState<CharacterBasic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const electronAPI = getElectronAPI();
    setIsMac(electronAPI?.platform === "darwin");
  }, []);

  // Load character info
  useEffect(() => {
    async function loadCharacter() {
      try {
        const response = await fetch(`/api/characters/${characterId}`);
        if (response.ok) {
          const data = await response.json();
          setCharacter(data.character);
        } else if (response.status === 404) {
          setError(t("agentNotFound"));
        } else if (response.status === 403) {
          setError(t("accessDenied"));
        }
      } catch (err) {
        console.error("Failed to load character:", err);
        setError(t("loadFailed"));
      } finally {
        setIsLoading(false);
      }
    }
    loadCharacter();
  }, [characterId]);

  const handleCreateNew = () => {
    router.push(`/agents/${characterId}/schedules/new`);
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold font-mono">{error}</h1>
            <Button asChild>
              <Link href="/">{tc("back")}</Link>
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  const agentName = character?.displayName || character?.name || "Agent";

  return (
    <Shell>
      <div className="flex flex-col h-full">
        {/* Content with Header */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-8">
            {/* Header */}
            <header className={cn("mb-8", isMac && "pt-2")}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <h1 className="text-2xl font-mono font-bold text-terminal-dark truncate">
                    {t("title")}
                  </h1>
                  {/* Description */}
                  <p className="mt-1 text-sm text-terminal-muted max-w-2xl break-words">
                    {t("pageDescription", { name: agentName })}
                  </p>
                </div>
                {/* New Schedule Button */}
                <Button
                  onClick={handleCreateNew}
                  className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono shadow-sm shrink-0 sm:self-start"
                >
                  <Plus className="h-4 w-4" />
                  {t("create")}
                </Button>
              </div>
            </header>

            {/* Schedule List */}
            <ScheduleList
              characterId={characterId}
              characterName={agentName}
            />
          </div>
        </ScrollArea>
      </div>
    </Shell>
  );
}
