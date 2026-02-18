"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Globe, ExternalLink, ChevronRight, ChevronLeft, Loader2, CheckCircle2, AlertCircle, Zap, Server } from "lucide-react";

interface WebScrapingStepProps {
    onContinue: (provider: "firecrawl" | "local", firecrawlApiKey?: string) => void;
    onBack: () => void;
    onSkip: () => void;
}

export function WebScrapingStep({ onContinue, onBack, onSkip }: WebScrapingStepProps) {
    const [provider, setProvider] = useState<"firecrawl" | "local">("local");
    const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [validationStatus, setValidationStatus] = useState<"idle" | "valid" | "invalid">("idle");
    const [validationMessage, setValidationMessage] = useState("");

    const handleValidateFirecrawl = async () => {
        if (!firecrawlApiKey.trim()) {
            setValidationStatus("invalid");
            setValidationMessage("Please enter an API key");
            return;
        }

        setIsValidating(true);
        setValidationStatus("idle");

        try {
            const response = await fetch("/api/web-scraping/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: firecrawlApiKey.trim() }),
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
        if (provider === "firecrawl") {
            onContinue(provider, firecrawlApiKey.trim());
        } else {
            onContinue(provider);
        }
    };

    const canContinue = 
        provider === "local" || 
        (provider === "firecrawl" && validationStatus === "valid");

    return (
        <div className="flex items-center justify-center min-h-full p-6">
            <div className="w-full max-w-2xl space-y-8">
                {/* Header */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-terminal-green/10 border-2 border-terminal-green/20">
                        <Globe className="w-8 h-8 text-terminal-green" />
                    </div>
                    <h1 className="font-mono text-3xl font-bold text-terminal-dark">
                        Web Scraping Provider
                    </h1>
                    <p className="font-mono text-terminal-muted max-w-lg mx-auto">
                        Choose how your agents will browse and extract content from web pages
                    </p>
                </div>

                {/* Provider Selection */}
                <div className="space-y-4">
                    {/* Local (Puppeteer) Option */}
                    <button
                        onClick={() => {
                            setProvider("local");
                            setValidationStatus("idle");
                            setValidationMessage("");
                        }}
                        className={`w-full rounded-lg border-2 p-6 text-left transition-all ${
                            provider === "local"
                                ? "border-terminal-green bg-terminal-green/5"
                                : "border-terminal-border bg-white hover:border-terminal-green/50"
                        }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${
                                provider === "local"
                                    ? "bg-terminal-green/10 text-terminal-green"
                                    : "bg-terminal-dark/5 text-terminal-muted"
                            }`}>
                                <Zap className="w-6 h-6" />
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-mono text-lg font-semibold text-terminal-dark">
                                        Local (Puppeteer)
                                    </h3>
                                    <span className="px-2 py-0.5 rounded-full bg-terminal-green/10 font-mono text-xs text-terminal-green font-medium">
                                        Recommended
                                    </span>
                                </div>
                                <p className="font-mono text-sm text-terminal-muted">
                                    Built-in web scraping using Puppeteer. No API key required, runs on your machine.
                                </p>
                                <ul className="space-y-1.5 mt-3">
                                    <li className="flex items-center gap-2 font-mono text-xs text-terminal-muted">
                                        <CheckCircle2 className="w-4 h-4 text-terminal-green flex-shrink-0" />
                                        Free and unlimited
                                    </li>
                                    <li className="flex items-center gap-2 font-mono text-xs text-terminal-muted">
                                        <CheckCircle2 className="w-4 h-4 text-terminal-green flex-shrink-0" />
                                        Works offline
                                    </li>
                                    <li className="flex items-center gap-2 font-mono text-xs text-terminal-muted">
                                        <CheckCircle2 className="w-4 h-4 text-terminal-green flex-shrink-0" />
                                        Full JavaScript support
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </button>

                    {/* Firecrawl Option */}
                    <button
                        onClick={() => {
                            setProvider("firecrawl");
                            setValidationStatus("idle");
                            setValidationMessage("");
                        }}
                        className={`w-full rounded-lg border-2 p-6 text-left transition-all ${
                            provider === "firecrawl"
                                ? "border-terminal-green bg-terminal-green/5"
                                : "border-terminal-border bg-white hover:border-terminal-green/50"
                        }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${
                                provider === "firecrawl"
                                    ? "bg-terminal-green/10 text-terminal-green"
                                    : "bg-terminal-dark/5 text-terminal-muted"
                            }`}>
                                <Server className="w-6 h-6" />
                            </div>
                            <div className="flex-1 space-y-2">
                                <h3 className="font-mono text-lg font-semibold text-terminal-dark">
                                    Firecrawl (Cloud API)
                                </h3>
                                <p className="font-mono text-sm text-terminal-muted">
                                    Professional cloud-based scraping with advanced features and reliability.
                                </p>
                                <ul className="space-y-1.5 mt-3">
                                    <li className="flex items-center gap-2 font-mono text-xs text-terminal-muted">
                                        <CheckCircle2 className="w-4 h-4 text-terminal-green flex-shrink-0" />
                                        Advanced anti-bot bypass
                                    </li>
                                    <li className="flex items-center gap-2 font-mono text-xs text-terminal-muted">
                                        <CheckCircle2 className="w-4 h-4 text-terminal-green flex-shrink-0" />
                                        Structured data extraction
                                    </li>
                                    <li className="flex items-center gap-2 font-mono text-xs text-terminal-muted">
                                        <CheckCircle2 className="w-4 h-4 text-terminal-green flex-shrink-0" />
                                        Managed infrastructure
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </button>
                </div>

                {/* Firecrawl API Key Configuration */}
                {provider === "firecrawl" && (
                    <div className="rounded-lg border-2 border-terminal-border bg-white p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-mono text-base font-semibold text-terminal-dark">
                                Firecrawl API Key
                            </h3>
                            <a
                                href="https://www.firecrawl.dev"
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
                                    value={firecrawlApiKey}
                                    onChange={(e) => {
                                        setFirecrawlApiKey(e.target.value);
                                        setValidationStatus("idle");
                                        setValidationMessage("");
                                    }}
                                    placeholder="fc-..."
                                    className="w-full rounded border border-terminal-border bg-white px-4 py-3 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-2 focus:ring-terminal-green/20"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && firecrawlApiKey.trim()) {
                                            handleValidateFirecrawl();
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
                                onClick={handleValidateFirecrawl}
                                disabled={!firecrawlApiKey.trim() || isValidating}
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
                                <li>Sign up at firecrawl.dev</li>
                                <li>Copy your API key from the dashboard</li>
                                <li>Paste it above and click "Test API Key"</li>
                            </ol>
                        </div>
                    </div>
                )}

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
                            disabled={!canContinue}
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
