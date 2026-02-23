"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2Icon, BrainIcon, XIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function MemorySection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [memoryDefaults, setMemoryDefaults] = useState<{
    visual_preferences: string[];
    communication_style: string[];
    workflow_patterns: string[];
  }>({
    visual_preferences: [],
    communication_style: [],
    workflow_patterns: [],
  });
  const [newMemory, setNewMemory] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"visual_preferences" | "communication_style" | "workflow_patterns">("visual_preferences");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);

  // Load global memory defaults on mount
  useEffect(() => {
    loadMemoryDefaults();
  }, []);

  const loadMemoryDefaults = async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const settings = await response.json();
        if (settings.globalMemoryDefaults) {
          setMemoryDefaults({
            visual_preferences: settings.globalMemoryDefaults.visual_preferences || [],
            communication_style: settings.globalMemoryDefaults.communication_style || [],
            workflow_patterns: settings.globalMemoryDefaults.workflow_patterns || [],
          });
        }
      }
    } catch (error) {
      console.error("Failed to load memory defaults:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveMemoryDefaults = async (newDefaults: typeof memoryDefaults) => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globalMemoryDefaults: newDefaults }),
      });
    } catch (error) {
      console.error("Failed to save memory defaults:", error);
      toast.error(t("errors.memorySaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddMemory = () => {
    if (!newMemory.trim()) return;

    const updated = {
      ...memoryDefaults,
      [selectedCategory]: [...memoryDefaults[selectedCategory], newMemory.trim()],
    };
    setMemoryDefaults(updated);
    saveMemoryDefaults(updated);
    setNewMemory("");
  };

  const handleRemoveMemory = (category: keyof typeof memoryDefaults, index: number) => {
    const updated = {
      ...memoryDefaults,
      [category]: memoryDefaults[category].filter((_, i) => i !== index),
    };
    setMemoryDefaults(updated);
    saveMemoryDefaults(updated);
  };

  const handleResetOnboarding = async () => {
    setResettingOnboarding(true);
    try {
      await fetch("/api/onboarding", { method: "DELETE" });
      router.push("/onboarding");
    } catch (error) {
      console.error("Failed to reset onboarding:", error);
      setResettingOnboarding(false);
    }
  };

  const categoryLabels = {
    visual_preferences: t("memory.categoryLabels.visual_preferences"),
    communication_style: t("memory.categoryLabels.communication_style"),
    workflow_patterns: t("memory.categoryLabels.workflow_patterns"),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-6 animate-spin text-terminal-green" />
      </div>
    );
  }

  const totalMemories = Object.values(memoryDefaults).flat().length;

  return (
    <div className="space-y-8">
      {/* Global Memory Defaults */}
      <div className="space-y-4">
        <div>
          <h2 className="font-mono text-lg font-semibold text-terminal-dark flex items-center gap-2">
            <BrainIcon className="size-5 text-terminal-green" />
            {t("memoryDefaults.title")}
          </h2>
          <p className="mt-1 font-mono text-sm text-terminal-muted">
            {t("memoryDefaults.description")}
          </p>
        </div>

        {/* Add new default memory */}
        <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <h3 className="font-mono text-sm font-medium text-terminal-dark mb-3">
            {t("memoryDefaults.addNew")}
          </h3>
          <div className="flex gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as typeof selectedCategory)}
              className="rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm"
            >
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder={t("memoryDefaults.placeholder")}
              className="flex-1 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAddMemory()}
            />
            <Button
              onClick={handleAddMemory}
              disabled={!newMemory.trim() || saving}
              className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90"
            >
              {t("memoryDefaults.add")}
            </Button>
          </div>
        </div>

        {/* Existing default memory */}
        {totalMemories === 0 ? (
          <div className="rounded-lg border border-dashed border-terminal-border bg-terminal-cream/30 p-6 text-center">
            <p className="font-mono text-sm text-terminal-muted">
              {t("memoryDefaults.empty")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(memoryDefaults).map(([category, memories]) => {
              if (memories.length === 0) return null;

              return (
                <div key={category} className="rounded-lg border border-terminal-border bg-terminal-cream/30 p-4">
                  <h3 className="font-mono text-sm font-medium text-terminal-dark mb-3">
                    {categoryLabels[category as keyof typeof categoryLabels]}
                  </h3>
                  <ul className="space-y-2">
                    {memories.map((memory, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-2 bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 rounded px-3 py-2 border border-terminal-border"
                      >
                        <span className="flex-1 font-mono text-sm text-terminal-dark">{memory}</span>
                        <button
                          onClick={() => handleRemoveMemory(category as keyof typeof memoryDefaults, index)}
                          className="text-terminal-muted hover:text-red-500 transition-colors p-1"
                        >
                          <XIcon className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
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
