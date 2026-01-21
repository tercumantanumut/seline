"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, Clock, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PRESET_ICONS, CATEGORY_COLORS } from "./preset-icons";
import { SchedulePreset } from "@/lib/scheduler/presets/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PresetCardProps {
    preset: SchedulePreset;
    onSelect: (preset: SchedulePreset) => void;
    isSelected?: boolean;
    hasRequiredIntegrations?: boolean;
    alternativeMethod?: string;
}

export function PresetCard({
    preset,
    onSelect,
    isSelected,
    hasRequiredIntegrations = true,
    alternativeMethod,
}: PresetCardProps) {
    const t = useTranslations("schedules");
    const tc = useTranslations("common");
    const Icon = PRESET_ICONS[preset.icon] || Clock;
    const categoryColor = CATEGORY_COLORS[preset.category as keyof typeof CATEGORY_COLORS] || "bg-secondary text-secondary-foreground";

    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "relative group flex flex-col h-full rounded-xl border bg-card p-5 transition-shadow hover:shadow-lg",
                isSelected ? "ring-2 ring-primary border-primary" : "border-border"
            )}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={cn("p-2.5 rounded-lg", categoryColor)}>
                    <Icon className="w-5 h-5" />
                </div>
                <Badge variant="outline" className={cn("capitalize font-normal", categoryColor)}>
                    {t(`presets.categories.${preset.category}`)}
                </Badge>
            </div>

            <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2 line-clamp-1">{preset.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[2.5rem]">
                    {preset.description}
                </p>

                <div className="flex flex-col gap-2 mt-auto">
                    <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        <span>{t("presets.estimatedTime", { duration: preset.estimatedDuration || "5-10m" })}</span>
                    </div>

                    {!hasRequiredIntegrations && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center text-xs text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                                        <span className="truncate">
                                            {alternativeMethod
                                                ? t("presets.alternativeAvailable", { method: alternativeMethod })
                                                : t("presets.requiresIntegration", { integration: preset.requiredIntegrations?.[0] || "API" })
                                            }
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t("presets.requiresIntegration", { integration: preset.requiredIntegrations?.join(", ") || "API" })}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </div>

            <Button
                className="w-full mt-6 group-hover:bg-primary group-hover:text-primary-foreground"
                variant={isSelected ? "default" : "outline"}
                onClick={() => onSelect(preset)}
            >
                {isSelected ? (
                    <>
                        <Check className="w-4 h-4 mr-2" />
                        {tc("selected") || "Selected"}
                    </>
                ) : (
                    t("presets.useTemplate")
                )}
            </Button>

            {isSelected && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-1 border-2 border-background shadow-sm"
                >
                    <Check className="w-4 h-4" />
                </motion.div>
            )}
        </motion.div>
    );
}
