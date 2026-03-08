"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { resilientPost, resilientFetch } from "@/lib/utils/resilient-fetch";
import { Shell } from "@/components/layout/shell";
import {
    WelcomeStep,
    ProviderStep,
    AuthStep,
    FeaturesStep,
} from "./steps";
import { Sparkles, Key, Layers } from "lucide-react";

import type { LLMProvider } from "./steps/provider-step";
import type { SelenePath, PathConfigState } from "./steps/path-selector";

type OnboardingStep = "welcome" | "provider" | "auth" | "features";

interface OnboardingState {
    llmProvider: LLMProvider;
    apiKey: string;
    isAuthenticated: boolean;
}

const ONBOARDING_STEP_IDS = [
    { id: "welcome", icon: <Sparkles className="w-4 h-4" /> },
    { id: "provider", icon: <Key className="w-4 h-4" /> },
    { id: "auth", icon: <Key className="w-4 h-4" /> },
    { id: "features", icon: <Layers className="w-4 h-4" /> },
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
        { ...ONBOARDING_STEP_IDS[3], label: t("stepFeatures") },
    ];
    const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
    const [direction, setDirection] = useState(0);
    const [state, setState] = useState<OnboardingState>({
        llmProvider: "antigravity",
        apiKey: "",
        isAuthenticated: false,
    });

    const router = useRouter();

    const navigateTo = useCallback((step: OnboardingStep, dir: number = 1) => {
        setDirection(dir);
        setCurrentStep(step);
    }, []);

    const handleComplete = async (pathData?: { path: SelenePath | null; config: PathConfigState }) => {
        try {
            const result = await resilientPost("/api/onboarding", {
                llmProvider: state.llmProvider,
                selectedPath: pathData?.path,
                pathConfig: pathData?.config,
            });
            if (result.error) {
                console.error("Failed to save onboarding settings:", result.error);
            }

            // Get default agent and redirect directly to chat
            const { data } = await resilientFetch<{
                characters: Array<{ id: string; isDefault: boolean }>;
            }>("/api/characters");
            const defaultAgent = data?.characters?.find((c) => c.isDefault);

            if (defaultAgent?.id) {
                router.push(`/chat/${defaultAgent.id}`);
            } else {
                router.push("/");
            }
        } catch (error) {
            console.error("Failed to complete onboarding:", error);
            router.push("/");
        }
    };

    const currentStepIndex = ONBOARDING_STEPS.findIndex(s => s.id === currentStep);
    const showProgress = currentStep !== "welcome";

    return (
        <Shell hideNav>
            <div className="relative min-h-full overflow-hidden bg-terminal-cream flex flex-col">
                {/* Progress bar */}
                {showProgress && (
                    <div className="relative z-40 border-b border-terminal-border bg-terminal-cream/80 backdrop-blur-sm">
                        <div className="flex items-center justify-center gap-2 px-6 py-4">
                            {ONBOARDING_STEPS.slice(1).map((step, index) => {
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
                                        {index < ONBOARDING_STEPS.slice(1).length - 1 && (
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
                                        navigateTo("features");
                                    }}
                                    onBack={() => navigateTo("provider", -1)}
                                    onSkip={() => navigateTo("features")}
                                />
                            )}
                            {currentStep === "features" && (
                                <FeaturesStep
                                    onContinue={handleComplete}
                                    onBack={() => navigateTo("auth", -1)}
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </Shell>
    );
}
