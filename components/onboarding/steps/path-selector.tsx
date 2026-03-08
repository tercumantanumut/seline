"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Volume2, Loader2, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { GradientBackground } from "@/components/ui/noisy-gradient-backgrounds";
import type { GradientColor } from "@/components/ui/noisy-gradient-backgrounds";
import {
  EDGE_TTS_VOICES,
  getEdgeTTSVoicesGrouped,
  DEFAULT_EDGE_TTS_VOICE,
} from "@/lib/tts/edge-tts-voices";

/* ─── Types ─── */

export type SelinePath = "dev" | "fun";

export interface PathConfigState {
    // Dev
    devWorkspaceEnabled: boolean;
    browserAutomationEnabled: boolean;
    // Fun
    sttProvider: "openai" | "local" | "parakeet";
    ttsProvider: "elevenlabs" | "openai" | "edge";
    edgeTtsVoice: string;
    avatar3dEnabled: boolean;
    emotionDetectionEnabled: boolean;
    telegramBotToken: string;
}

export const DEFAULT_PATH_CONFIG: PathConfigState = {
    devWorkspaceEnabled: true,
    browserAutomationEnabled: true,
    sttProvider: "local",
    ttsProvider: "edge",
    edgeTtsVoice: DEFAULT_EDGE_TTS_VOICE,
    avatar3dEnabled: true,
    emotionDetectionEnabled: false,
    telegramBotToken: "",
};

interface PathSelectorProps {
    selectedPath: SelinePath | null;
    onSelectPath: (path: SelinePath | null) => void;
    pathConfig: PathConfigState;
    onPathConfigChange: (updates: Partial<PathConfigState>) => void;
}

/* ─── Card visual definitions ─── */

interface PathCardDef {
    id: "dev" | "fun" | "work";
    brandIcons: string[];
    features: string[];
    comingSoon?: boolean;
    gradient: {
        colors: GradientColor[];
        origin: "bottom-middle" | "top-left" | "center" | "bottom-right";
        size?: string;
        noiseIntensity?: number;
        noiseAlpha?: number;
    };
}

const PATH_CARDS: PathCardDef[] = [
    {
        id: "dev",
        brandIcons: ["anthropic.svg", "openai.svg", "puppeteer.svg", "mcp.svg"],
        features: ["Git", "Diffs", "PRs", "Browser", "MCP", "Worktrees"],
        gradient: {
            colors: [
                { color: "rgba(8,15,25,1)", stop: "0%" },
                { color: "rgba(10,30,55,1)", stop: "20%" },
                { color: "rgba(15,60,100,1)", stop: "45%" },
                { color: "rgba(20,90,140,1)", stop: "70%" },
                { color: "rgba(40,130,180,1)", stop: "100%" },
            ],
            origin: "bottom-middle",
            noiseIntensity: 0.9,
            noiseAlpha: 40,
        },
    },
    {
        id: "fun",
        brandIcons: ["elevenlabs.svg", "openai.svg", "telegram.svg", "discord.svg"],
        features: ["Voice", "Avatar", "Emotions", "Lip sync", "Cloning", "Channels"],
        gradient: {
            colors: [
                { color: "rgba(20,8,30,1)", stop: "0%" },
                { color: "rgba(55,15,65,1)", stop: "25%" },
                { color: "rgba(120,30,100,1)", stop: "50%" },
                { color: "rgba(180,50,120,1)", stop: "75%" },
                { color: "rgba(220,80,160,1)", stop: "100%" },
            ],
            origin: "center",
            size: "140% 140%",
            noiseIntensity: 0.8,
            noiseAlpha: 35,
        },
    },
    {
        id: "work",
        brandIcons: ["slack.svg", "discord.svg", "mcp.svg", "google.svg"],
        features: ["Coming soon"],
        comingSoon: true,
        gradient: {
            colors: [
                { color: "rgba(20,20,22,1)", stop: "0%" },
                { color: "rgba(35,35,40,1)", stop: "30%" },
                { color: "rgba(50,50,55,1)", stop: "60%" },
                { color: "rgba(65,65,70,1)", stop: "100%" },
            ],
            origin: "bottom-right",
            noiseIntensity: 0.6,
            noiseAlpha: 30,
        },
    },
];

/* ─── Toggle switch ─── */

function Toggle({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200",
                checked ? "bg-terminal-green" : "bg-white/20",
                disabled && "opacity-50 cursor-not-allowed",
            )}
        >
            <span
                className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                    checked ? "translate-x-[18px]" : "translate-x-[2px]",
                )}
            />
        </button>
    );
}

/* ─── Shared select styling ─── */

const selectCls =
    "w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 font-mono text-sm text-white focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10";

/* ─── Dev configuration panel ─── */

function DevConfigPanel({
    config,
    onChange,
    t,
}: {
    config: PathConfigState;
    onChange: (u: Partial<PathConfigState>) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 }}
            >
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <div className="flex items-center gap-3 min-w-0">
                        <img src="/icons/brands/mcp.svg" alt="" className="w-4 h-4 opacity-60" />
                        <div className="min-w-0">
                            <p className="font-mono text-sm text-white/90">
                                {t("config.devWorkspace")}
                            </p>
                            <p className="font-mono text-[11px] text-white/40 truncate">
                                {t("config.devWorkspaceDesc")}
                            </p>
                        </div>
                    </div>
                    <Toggle
                        checked={config.devWorkspaceEnabled}
                        onChange={(v) => onChange({ devWorkspaceEnabled: v })}
                    />
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
            >
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <div className="flex items-center gap-3 min-w-0">
                        <img src="/icons/brands/puppeteer.svg" alt="" className="w-4 h-4 opacity-60" />
                        <div className="min-w-0">
                            <p className="font-mono text-sm text-white/90">
                                {t("config.browserAutomation")}
                            </p>
                            <p className="font-mono text-[11px] text-white/40 truncate">
                                {t("config.browserAutomationDesc")}
                            </p>
                        </div>
                    </div>
                    <Toggle
                        checked={config.browserAutomationEnabled}
                        onChange={(v) => onChange({ browserAutomationEnabled: v })}
                    />
                </div>
            </motion.div>
        </div>
    );
}

/* ─── Fun configuration panel ─── */

function FunConfigPanel({
    config,
    onChange,
    t,
}: {
    config: PathConfigState;
    onChange: (u: Partial<PathConfigState>) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    const [previewing, setPreviewing] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    const stopPreview = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
        setPreviewing(false);
    }, []);

    const playPreview = useCallback(async () => {
        if (previewing) {
            stopPreview();
            return;
        }
        setPreviewing(true);
        try {
            const res = await fetch(`/api/tts/preview?voice=${encodeURIComponent(config.edgeTtsVoice)}`);
            if (!res.ok) throw new Error("Preview failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = stopPreview;
            audio.onerror = stopPreview;
            await audio.play();
        } catch {
            stopPreview();
        }
    }, [config.edgeTtsVoice, previewing, stopPreview]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Speech-to-text provider */}
            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 }}
            >
                <div className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <div className="flex items-center gap-2 mb-2">
                        <img src="/icons/brands/openai.svg" alt="" className="w-4 h-4 opacity-60" />
                        <span className="font-mono text-sm text-white/90">
                            {t("config.sttProvider")}
                        </span>
                    </div>
                    <select
                        value={config.sttProvider}
                        onChange={(e) =>
                            onChange({
                                sttProvider: e.target.value as PathConfigState["sttProvider"],
                            })
                        }
                        className={selectCls}
                    >
                        <option value="local">{t("config.sttLocal")}</option>
                        <option value="openai">{t("config.sttCloud")}</option>
                        <option value="parakeet">{t("config.sttParakeet")}</option>
                    </select>
                </div>
            </motion.div>

            {/* Text-to-speech provider */}
            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
            >
                <div className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <div className="flex items-center gap-2 mb-2">
                        <img src="/icons/brands/microsoft.svg" alt="" className="w-4 h-4 opacity-60" />
                        <span className="font-mono text-sm text-white/90">
                            {t("config.ttsProvider")}
                        </span>
                    </div>
                    <select
                        value={config.ttsProvider}
                        onChange={(e) =>
                            onChange({
                                ttsProvider: e.target.value as PathConfigState["ttsProvider"],
                            })
                        }
                        className={selectCls}
                    >
                        <option value="edge">{t("config.ttsEdge")}</option>
                        <option value="openai">{t("config.ttsOpenai")}</option>
                        <option value="elevenlabs">{t("config.ttsElevenlabs")}</option>
                    </select>
                </div>
            </motion.div>

            {/* Edge TTS voice selector (shows when Edge TTS is selected) */}
            <AnimatePresence>
                {config.ttsProvider === "edge" && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden sm:col-span-2"
                    >
                        <div className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.04]">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="font-mono text-sm text-white/90">
                                    {t("config.edgeTtsVoice")}
                                </span>
                                <span className="font-mono text-[10px] text-white/30">
                                    {t("config.edgeTtsVoiceDesc")}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={config.edgeTtsVoice}
                                    onChange={(e) => {
                                        stopPreview();
                                        onChange({ edgeTtsVoice: e.target.value });
                                    }}
                                    className={cn(selectCls, "flex-1")}
                                >
                                    {[...getEdgeTTSVoicesGrouped().entries()].map(
                                        ([lang, voices]) => (
                                            <optgroup key={lang} label={lang}>
                                                {voices.map((v) => (
                                                    <option key={v.id} value={v.id}>
                                                        {v.name} ({v.gender})
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ),
                                    )}
                                </select>
                                <button
                                    type="button"
                                    onClick={playPreview}
                                    disabled={previewing && !audioRef.current}
                                    className="shrink-0 w-9 h-9 rounded-lg border border-white/10 bg-white/[0.07] flex items-center justify-center hover:bg-white/[0.12] hover:border-white/20 transition-colors disabled:opacity-50"
                                    title={t("config.edgeTtsPreview")}
                                >
                                    {previewing ? (
                                        audioRef.current ? (
                                            <Square className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                        ) : (
                                            <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin" />
                                        )
                                    ) : (
                                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 3D Avatar toggle */}
            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
            >
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <div className="min-w-0">
                        <p className="font-mono text-sm text-white/90">
                            {t("config.avatar3d")}
                        </p>
                        <p className="font-mono text-[11px] text-white/40">
                            {t("config.avatar3dDesc")}
                        </p>
                    </div>
                    <Toggle
                        checked={config.avatar3dEnabled}
                        onChange={(v) => onChange({ avatar3dEnabled: v })}
                    />
                </div>
            </motion.div>

            {/* Emotion detection (shows only when avatar is on) */}
            <AnimatePresence>
                {config.avatar3dEnabled && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.04]">
                            <div className="min-w-0">
                                <p className="font-mono text-sm text-white/90">
                                    {t("config.emotionDetection")}
                                </p>
                                <p className="font-mono text-[11px] text-white/40">
                                    {t("config.emotionDetectionDesc")}
                                </p>
                            </div>
                            <Toggle
                                checked={config.emotionDetectionEnabled}
                                onChange={(v) => onChange({ emotionDetectionEnabled: v })}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Telegram bot token */}
            <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
                className="sm:col-span-2"
            >
                <div className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <div className="flex items-center gap-2 mb-2">
                        <img src="/icons/brands/telegram.svg" alt="" className="w-4 h-4 opacity-60" />
                        <span className="font-mono text-sm text-white/90">
                            {t("config.telegramToken")}
                        </span>
                        <span className="font-mono text-[10px] text-white/30">
                            {t("config.telegramTokenHint")}
                        </span>
                    </div>
                    <input
                        type="text"
                        value={config.telegramBotToken}
                        onChange={(e) => onChange({ telegramBotToken: e.target.value })}
                        placeholder={t("config.telegramTokenPlaceholder")}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 font-mono text-sm text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
                    />
                </div>
            </motion.div>
        </div>
    );
}

/* ─── Main PathSelector ─── */

export function PathSelector({
    selectedPath,
    onSelectPath,
    pathConfig,
    onPathConfigChange,
}: PathSelectorProps) {
    const t = useTranslations("onboarding.pathSelection");

    return (
        <div className="mb-10">
            {/* Path cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                {PATH_CARDS.map((card, i) => {
                    const isSelected = selectedPath === card.id;
                    const isDisabled = !!card.comingSoon;

                    return (
                        <motion.button
                            key={card.id}
                            type="button"
                            disabled={isDisabled}
                            initial={{ opacity: 0, y: 24, scale: 0.96 }}
                            animate={{
                                opacity: isDisabled
                                    ? 0.4
                                    : selectedPath && !isSelected
                                      ? 0.5
                                      : 1,
                                y: 0,
                                scale: isSelected
                                    ? 1.02
                                    : selectedPath && !isSelected
                                      ? 0.97
                                      : 1,
                            }}
                            transition={{
                                delay: 0.15 + i * 0.08,
                                duration: 0.4,
                                ease: "easeOut",
                            }}
                            onClick={() => {
                                if (isDisabled) return;
                                if (card.id === "dev" || card.id === "fun") {
                                    onSelectPath(isSelected ? null : card.id);
                                }
                            }}
                            className={cn(
                                "relative rounded-2xl text-left transition-all duration-300 overflow-hidden",
                                isDisabled && "cursor-not-allowed",
                                !isDisabled && !isSelected && "cursor-pointer hover:-translate-y-1",
                                isSelected
                                    ? "ring-2 ring-white/30 shadow-lg shadow-black/30"
                                    : "ring-1 ring-white/[0.08] hover:ring-white/[0.15]",
                            )}
                        >
                            {/* Noisy gradient background — the card IS the gradient */}
                            <GradientBackground
                                colors={card.gradient.colors}
                                gradientOrigin={card.gradient.origin}
                                gradientSize={card.gradient.size ?? "125% 125%"}
                                noiseIntensity={card.gradient.noiseIntensity ?? 0.8}
                                noisePatternAlpha={card.gradient.noiseAlpha ?? 40}
                                noisePatternSize={90}
                                noisePatternRefreshInterval={3}
                                className="rounded-2xl"
                            />

                            {/* Content overlay */}
                            <div className="relative z-10">
                                {/* Coming soon badge */}
                                {card.comingSoon && (
                                    <div className="absolute top-0 right-0 z-20">
                                        <span className="inline-block px-2.5 py-1 rounded-bl-xl rounded-tr-[14px] bg-white/[0.08] backdrop-blur-sm font-mono text-[9px] tracking-widest uppercase text-white/40">
                                            {t("work.comingSoon")}
                                        </span>
                                    </div>
                                )}

                                {/* Selection checkmark */}
                                {isSelected && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 300,
                                            damping: 20,
                                        }}
                                        className="absolute top-3 right-3 z-20 w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
                                    >
                                        <Check className="w-3.5 h-3.5 text-white" />
                                    </motion.div>
                                )}

                                {/* Card header */}
                                <div className="px-5 pt-5 pb-3">
                                    <h3 className="font-mono text-base font-semibold text-white">
                                        {t(`${card.id}.title`)}
                                    </h3>
                                    <p className="font-mono text-xs text-white/45 mt-0.5">
                                        {t(`${card.id}.tagline`)}
                                    </p>
                                </div>

                                {/* Content area */}
                                <div className="px-5 pb-5 pt-1">
                                    {/* Brand icons */}
                                    <div className="flex items-center gap-3 mb-3">
                                        {card.brandIcons.map((icon) => (
                                            <img
                                                key={icon}
                                                src={`/icons/brands/${icon}`}
                                                alt=""
                                                className={cn(
                                                    "w-5 h-5 object-contain transition-opacity duration-200",
                                                    isSelected ? "opacity-70" : "opacity-35",
                                                )}
                                            />
                                        ))}
                                    </div>

                                    {/* Feature chips */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {card.features.map((feat) => (
                                            <span
                                                key={feat}
                                                className="inline-block px-2 py-0.5 rounded-full font-mono text-[10px] bg-white/[0.06] text-white/50"
                                            >
                                                {feat}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            {/* Configuration panel (progressive disclosure) */}
            <AnimatePresence mode="wait">
                {selectedPath && (
                    <motion.div
                        key={selectedPath}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                            height: {
                                duration: 0.35,
                                ease: [0.4, 0, 0.2, 1],
                            },
                            opacity: { duration: 0.25, delay: 0.1 },
                        }}
                        className="overflow-hidden"
                    >
                        <div className="relative rounded-2xl overflow-hidden">
                            {/* Config panel also gets a gradient bg */}
                            <GradientBackground
                                colors={
                                    selectedPath === "dev"
                                        ? [
                                              { color: "rgba(8,15,25,0.95)", stop: "0%" },
                                              { color: "rgba(12,25,45,0.95)", stop: "50%" },
                                              { color: "rgba(15,35,60,0.95)", stop: "100%" },
                                          ]
                                        : [
                                              { color: "rgba(20,8,30,0.95)", stop: "0%" },
                                              { color: "rgba(40,12,50,0.95)", stop: "50%" },
                                              { color: "rgba(60,20,65,0.95)", stop: "100%" },
                                          ]
                                }
                                gradientOrigin="top-left"
                                noiseIntensity={0.5}
                                noisePatternAlpha={25}
                                noisePatternSize={100}
                                noisePatternRefreshInterval={4}
                                className="rounded-2xl"
                            />
                            <div className="relative z-10 p-4 ring-1 ring-white/[0.08] rounded-2xl">
                                {selectedPath === "dev" && (
                                    <DevConfigPanel
                                        config={pathConfig}
                                        onChange={onPathConfigChange}
                                        t={t}
                                    />
                                )}
                                {selectedPath === "fun" && (
                                    <FunConfigPanel
                                        config={pathConfig}
                                        onChange={onPathConfigChange}
                                        t={t}
                                    />
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── Highlight map for features grid dimming ─── */

export const PATH_HIGHLIGHT_MAP: Record<SelinePath, string[]> = {
    dev: [
        "llmProviders",
        "contextChain",
        "skillsPlugins",
        "mcpIntegration",
        "webScraping",
        "aiTools",
    ],
    fun: [
        "voiceSpeech",
        "channels",
        "imageGeneration",
        "languages",
        "memory",
        "enhancement",
        "scheduling",
    ],
};
