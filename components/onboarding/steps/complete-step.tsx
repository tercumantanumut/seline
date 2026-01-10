"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Rocket, Bot, MessageSquare, Settings } from "lucide-react";
import { useTranslations } from "next-intl";

interface CompleteStepProps {
    onComplete: () => void;
}

export function CompleteStep({ onComplete }: CompleteStepProps) {
    const t = useTranslations("onboarding.complete");

    const tips = [
        { icon: Bot, key: "agent" },
        { icon: MessageSquare, key: "chat" },
        { icon: Settings, key: "settings" },
    ];

    return (
        <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="text-center max-w-lg"
            >
                {/* Success animation */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                    className="w-24 h-24 mx-auto mb-8 rounded-full bg-gradient-to-br from-terminal-green to-terminal-green/60 flex items-center justify-center shadow-lg"
                >
                    <Rocket className="w-12 h-12 text-white" />
                </motion.div>

                <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-3xl font-bold text-terminal-dark mb-4 font-mono"
                >
                    {t("title")}
                </motion.h1>
                <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-terminal-muted mb-8 font-mono"
                >
                    {t("subtitle")}
                </motion.p>

                {/* Tips */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-3 mb-10"
                >
                    {tips.map((tip, i) => (
                        <motion.div
                            key={tip.key}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.5 + i * 0.1 }}
                            className="flex items-center gap-4 p-4 rounded-xl bg-white/50 border border-terminal-border text-left"
                        >
                            <div className="p-2 rounded-lg bg-terminal-green/10">
                                <tip.icon className="w-5 h-5 text-terminal-green" />
                            </div>
                            <span className="font-mono text-sm text-terminal-dark">
                                {t(`tips.${tip.key}`)}
                            </span>
                        </motion.div>
                    ))}
                </motion.div>

                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8 }}
                >
                    <Button
                        onClick={onComplete}
                        className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 text-lg px-8 py-6 font-mono"
                    >
                        {t("cta")}
                        <Rocket className="w-5 h-5" />
                    </Button>
                </motion.div>
            </motion.div>
        </div>
    );
}
