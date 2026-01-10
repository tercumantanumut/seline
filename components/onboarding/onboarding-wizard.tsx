"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Shell } from "@/components/layout/shell";
import {
    WelcomeStep,
    ProviderStep,
    AuthStep,
    PersonalizationStep,
    CompleteStep,
} from "./steps";
import { Sparkles, Key, Palette, CheckCircle2 } from "lucide-react";

type OnboardingStep = "welcome" | "provider" | "auth" | "personalization" | "complete";

interface OnboardingState {
    llmProvider: "anthropic" | "openrouter" | "antigravity";
    apiKey: string;
    isAuthenticated: boolean;
    preferences: {
        visual_preferences: string[];
        communication_style: string[];
        workflow_patterns: string[];
    };
}

const ONBOARDING_STEPS = [
    { id: "welcome", label: "Welcome", icon: <Sparkles className="w-4 h-4" /> },
    { id: "provider", label: "Provider", icon: <Key className="w-4 h-4" /> },
    { id: "auth", label: "Connect", icon: <Key className="w-4 h-4" /> },
    { id: "personalization", label: "Personalize", icon: <Palette className="w-4 h-4" /> },
    { id: "complete", label: "Ready", icon: <CheckCircle2 className="w-4 h-4" /> },
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
    const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
    const [direction, setDirection] = useState(0);
    const [state, setState] = useState<OnboardingState>({
        llmProvider: "antigravity", // Default to free option
        apiKey: "",
        isAuthenticated: false,
        preferences: {
            visual_preferences: [],
            communication_style: [],
            workflow_patterns: [],
        },
    });

    const router = useRouter();
    const t = useTranslations("onboarding");

    const navigateTo = useCallback((step: OnboardingStep, dir: number = 1) => {
        setDirection(dir);
        setCurrentStep(step);
    }, []);

    const handleComplete = async () => {
        try {
            await fetch("/api/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    globalMemoryDefaults: state.preferences,
                }),
            });

            router.push("/");
        } catch (error) {
            console.error("Failed to complete onboarding:", error);
            // Still navigate even if saving preferences fails
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
                                        navigateTo("personalization");
                                    }}
                                    onBack={() => navigateTo("provider", -1)}
                                    onSkip={() => navigateTo("personalization")}
                                />
                            )}
                            {currentStep === "personalization" && (
                                <PersonalizationStep
                                    preferences={state.preferences}
                                    onUpdate={(prefs) => setState({ ...state, preferences: prefs })}
                                    onContinue={() => navigateTo("complete")}
                                    onSkip={() => navigateTo("complete")}
                                    onBack={() => navigateTo("auth", -1)}
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
