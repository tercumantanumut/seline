"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarClock, ArrowRight, Sparkles, HelpCircle, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { SchedulePreset } from "@/lib/scheduler/presets/types";
import { PresetCard } from "./preset-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface PresetSelectorProps {
    onSelectPreset: (preset: SchedulePreset) => void;
    onSkip: () => void;
}

export function PresetSelector({ onSelectPreset, onSkip }: PresetSelectorProps) {
    const t = useTranslations("schedules");
    const [presets, setPresets] = useState<SchedulePreset[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<string>("all");
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    useEffect(() => {
        async function fetchPresets() {
            try {
                const response = await fetch("/api/schedules/presets");
                const data = await response.json();
                setPresets(data.presets || []);
            } catch (error) {
                console.error("Failed to fetch presets:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchPresets();
    }, []);

    const filteredPresets = category === "all"
        ? presets
        : presets.filter(p => p.category === category);

    const categories = ["all", ...Array.from(new Set(presets.map(p => p.category)))];

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-[280px] rounded-xl bg-muted/50 border border-border" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-8 py-4">
            <div className="text-center space-y-3 max-w-2xl mx-auto mb-8">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-2"
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t("presets.title")}
                </motion.div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground text-center">
                    {t("presets.title")}
                </h2>
                <p className="text-muted-foreground text-lg text-center">
                    {t("presets.subtitle")}
                </p>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                {categories.length > 2 && (
                    <Tabs value={category} onValueChange={setCategory} className="w-full sm:w-auto">
                        <TabsList className="bg-muted/50 border border-border">
                            {categories.map((cat) => (
                                <TabsTrigger key={cat} value={cat} className="capitalize px-6">
                                    {cat === "all" ? t("presets.categories.all") : t(`presets.categories.${cat}`)}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                )}

                <Button variant="ghost" onClick={onSkip} className="text-muted-foreground hover:text-foreground">
                    {t("presets.createFromScratch")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>

            <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                <AnimatePresence mode="popLayout">
                    {filteredPresets.map((preset) => (
                        <PresetCard
                            key={preset.id}
                            preset={preset}
                            onSelect={onSelectPreset}
                        />
                    ))}
                </AnimatePresence>
            </motion.div>

            <div className="mt-12 flex flex-col items-center">
                <div className="w-full max-w-2xl border rounded-2xl bg-muted/30 overflow-hidden transition-all duration-300">
                    <Button
                        variant="ghost"
                        onClick={() => setIsHelpOpen(!isHelpOpen)}
                        className="w-full flex items-center justify-between p-6 h-auto hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background border">
                                <HelpCircle className="w-5 h-5 text-primary" />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold">{t("presets.help.whatArePresets")}</p>
                                <p className="text-xs text-muted-foreground">{t("presets.help.explanation")}</p>
                            </div>
                        </div>
                        <ChevronRight className={cn("w-5 h-5 transition-transform duration-300 text-muted-foreground text-muted-foreground", isHelpOpen && "rotate-90")} />
                    </Button>

                    <AnimatePresence>
                        {isHelpOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="px-16 pb-6 pt-2 text-sm text-muted-foreground space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
                                            <p className="font-medium text-foreground">{t("presets.help.benefit1")}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
                                            <p className="font-medium text-foreground">{t("presets.help.benefit2")}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
                                            <p className="font-medium text-foreground">{t("presets.help.benefit3")}</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
