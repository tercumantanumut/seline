"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { resilientPost } from "@/lib/utils/resilient-fetch";
import { Shell } from "@/components/layout/shell";
import {
    WelcomeStep,
    ProviderStep,
    AuthStep,
    EmbeddingStep,
    WebSearchStep,
    WebScrapingStep,
    CompleteStep,
} from "./steps";
import { Sparkles, Key, Database, CheckCircle2, Search, Globe } from "lucide-react";

import type { LLMProvider } from "./steps/provider-step";

type OnboardingStep = "welcome" | "provider" | "auth" | "embedding" | "web-search" | "web-scraping" | "complete";

interface OnboardingState {
    llmProvider: LLMProvider;
    apiKey: string;
    isAuthenticated: boolean;
    tavilyApiKey: string;
    webScraperProvider: "firecrawl" | "local";
    firecrawlApiKey: string;
}

const ONBOARDING_STEP_IDS = [
    { id: "welcome", icon: <Sparkles className="w-4 h-4" /> },
    { id: "provider", icon: <Key className="w-4 h-4" /> },
    { id: "auth", icon: <Key className="w-4 h-4" /> },
    { id: "embedding", icon: <Database className="w-4 h-4" /> },
    { id: "web-search", icon: <Search className="w-4 h-4" /> },
    { id: "web-scraping", icon: <Globe className="w-4 h-4" /> },
    { id: "complete", icon: <CheckCircle2 className="w-4 h-4" /> },
];

const pageVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? "100%" : "-100%",
        opacity: 0,
    }),
    center: {
        x: 0,
        opacity: 1,
    },
    exit: (direction: number) => ({
        x: direction < 0 ? "100%" : "-100%",
        opacity: 0,
    }),
};

export function OnboardingWizard() {
    const t = useTranslations("onboarding.wizard");
    const ONBOARDING_STEPS = [
        { ...ONBOARDING_STEP_IDS[0], label: t("stepWelcome") },
        { ...ONBOARDING_STEP_IDS[1], label: t("stepProvider") },
        { ...ONBOARDING_STEP_IDS[2], label: t("stepConnect") },
        { ...ONBOARDING_STEP_IDS[3], label: t("stepSearch") },
        { ...ONBOARDING_STEP_IDS[4], label: t("stepWebSearch") },
        { ...ONBOARDING_STEP_IDS[5], label: t("stepWebScraping") },
        { ...ONBOARDING_STEP_IDS[6], label: t("stepReady") },
    ];
    const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
    const [direction, setDirection] = useState(0);
    const [state, setState] = useState<OnboardingState>({
        llmProvider: "antigravity", // Default to free option
        apiKey: "",
        isAuthenticated: false,
        tavilyApiKey: "",
        webScraperProvider: "local",
        firecrawlApiKey: "",
    });

    const router = useRouter();

    const navigateTo = useCallback((step: OnboardingStep, dir: number = 1) => {
        setDirection(dir);
        setCurrentStep(step);
    }, []);

    const handleComplete = async () => {
        try {
            // Save configured settings from onboarding
            await resilientPost("/api/onboarding", {
                llmProvider: state.llmProvider,
                tavilyApiKey: state.tavilyApiKey || undefined,
                webScraperProvider: state.webScraperProvider || "local",
                firecrawlApiKey: state.firecrawlApiKey || undefined,
            });
            router.push("/");
        } catch (error) {
            console.error("Failed to complete onboarding:", error);
            router.push("/");
        }
    };

    const currentStepIndex = ONBOARDING_STEPS.findIndex(s => s.id === currentStep);
    const showProgress = currentStep !== "welcome" && currentStep !== "complete";

    return (
        <Shell hideNav>
            <div className="relative min-h-full overflow-hidden bg-terminal-cream flex flex-col">
                {/* Progress bar */}
                {showProgress && (
                    <div className="relative z-40 border-b border-terminal-border bg-terminal-cream/80 backdrop-blur-sm">
                        <div className="flex items-center justify-center gap-2 px-6 py-4">
                            {ONBOARDING_STEPS.slice(1, -1).map((step, index) => {
                                const stepIndex = index + 1;
                                const isActive = stepIndex === currentStepIndex;
                                const isCompleted = stepIndex < currentStepIndex;

                                return (
                                    <div key={step.id} className="flex items-center">
                                        <div
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-xs transition-all ${isActive
                                                ? "bg-terminal-green text-white"
                                                : isCompleted
                                                    ? "bg-terminal-green/20 text-terminal-green"
                                                    : "bg-terminal-dark/5 text-terminal-muted"
                                                }`}
                                        >
                                            {step.icon}
                                            <span className="hidden sm:inline">{step.label}</span>
                                        </div>
                                        {index < ONBOARDING_STEPS.slice(1, -1).length - 1 && (
                                            <div
                                                className={`w-8 h-0.5 mx-2 transition-colors ${stepIndex < currentStepIndex
                                                    ? "bg-terminal-green"
                                                    : "bg-terminal-dark/10"
                                                    }`}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 relative overflow-hidden">
                    <AnimatePresence mode="wait" custom={direction}>
                        <motion.div
                            key={currentStep}
                            custom={direction}
                            variants={pageVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="absolute inset-0 overflow-y-auto"
                        >
                            {currentStep === "welcome" && (
                                <WelcomeStep onContinue={() => navigateTo("provider")} />
                            )}
                            {currentStep === "provider" && (
                                <ProviderStep
                                    selectedProvider={state.llmProvider}
                                    onSelect={(provider) => setState({ ...state, llmProvider: provider })}
                                    onContinue={() => navigateTo("auth")}
                                    onBack={() => navigateTo("welcome", -1)}
                                />
                            )}
                            {currentStep === "auth" && (
                                <AuthStep
                                    provider={state.llmProvider}
                                    onAuthenticated={() => {
                                        setState({ ...state, isAuthenticated: true });
                                        navigateTo("embedding");
                                    }}
                                    onBack={() => navigateTo("provider", -1)}
                                    onSkip={() => navigateTo("embedding")}
                                />
                            )}
                            {currentStep === "embedding" && (
                                <EmbeddingStep
                                    onContinue={() => navigateTo("web-search")}
                                    onBack={() => navigateTo("auth", -1)}
                                    onSkip={() => navigateTo("web-search")}
                                />
                            )}
                            {currentStep === "web-search" && (
                                <WebSearchStep
                                    onContinue={(tavilyApiKey) => {
                                        setState({ ...state, tavilyApiKey });
                                        navigateTo("web-scraping");
                                    }}
                                    onBack={() => navigateTo("embedding", -1)}
                                    onSkip={() => navigateTo("web-scraping")}
                                />
                            )}
                            {currentStep === "web-scraping" && (
                                <WebScrapingStep
                                    onContinue={(provider, firecrawlApiKey) => {
                                        setState({
                                            ...state,
                                            webScraperProvider: provider,
                                            firecrawlApiKey: firecrawlApiKey || "",
                                        });
                                        navigateTo("complete");
                                    }}
                                    onBack={() => navigateTo("web-search", -1)}
                                    onSkip={() => navigateTo("complete")}
                                />
                            )}
                            {currentStep === "complete" && (
                                <CompleteStep onComplete={handleComplete} />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </Shell>
    );
}
