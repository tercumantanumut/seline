"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Sparkles, Key, Globe, Zap, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type LLMProvider = "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi";

interface ProviderStepProps {
    selectedProvider: LLMProvider;
    onSelect: (provider: LLMProvider) => void;
    onContinue: () => void;
    onBack: () => void;
}

const providers = [
    {
        id: "antigravity" as const,
        icon: Sparkles,
        recommended: true,
    },
    {
        id: "codex" as const,
        icon: Zap,
        recommended: false,
    },
    {
        id: "anthropic" as const,
        icon: Key,
        recommended: false,
    },
    {
        id: "openrouter" as const,
        icon: Globe,
        recommended: false,
    },
    {
        id: "kimi" as const,
        icon: MessageSquare,
        recommended: false,
    },
];

export function ProviderStep({ selectedProvider, onSelect, onContinue, onBack }: ProviderStepProps) {
    const t = useTranslations("onboarding.provider");

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

                <div className="space-y-4 mb-8">
                    {providers.map((provider, i) => (
                        <motion.button
                            key={provider.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 + i * 0.1 }}
                            onClick={() => onSelect(provider.id)}
                            className={cn(
                                "w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4",
                                selectedProvider === provider.id
                                    ? "border-terminal-green bg-terminal-green/5"
                                    : "border-terminal-border hover:border-terminal-green/50 bg-white/50"
                            )}
                        >
                            <div
                                className={cn(
                                    "p-3 rounded-lg",
                                    selectedProvider === provider.id
                                        ? "bg-terminal-green text-white"
                                        : "bg-terminal-dark/5 text-terminal-muted"
                                )}
                            >
                                <provider.icon className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-terminal-dark font-mono">
                                        {t(`options.${provider.id}.title`)}
                                    </span>
                                    {provider.recommended && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-terminal-green/10 text-terminal-green font-mono">
                                            {t(`options.${provider.id}.badge`)}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-terminal-muted font-mono mt-1">
                                    {t(`options.${provider.id}.desc`)}
                                </p>
                            </div>
                            {selectedProvider === provider.id && (
                                <div className="p-1 rounded-full bg-terminal-green text-white">
                                    <Check className="w-4 h-4" />
                                </div>
                            )}
                        </motion.button>
                    ))}
                </div>

                <div className="flex justify-between">
                    <Button
                        variant="ghost"
                        onClick={onBack}
                        className="gap-2 font-mono text-terminal-muted hover:text-terminal-dark"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Button>
                    <Button
                        onClick={onContinue}
                        className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono"
                    >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
