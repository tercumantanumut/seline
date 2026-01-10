"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Sparkles, Zap, Brain, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface WelcomeStepProps {
    onContinue: () => void;
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
    const t = useTranslations("onboarding.welcome");

    const features = [
        { icon: Sparkles, title: t("features.agents.title"), desc: t("features.agents.desc") },
        { icon: Zap, title: t("features.tools.title"), desc: t("features.tools.desc") },
        { icon: Brain, title: t("features.memory.title"), desc: t("features.memory.desc") },
    ];

    return (
        <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-center max-w-2xl"
            >
                {/* Logo */}
                <div className="mb-8">
                    <span className="text-6xl font-bold font-mono text-terminal-green">S</span>
                    <span className="text-5xl font-semibold font-mono text-terminal-dark ml-1">eline</span>
                </div>

                <h1 className="text-3xl font-bold text-terminal-dark mb-4 font-mono">
                    {t("title")}
                </h1>
                <p className="text-lg text-terminal-muted mb-12 font-mono">
                    {t("subtitle")}
                </p>

                {/* Feature cards */}
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                    {features.map((feature, i) => (
                        <motion.div
                            key={feature.title}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 + i * 0.1 }}
                            className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-terminal-border shadow-sm hover:shadow-md transition-shadow"
                        >
                            <feature.icon className="w-8 h-8 text-terminal-green mb-4 mx-auto" />
                            <h3 className="font-semibold text-terminal-dark mb-2 font-mono">{feature.title}</h3>
                            <p className="text-sm text-terminal-muted font-mono">{feature.desc}</p>
                        </motion.div>
                    ))}
                </div>

                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    <Button
                        onClick={onContinue}
                        className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 text-lg px-8 py-6 font-mono"
                    >
                        {t("cta")}
                        <ArrowRight className="w-5 h-5" />
                    </Button>
                </motion.div>
            </motion.div>
        </div>
    );
}
