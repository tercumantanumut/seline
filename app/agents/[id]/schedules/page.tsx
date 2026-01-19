"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertCircle, Calendar } from "lucide-react";
import { ScheduleList } from "@/components/schedules/schedule-list";
import { useTranslations } from "next-intl";

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

  const [character, setCharacter] = useState<CharacterBasic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load character info
  useEffect(() => {
    async function loadCharacter() {
      try {
        const response = await fetch(`/api/characters/${characterId}`);
        if (response.ok) {
          const data = await response.json();
          setCharacter(data.character);
        } else if (response.status === 404) {
          setError("Agent not found");
        } else if (response.status === 403) {
          setError("Access denied");
        }
      } catch (err) {
        console.error("Failed to load character:", err);
        setError("Failed to load agent");
      } finally {
        setIsLoading(false);
      }
    }
    loadCharacter();
  }, [characterId]);

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

  return (
    <Shell>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-terminal-border bg-terminal-cream/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-terminal-green" />
            <h1 className="text-lg font-semibold font-mono text-terminal-dark">
              {t("title")}
            </h1>
            {character && (
              <span className="text-terminal-muted font-mono">
                - {character.displayName || character.name}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            <ScheduleList
              characterId={characterId}
              characterName={character?.displayName || character?.name}
            />
          </div>
        </ScrollArea>
      </div>
    </Shell>
  );
}

