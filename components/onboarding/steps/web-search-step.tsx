"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, ExternalLink, ChevronRight, ChevronLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface WebSearchStepProps {
    onContinue: (tavilyApiKey: string) => void;
    onBack: () => void;
    onSkip: () => void;
}

export function WebSearchStep({ onContinue, onBack, onSkip }: WebSearchStepProps) {
    const [apiKey, setApiKey] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [validationStatus, setValidationStatus] = useState<"idle" | "valid" | "invalid">("idle");
    const [validationMessage, setValidationMessage] = useState("");

    const handleValidate = async () => {
        if (!apiKey.trim()) {
            setValidationStatus("invalid");
            setValidationMessage("Please enter an API key");
            return;
        }

        setIsValidating(true);
        setValidationStatus("idle");

        try {
            // Test the API key with a simple search
            const response = await fetch("/api/web-search/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: apiKey.trim() }),
            });

            const data = await response.json();

            if (data.valid) {
                setValidationStatus("valid");
                setValidationMessage("API key is valid!");
            } else {
                setValidationStatus("invalid");
                setValidationMessage(data.error || "Invalid API key");
            }
        } catch (error) {
            setValidationStatus("invalid");
            setValidationMessage("Failed to validate API key");
        } finally {
            setIsValidating(false);
        }
    };

    const handleContinue = () => {
        onContinue(apiKey.trim());
    };

    return (
        <div className="flex items-center justify-center min-h-full p-6">
            <div className="w-full max-w-2xl space-y-8">
                {/* Header */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-terminal-green/10 border-2 border-terminal-green/20">
                        <Search className="w-8 h-8 text-terminal-green" />
                    </div>
                    <h1 className="font-mono text-3xl font-bold text-terminal-dark">
                        Enable Web Search
                    </h1>
                    <p className="font-mono text-terminal-muted max-w-lg mx-auto">
                        Configure Tavily API to unlock Deep Research and web search capabilities for your agents
                    </p>
                </div>

                {/* Feature Overview */}
                <div className="rounded-lg border-2 border-terminal-border bg-white p-6 space-y-4">
                    <h2 className="font-mono text-lg font-semibold text-terminal-dark">
                        What you'll get:
                    </h2>
                    <ul className="space-y-3">
                        <li className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-terminal-green mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-mono text-sm font-medium text-terminal-dark">Deep Research</p>
                                <p className="font-mono text-xs text-terminal-muted">
                                    Comprehensive web research with multi-source synthesis
                                </p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-terminal-green mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-mono text-sm font-medium text-terminal-dark">Real-time Information</p>
                                <p className="font-mono text-xs text-terminal-muted">
                                    Access current events, news, and up-to-date information
                                </p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-terminal-green mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-mono text-sm font-medium text-terminal-dark">Fact Verification</p>
                                <p className="font-mono text-xs text-terminal-muted">
                                    Verify claims and cross-reference information from multiple sources
                                </p>
                            </div>
                        </li>
                    </ul>
                </div>

                {/* API Key Configuration */}
                <div className="rounded-lg border-2 border-terminal-border bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-mono text-base font-semibold text-terminal-dark">
                            Tavily API Key
                        </h3>
                        <a
                            href="https://app.tavily.com/sign-up"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-mono text-xs text-terminal-green hover:text-terminal-green/80 transition-colors"
                        >
                            Get your API key
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    </div>

                    <div className="space-y-3">
                        <div className="relative">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    setValidationStatus("idle");
                                    setValidationMessage("");
                                }}
                                placeholder="tvly-..."
                                className="w-full rounded border border-terminal-border bg-white px-4 py-3 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-2 focus:ring-terminal-green/20"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && apiKey.trim()) {
                                        handleValidate();
                                    }
                                }}
                            />
                            {validationStatus !== "idle" && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {validationStatus === "valid" && (
                                        <CheckCircle2 className="w-5 h-5 text-terminal-green" />
                                    )}
                                    {validationStatus === "invalid" && (
                                        <AlertCircle className="w-5 h-5 text-red-500" />
                                    )}
                                </div>
                            )}
                        </div>

                        {validationMessage && (
                            <p
                                className={`font-mono text-xs ${
                                    validationStatus === "valid"
                                        ? "text-terminal-green"
                                        : "text-red-600"
                                }`}
                            >
                                {validationMessage}
                            </p>
                        )}

                        <Button
                            onClick={handleValidate}
                            disabled={!apiKey.trim() || isValidating}
                            variant="outline"
                            className="w-full gap-2 font-mono"
                        >
                            {isValidating ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Validating...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Test API Key
                                </>
                            )}
                        </Button>
                    </div>

                    <div className="rounded bg-terminal-cream/50 p-3 space-y-2">
                        <p className="font-mono text-xs font-medium text-terminal-dark">
                            Getting started:
                        </p>
                        <ol className="font-mono text-xs text-terminal-muted space-y-1 list-decimal list-inside">
                            <li>Sign up at tavily.com (free tier available)</li>
                            <li>Copy your API key from the dashboard</li>
                            <li>Paste it above and click "Test API Key"</li>
                        </ol>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-4">
                    <Button
                        onClick={onBack}
                        variant="outline"
                        className="gap-2 font-mono"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                    </Button>

                    <div className="flex items-center gap-3">
                        <Button
                            onClick={onSkip}
                            variant="ghost"
                            className="font-mono text-terminal-muted hover:text-terminal-dark"
                        >
                            Skip for now
                        </Button>
                        <Button
                            onClick={handleContinue}
                            disabled={validationStatus !== "valid"}
                            className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90"
                        >
                            Continue
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
