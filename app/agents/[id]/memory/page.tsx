"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  AlertCircle,
  Brain,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Sparkles,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  MemoryEntry,
  MemoryMetadata,
  MemoryCategory,
} from "@/lib/agent-memory/types";
import { MEMORY_CATEGORIES } from "@/lib/agent-memory/types";
import { MemoryCard } from "@/components/agent-memory/memory-card";
import { MemoryForm } from "@/components/agent-memory/memory-form";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type FilterType = "all" | "pending" | "approved";

interface CharacterBasic {
  id: string;
  name: string;
  displayName?: string | null;
}

export default function AgentMemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: characterId } = use(params);
  const t = useTranslations("memory.page");

  const [character, setCharacter] = useState<CharacterBasic | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [metadata, setMetadata] = useState<MemoryMetadata | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Load character info
  useEffect(() => {
    async function loadCharacter() {
      try {
        const response = await fetch(`/api/characters/${characterId}`);
        if (response.ok) {
          const data = await response.json();
          setCharacter(data.character);
        } else if (response.status === 404) {
          setError(t("errors.notFound"));
        } else if (response.status === 403) {
          setError(t("errors.forbidden"));
        }
      } catch (err) {
        console.error("Failed to load character:", err);
        setError(t("errors.loadFailed"));
      }
    }
    loadCharacter();
  }, [characterId, t]);

  // Load memories
  const loadMemories = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/characters/${characterId}/memory?filter=${filter}`
      );
      if (response.ok) {
        const data = await response.json();
        setMemories(data.memories);
        setMetadata(data.metadata);
      }
    } catch (err) {
      console.error("Failed to load memories:", err);
    } finally {
      setIsLoading(false);
    }
  }, [characterId, filter]);

  useEffect(() => {
    if (character) {
      loadMemories();
    }
  }, [character, loadMemories]);

  // Handle memory actions
  const handleApprove = async (memoryId: string, edits?: { content?: string; category?: MemoryCategory }) => {
    try {
      const response = await fetch(
        `/api/characters/${characterId}/memory/${memoryId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", ...edits }),
        }
      );
      if (response.ok) {
        await loadMemories();
      }
    } catch (err) {
      console.error("Failed to approve memory:", err);
      toast.error(t("errors.approveFailed"));
    }
  };

  const handleReject = async (memoryId: string) => {
    try {
      const response = await fetch(
        `/api/characters/${characterId}/memory/${memoryId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject" }),
        }
      );
      if (response.ok) {
        await loadMemories();
      }
    } catch (err) {
      console.error("Failed to reject memory:", err);
      toast.error(t("errors.rejectFailed"));
    }
  };

  const handleDelete = async (memoryId: string) => {
    try {
      const response = await fetch(
        `/api/characters/${characterId}/memory/${memoryId}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        await loadMemories();
      }
    } catch (err) {
      console.error("Failed to delete memory:", err);
      toast.error(t("errors.deleteFailed"));
    }
  };

  const handleAddMemory = async (data: { category: MemoryCategory; content: string }) => {
    try {
      const response = await fetch(`/api/characters/${characterId}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        setShowAddForm(false);
        await loadMemories();
      }
    } catch (err) {
      console.error("Failed to add memory:", err);
      toast.error(t("errors.addFailed"));
    }
  };

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-semibold">{error}</h1>
          <Button asChild>
            <Link href="/">{t("goHome")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-terminal-border bg-terminal-cream/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-terminal-green" />
              <h1 className="text-lg font-semibold font-mono text-terminal-dark">
                {t("title")}
              </h1>
              {character && (
                <span className="text-terminal-muted font-mono">
                  - {character.displayName || character.name}
                </span>
              )}
            </div>
            <Button
              onClick={() => setShowAddForm(true)}
              className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-terminal-cream"
            >
              <Plus className="h-4 w-4" />
              {t("addButton")}
            </Button>
          </div>

          {/* Stats */}
          {metadata && (
            <div className="flex items-center gap-6 mt-4 text-sm font-mono">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-terminal-dark">
                  {metadata.approvedCount} {t("approved")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-terminal-dark">
                  {metadata.pendingCount} {t("pending")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-terminal-muted" />
                <span className="text-terminal-muted">
                  {metadata.rejectedCount} {t("rejected")}
                </span>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex items-center gap-2 mt-4">
            <Filter className="h-4 w-4 text-terminal-muted" />
            {(["all", "pending", "approved"] as FilterType[]).map((f) => (
              <Button
                key={f}
                variant="ghost"
                size="sm"
                onClick={() => setFilter(f)}
                className={cn(
                  "font-mono",
                  filter === f
                    ? "bg-terminal-green/10 text-terminal-green"
                    : "text-terminal-muted hover:text-terminal-dark"
                )}
              >
                {t(`filters.${f}`)}
                {f === "pending" && metadata && metadata.pendingCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                    {metadata.pendingCount}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {/* Add Memory Form */}
            {showAddForm && (
              <div className="mb-6">
                <MemoryForm
                  onSubmit={handleAddMemory}
                  onCancel={() => setShowAddForm(false)}
                />
              </div>
            )}

            {/* Loading */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
              </div>
            ) : memories.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles className="h-12 w-12 text-terminal-muted mb-4" />
                <h2 className="text-lg font-semibold font-mono text-terminal-dark mb-2">
                  {t("empty.title")}
                </h2>
                <p className="text-terminal-muted font-mono text-sm max-w-md mb-4">
                  {t(`empty.${filter}`)}
                </p>
                {filter !== "all" && (
                  <Button
                    variant="ghost"
                    onClick={() => setFilter("all")}
                    className="font-mono"
                  >
                    {t("viewAll")}
                  </Button>
                )}
              </div>
            ) : (
              /* Memory list */
              <div className="space-y-4">
                {memories.map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </Shell>
  );
}
