"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Users, Brain, Search, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface WelcomeStepProps {
    onContinue: () => void;
}

/* Brand icons shown in the scrolling marquee strip */
const MARQUEE_ICONS = [
    "slack.svg", "telegram.svg", "discord.svg", "whatsapp.svg",
    "anthropic.svg", "openai.svg", "comfyui.svg", "ollama.svg",
    "duckduckgo.svg", "elevenlabs.svg", "puppeteer.svg", "openrouter.svg",
];

function MarqueeStrip() {
    /* Duplicate for seamless infinite scroll */
    const icons = [...MARQUEE_ICONS, ...MARQUEE_ICONS];

    return (
        <div className="relative w-full overflow-hidden py-6">
            {/* Fade edges */}
            <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-terminal-cream to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-terminal-cream to-transparent z-10" />

            <div className="flex animate-marquee gap-10 items-center">
                {icons.map((icon, i) => (
                    <img
                        key={`${icon}-${i}`}
                        src={`/icons/brands/${icon}`}
                        alt=""
                        className="w-6 h-6 opacity-30 flex-shrink-0 object-contain"
                    />
                ))}
            </div>

            <style jsx>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                    width: max-content;
                }
            `}</style>
        </div>
    );
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
    const t = useTranslations("onboarding.welcome");

    const features = [
        { icon: Users, title: t("features.agents.title") },
        { icon: Brain, title: t("features.tools.title") },
        { icon: Search, title: t("features.memory.title") },
    ];

    return (
        <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="text-center max-w-2xl w-full"
            >
                {/* Logo with glow */}
                <div className="relative mb-6">
                    <div
                        className="absolute inset-0 blur-3xl opacity-20 rounded-full mx-auto"
                        style={{
                            background: "radial-gradient(circle, hsl(var(--terminal-green)) 0%, transparent 70%)",
                            width: "200px",
                            height: "200px",
                            top: "-40px",
                            left: "50%",
                            transform: "translateX(-50%)",
                        }}
                    />
                    <div className="relative">
                        <span className="text-6xl font-bold font-mono text-terminal-green">S</span>
                        <span className="text-5xl font-light font-mono text-terminal-dark ml-1">eline</span>
                    </div>
                </div>

                {/* Section label */}
                <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-terminal-muted mb-3">
                    SYS_WELCOME_PROTOCOL
                </p>

                <p className="text-base text-terminal-muted mb-8 font-mono font-light">
                    {t("subtitle")}
                </p>

                {/* Brand marquee strip */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    <MarqueeStrip />
                </motion.div>

                {/* Capability pills */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex flex-wrap items-center justify-center gap-3 mb-10"
                >
                    {features.map((feature, i) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 + i * 0.1 }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-terminal-green/20 bg-terminal-green/5 font-mono text-sm text-terminal-dark"
                        >
                            <feature.icon className="w-4 h-4 text-terminal-green" />
                            <span className="font-light">{feature.title}</span>
                        </motion.div>
                    ))}
                </motion.div>

                {/* CTA */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.7 }}
                >
                    <Button
                        onClick={onContinue}
                        className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 text-lg px-8 py-6 font-mono font-light"
                    >
                        {t("cta")}
                        <ArrowRight className="w-5 h-5" />
                    </Button>
                </motion.div>
            </motion.div>
        </div>
    );
}
