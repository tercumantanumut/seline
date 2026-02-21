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

export default function EditSchedulePage({
    params,
}: {
    params: Promise<{ id: string; scheduleId: string }>;
}) {
    const { id: characterId, scheduleId } = use(params);
    const tc = useTranslations("common");
    const t = useTranslations("schedules");

    const [character, setCharacter] = useState<CharacterBasic | null>(null);
    const [schedule, setSchedule] = useState<ScheduledTask | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load character and schedule info
    useEffect(() => {
        async function loadData() {
            try {
                // Load character
                const charResponse = await fetch(`/api/characters/${characterId}`);
                if (charResponse.ok) {
                    const charData = await charResponse.json();
                    setCharacter(charData.character);
                } else if (charResponse.status === 404) {
                    setError(t("agentNotFound"));
                    setIsLoading(false);
                    return;
                } else if (charResponse.status === 403) {
                    setError(t("accessDenied"));
                    setIsLoading(false);
                    return;
                }

                // Load schedule
                const scheduleResponse = await fetch(`/api/schedules/${scheduleId}`);
                if (scheduleResponse.ok) {
                    const scheduleData = await scheduleResponse.json();
                    setSchedule(scheduleData.schedule);
                } else if (scheduleResponse.status === 404) {
                    setError(t("scheduleNotFound"));
                } else if (scheduleResponse.status === 403) {
                    setError(t("accessDenied"));
                }
            } catch (err) {
                console.error("Failed to load data:", err);
                setError(t("loadScheduleFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [characterId, scheduleId]);

    const handleUpdate = async (data: Partial<ScheduledTask>) => {
        const res = await fetch(`/api/schedules/${scheduleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || t("updateScheduleFailed"));
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
                            <Link href={`/agents/${characterId}/schedules`}>{tc("back")}</Link>
                        </Button>
                    </div>
                </div>
            </Shell>
        );
    }

    if (!schedule) {
        return (
            <Shell hideNav>
                <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center gap-4 max-w-md text-center">
                        <AlertCircle className="h-12 w-12 text-destructive" />
                        <h1 className="text-xl font-semibold font-mono">Schedule not found</h1>
                        <Button asChild>
                            <Link href={`/agents/${characterId}/schedules`}>{tc("back")}</Link>
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
                schedule={schedule}
                onSubmit={handleUpdate}
            />
        </Shell>
    );
}
