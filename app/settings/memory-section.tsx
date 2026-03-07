"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2Icon, BrainIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function MemorySection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);
  const [everMemOSEnabled, setEverMemOSEnabled] = useState(false);
  const [everMemOSServerUrl, setEverMemOSServerUrl] = useState("");
  const [everMemOSSaving, setEverMemOSSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const settings = await response.json();
        if (settings.everMemOSEnabled !== undefined) {
          setEverMemOSEnabled(settings.everMemOSEnabled);
        }
        if (settings.everMemOSServerUrl) {
          setEverMemOSServerUrl(settings.everMemOSServerUrl);
        }
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveEverMemOSSettings = async (enabled: boolean, serverUrl: string) => {
    setEverMemOSSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ everMemOSEnabled: enabled, everMemOSServerUrl: serverUrl }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error("Failed to save EverMemOS settings:", error);
      toast.error(t("errors.memorySaveFailed"));
    } finally {
      setEverMemOSSaving(false);
    }
  };

  const handleResetOnboarding = async () => {
    setResettingOnboarding(true);
    try {
      const response = await fetch("/api/onboarding", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      router.push("/onboarding");
    } catch (error) {
      console.error("Failed to reset onboarding:", error);
      toast.error(t("errors.resetOnboardingFailed"));
      setResettingOnboarding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-6 animate-spin text-terminal-green" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* EverMemOS Shared Memory */}
      <div className="space-y-4">
        <div>
          <h2 className="font-mono text-lg font-semibold text-terminal-dark flex items-center gap-2">
            <BrainIcon className="size-5 text-terminal-green" />
            {t("preferences.everMemOS.heading")}
          </h2>
          <p className="mt-1 font-mono text-sm text-terminal-muted">
            {t("preferences.everMemOS.description")}
          </p>
        </div>

        <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <label className="flex items-center justify-between gap-3">
            <div>
              <span className="font-mono text-sm text-terminal-dark">{t("preferences.everMemOS.enableLabel")}</span>
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("preferences.everMemOS.enableDesc")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={everMemOSEnabled}
              onChange={(e) => {
                setEverMemOSEnabled(e.target.checked);
                saveEverMemOSSettings(e.target.checked, everMemOSServerUrl);
              }}
              className="size-5 accent-terminal-green"
            />
          </label>
        </div>

        {everMemOSEnabled && (
          <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
            <label className="mb-1 block font-mono text-sm text-terminal-muted">
              {t("preferences.everMemOS.serverUrlLabel")}
            </label>
            <input
              type="text"
              value={everMemOSServerUrl}
              onChange={(e) => setEverMemOSServerUrl(e.target.value)}
              onBlur={() => saveEverMemOSSettings(everMemOSEnabled, everMemOSServerUrl)}
              placeholder={t("preferences.everMemOS.serverUrlPlaceholder")}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("preferences.everMemOS.serverUrlHelper")}
            </p>
          </div>
        )}
      </div>

      {/* Run onboarding again */}
      <div className="border-t border-terminal-border pt-6">
        <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                {t("onboarding.title")}
              </h3>
              <p className="font-mono text-xs text-terminal-muted mt-1">
                {t("onboarding.description")}
              </p>
            </div>
            <Button
              onClick={handleResetOnboarding}
              disabled={resettingOnboarding}
              variant="outline"
              className="gap-2 font-mono"
            >
              {resettingOnboarding ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              {t("onboarding.cta")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
