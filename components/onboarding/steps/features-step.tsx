"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    ArrowRight,
    RefreshCw,
    Search,
    Plug,
    Wrench,
    Puzzle,
    Brain,
    Clock,
    Globe,
    Sparkles,
    BookOpen,
    Layers,
    GitBranch,
    Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface FeaturesStepProps {
    onContinue: () => void;
    onBack: () => void;
}

type FeatureStatus = "ready" | "configurable";

interface Feature {
    nameKey: string;
    icon: string | null;
    fallbackIcon?: LucideIcon;
    status: FeatureStatus;
}

interface FeatureCategory {
    titleKey: string;
    features: Feature[];
}

const FEATURE_CATEGORIES: FeatureCategory[] = [
    {
        titleKey: "llmProviders",
        features: [
            { nameKey: "anthropic", icon: "anthropic.svg", status: "configurable" },
            { nameKey: "openrouter", icon: "openrouter.svg", status: "configurable" },
            { nameKey: "ollama", icon: "ollama.svg", status: "ready" },
            { nameKey: "kimi", icon: "moonshot.png", status: "configurable" },
            { nameKey: "codex", icon: "openai.svg", status: "configurable" },
            { nameKey: "claudeCode", icon: "anthropic.svg", status: "configurable" },
            { nameKey: "antigravity", icon: "google.svg", status: "configurable" },
        ],
    },
    {
        titleKey: "voiceSpeech",
        features: [
            { nameKey: "whisperCloud", icon: "openai.svg", status: "configurable" },
            { nameKey: "whisperLocal", icon: "openai.svg", status: "ready" },
            { nameKey: "edgeTts", icon: "microsoft.svg", status: "ready" },
            { nameKey: "elevenlabs", icon: "elevenlabs.svg", status: "configurable" },
            { nameKey: "openaiTts", icon: "openai.svg", status: "configurable" },
        ],
    },
    {
        titleKey: "webSearch",
        features: [
            { nameKey: "duckduckgo", icon: "duckduckgo.svg", status: "ready" },
            { nameKey: "tavily", icon: "tavily.svg", status: "configurable" },
        ],
    },
    {
        titleKey: "webScraping",
        features: [
            { nameKey: "puppeteer", icon: "puppeteer.svg", status: "ready" },
            { nameKey: "firecrawl", icon: "firecrawl.svg", status: "configurable" },
        ],
    },
    {
        titleKey: "contextChain",
        features: [
            { nameKey: "lancedb", icon: "lancedb.png", status: "ready" },
            { nameKey: "localEmbeddings", icon: "onnx.svg", status: "ready" },
            { nameKey: "cloudEmbeddings", icon: "openrouter.svg", status: "configurable" },
            { nameKey: "syncEngine", icon: null, fallbackIcon: RefreshCw, status: "ready" },
            { nameKey: "semanticSearch", icon: null, fallbackIcon: Search, status: "ready" },
        ],
    },
    {
        titleKey: "channels",
        features: [
            { nameKey: "slack", icon: "slack.svg", status: "configurable" },
            { nameKey: "telegram", icon: "telegram.svg", status: "configurable" },
            { nameKey: "discord", icon: "discord.svg", status: "configurable" },
            { nameKey: "whatsapp", icon: "whatsapp.svg", status: "configurable" },
        ],
    },
    {
        titleKey: "imageGeneration",
        features: [
            { nameKey: "comfyui", icon: "comfyui.svg", status: "ready" },
            { nameKey: "openrouterImage", icon: "openrouter.svg", status: "configurable" },
            { nameKey: "remotionVideo", icon: "remotion.svg", status: "ready" },
        ],
    },
    {
        titleKey: "mcpIntegration",
        features: [
            { nameKey: "mcpServers", icon: "mcp.svg", status: "ready" },
        ],
    },
    {
        titleKey: "skillsPlugins",
        features: [
            { nameKey: "customSkills", icon: null, fallbackIcon: Wrench, status: "ready" },
            { nameKey: "pluginSystem", icon: null, fallbackIcon: Puzzle, status: "ready" },
            { nameKey: "codeHooks", icon: "anthropic.svg", status: "ready" },
            { nameKey: "subagents", icon: null, fallbackIcon: Users, status: "ready" },
            { nameKey: "gitWorktrees", icon: null, fallbackIcon: GitBranch, status: "ready" },
        ],
    },
    {
        titleKey: "memory",
        features: [
            { nameKey: "agentMemory", icon: null, fallbackIcon: Brain, status: "ready" },
        ],
    },
    {
        titleKey: "scheduling",
        features: [
            { nameKey: "cronJobs", icon: null, fallbackIcon: Clock, status: "ready" },
        ],
    },
    {
        titleKey: "languages",
        features: [
            { nameKey: "english", icon: "flag-gb.svg", status: "ready" },
            { nameKey: "turkish", icon: "flag-tr.svg", status: "ready" },
        ],
    },
    {
        titleKey: "enhancement",
        features: [
            { nameKey: "promptEnhancement", icon: null, fallbackIcon: Sparkles, status: "ready" },
            { nameKey: "deepResearch", icon: null, fallbackIcon: BookOpen, status: "ready" },
            { nameKey: "dynamicContext", icon: null, fallbackIcon: Layers, status: "ready" },
        ],
    },
    {
        titleKey: "aiTools",
        features: [
            { nameKey: "toolSearch", icon: null, fallbackIcon: Search, status: "ready" },
        ],
    },
];

function FeatureChip({ feature, t }: { feature: Feature; t: ReturnType<typeof useTranslations> }) {
    const isReady = feature.status === "ready";
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors",
                isReady
                    ? "bg-terminal-green/5 border-terminal-green/20 text-terminal-dark"
                    : "bg-white/80 border-terminal-border text-terminal-muted"
            )}
        >
            {feature.icon ? (
                <img
                    src={`/icons/brands/${feature.icon}`}
                    alt=""
                    className="w-4 h-4 object-contain"
                />
            ) : feature.fallbackIcon ? (
                <feature.fallbackIcon className="w-3.5 h-3.5" />
            ) : null}
            <span>{t(`items.${feature.nameKey}`)}</span>
            <span
                className={cn(
                    "w-1.5 h-1.5 rounded-full ml-0.5 flex-shrink-0",
                    isReady ? "bg-terminal-green" : "bg-terminal-amber"
                )}
            />
        </div>
    );
}

export function FeaturesStep({ onContinue, onBack }: FeaturesStepProps) {
    const t = useTranslations("onboarding.features");

    return (
        <div className="flex flex-col items-center min-h-full px-[5%] py-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center w-full"
            >
                {/* Section label */}
                <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-terminal-muted mb-3">
                    SYS_CAPABILITIES
                </p>

                <h1 className="text-2xl font-light text-terminal-dark mb-2 font-mono">
                    {t("title")}
                </h1>
                <p className="text-terminal-muted mb-6 font-mono text-sm font-light">
                    {t("subtitle")}
                </p>

                {/* Status legend */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center justify-center gap-6 mb-8 font-mono text-xs text-terminal-muted"
                >
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-terminal-green" />
                        {t("legend.ready")}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-terminal-amber" />
                        {t("legend.configurable")}
                    </span>
                </motion.div>

                {/* Categories grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10 text-left">
                    {FEATURE_CATEGORIES.map((category, i) => (
                        <motion.div
                            key={category.titleKey}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + i * 0.04 }}
                            className="p-4 rounded-2xl bg-white/50 border border-terminal-border/30"
                        >
                            <h3 className="font-mono text-[10px] font-medium text-terminal-muted uppercase tracking-[0.2em] mb-3">
                                {t(`categories.${category.titleKey}`)}
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {category.features.map((feature) => (
                                    <FeatureChip
                                        key={feature.nameKey}
                                        feature={feature}
                                        t={t}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Navigation */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="flex justify-between"
                >
                    <Button
                        variant="ghost"
                        onClick={onBack}
                        className="gap-2 font-mono text-terminal-muted hover:text-terminal-dark"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {t("back")}
                    </Button>
                    <Button
                        onClick={onContinue}
                        className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono"
                    >
                        {t("continue")}
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </motion.div>
            </motion.div>
        </div>
    );
}
