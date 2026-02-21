"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Plus, X, Palette, MessageSquare, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface PersonalizationStepProps {
    preferences: {
        visual_preferences: string[];
        communication_style: string[];
        workflow_patterns: string[];
    };
    onUpdate: (preferences: PersonalizationStepProps["preferences"]) => void;
    onContinue: () => void;
    onSkip: () => void;
    onBack: () => void;
}

const categories = [
    {
        id: "visual_preferences" as const,
        icon: Palette,
        examples: ["Prefer dark mode interfaces", "16:9 aspect ratio for images", "Minimalist design style"],
    },
    {
        id: "communication_style" as const,
        icon: MessageSquare,
        examples: ["Concise responses", "Use code blocks for technical content", "Explain concepts simply"],
    },
    {
        id: "workflow_patterns" as const,
        icon: Workflow,
        examples: ["Iterate on designs before finalizing", "Always ask for confirmation", "Show multiple options"],
    },
];

export function PersonalizationStep({
    preferences,
    onUpdate,
    onContinue,
    onSkip,
    onBack,
}: PersonalizationStepProps) {
    const t = useTranslations("onboarding.personalization");
    const [activeCategory, setActiveCategory] = useState<typeof categories[number]["id"]>("visual_preferences");
    const [newPreference, setNewPreference] = useState("");

    const handleAddPreference = () => {
        if (!newPreference.trim()) return;

        const updated = {
            ...preferences,
            [activeCategory]: [...preferences[activeCategory], newPreference.trim()],
        };
        onUpdate(updated);
        setNewPreference("");
    };

    const handleRemovePreference = (category: keyof typeof preferences, index: number) => {
        const updated = {
            ...preferences,
            [category]: preferences[category].filter((_, i) => i !== index),
        };
        onUpdate(updated);
    };

    const handleAddExample = (example: string) => {
        if (preferences[activeCategory].includes(example)) return;

        const updated = {
            ...preferences,
            [activeCategory]: [...preferences[activeCategory], example],
        };
        onUpdate(updated);
    };

    const totalPreferences = Object.values(preferences).flat().length;

    return (
        <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center max-w-2xl w-full"
            >
                <h1 className="text-2xl font-bold text-terminal-dark mb-2 font-mono">
                    {t("title")}
                </h1>
                <p className="text-terminal-muted mb-8 font-mono">
                    {t("subtitle")}
                </p>

                {/* Category tabs */}
                <div className="flex justify-center gap-2 mb-6">
                    {categories.map((category) => (
                        <button
                            key={category.id}
                            onClick={() => setActiveCategory(category.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all",
                                activeCategory === category.id
                                    ? "bg-terminal-green text-white"
                                    : "bg-terminal-dark/5 text-terminal-muted hover:bg-terminal-dark/10"
                            )}
                        >
                            <category.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{t(`categories.${category.id}.title`)}</span>
                        </button>
                    ))}
                </div>

                {/* Add preference input */}
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={newPreference}
                        onChange={(e) => setNewPreference(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddPreference()}
                        placeholder={t("addPlaceholder", { category: activeCategory.replace(/_/g, " ") })}
                        className="flex-1 rounded-lg border border-terminal-border bg-white px-4 py-3 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-2 focus:ring-terminal-green/20"
                    />
                    <Button
                        onClick={handleAddPreference}
                        disabled={!newPreference.trim()}
                        className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono"
                    >
                        <Plus className="w-4 h-4" />
                        {t("add")}
                    </Button>
                </div>

                {/* Example suggestions */}
                <div className="mb-6">
                    <p className="text-xs text-terminal-muted font-mono mb-2">
                        {t("exampleHint")}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {categories
                            .find((c) => c.id === activeCategory)
                            ?.examples.map((example) => (
                                <button
                                    key={example}
                                    onClick={() => handleAddExample(example)}
                                    disabled={preferences[activeCategory].includes(example)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full font-mono text-xs transition-all",
                                        preferences[activeCategory].includes(example)
                                            ? "bg-terminal-green/10 text-terminal-green opacity-50 cursor-not-allowed"
                                            : "bg-terminal-dark/5 text-terminal-muted hover:bg-terminal-dark/10"
                                    )}
                                >
                                    {example}
                                </button>
                            ))}
                    </div>
                </div>

                {/* Current preferences */}
                {totalPreferences > 0 && (
                    <div className="rounded-xl border border-terminal-border bg-white/50 p-4 mb-8">
                        <p className="text-xs text-terminal-muted font-mono mb-3">
                            {t("preferencesCount", { count: totalPreferences })}
                        </p>
                        <div className="space-y-3">
                            {categories.map((category) =>
                                preferences[category.id].length > 0 ? (
                                    <div key={category.id}>
                                        <p className="text-xs text-terminal-muted/70 font-mono mb-1 flex items-center gap-1">
                                            <category.icon className="w-3 h-3" />
                                            {t(`categories.${category.id}.title`)}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {preferences[category.id].map((pref, index) => (
                                                <span
                                                    key={index}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-terminal-green/10 text-terminal-green font-mono text-xs"
                                                >
                                                    {pref}
                                                    <button
                                                        onClick={() => handleRemovePreference(category.id, index)}
                                                        className="hover:text-red-500 transition-colors"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-between">
                    <Button
                        variant="ghost"
                        onClick={onBack}
                        className="gap-2 font-mono text-terminal-muted hover:text-terminal-dark"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {t("back")}
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            onClick={onSkip}
                            className="font-mono text-terminal-muted hover:text-terminal-dark"
                        >
                            {t("skip")}
                        </Button>
                        <Button
                            onClick={onContinue}
                            className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono"
                        >
                            {t("continue")}
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
