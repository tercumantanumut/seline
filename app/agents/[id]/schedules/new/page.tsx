"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { ScheduleFormFullPage } from "@/components/schedules/schedule-form-full-page";
import { useTranslations } from "next-intl";
import type { ScheduledTask } from "@/lib/db/sqlite-schedule-schema";

interface CharacterBasic {
    id: string;
    name: string;
    displayName?: string | null;
}

export default function NewSchedulePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: characterId } = use(params);
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

    const handleCreate = async (data: Partial<ScheduledTask>) => {
        const res = await fetch("/api/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, characterId }),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || "Failed to create schedule");
        }
    };

    if (isLoading) {
        return (
            <Shell hideNav>
                <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
                </div>
            </Shell>
        );
    }

    if (error) {
        return (
            <Shell hideNav>
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
        <Shell hideNav>
            <ScheduleFormFullPage
                characterId={characterId}
                characterName={agentName}
                onSubmit={handleCreate}
            />
        </Shell>
    );
}
