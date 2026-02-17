"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type SkillLibraryItem = {
  skillId: string;
  characterId: string;
  characterName: string;
  name: string;
  description: string;
  category: string | null;
  version: number;
  runCount30d: number;
  successRate30d: number | null;
  updatedAt: string;
};

type CharacterOption = { id: string; name: string; displayName?: string | null };

interface SkillLibraryProps {
  onOpenSkill?: (skillId: string, characterId: string) => void;
}

export function SkillLibrary({ onOpenSkill }: SkillLibraryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SkillLibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [copyTargets, setCopyTargets] = useState<Record<string, string>>({});
  const [copyingSkillId, setCopyingSkillId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchLibrary = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ all: "true", limit: "100", sort: query ? "relevance" : "updated_desc" });
      if (query.trim()) params.set("query", query.trim());
      if (category.trim()) params.set("category", category.trim());

      const res = await fetch(`/api/skills?${params.toString()}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load skill library");
      }

      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems(nextItems);

      await fetch("/api/skills/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "skill_library_opened",
          metadata: { query: query.trim(), category: category.trim(), resultCount: nextItems.length },
        }),
      });

      if (nextItems.length === 0) {
        await fetch("/api/skills/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "skill_library_zero_results",
            metadata: { query: query.trim(), category: category.trim() },
          }),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skill library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLibrary();
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await fetch("/api/characters");
      if (!res.ok || !active) return;
      const payload = await res.json().catch(() => ({}));
      const list = Array.isArray(payload.characters) ? payload.characters : [];
      setCharacters(list);
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const onApplyFilters = async () => {
    await fetch("/api/skills/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "skill_library_filtered",
        metadata: { query: query.trim(), category: category.trim() },
      }),
    });
    await fetchLibrary();
  };

  const onCopy = async (skillId: string) => {
    const targetCharacterId = copyTargets[skillId];
    if (!targetCharacterId) return;
    setCopyingSkillId(skillId);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCharacterId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to copy skill");
      setMessage("Skill copied successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy skill");
    } finally {
      setCopyingSkillId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-terminal-border">
        <CardHeader>
          <CardTitle className="font-mono text-terminal-dark">Cross-Agent Skill Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills"
              className="rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm">
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <Button onClick={onApplyFilters} variant="outline" className="font-mono">Apply Filters</Button>
          </div>
          {message ? <p className="text-sm font-mono text-green-700">{message}</p> : null}
          {error ? <p className="text-sm font-mono text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : null}

      {!loading && items.length === 0 ? (
        <Card><CardContent className="pt-6 font-mono text-terminal-muted">No skills matched your current filters.</CardContent></Card>
      ) : null}

      <div className="grid gap-3">
        {items.map((item) => (
          <Card key={item.skillId} className="border-terminal-border">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-terminal-dark font-semibold">{item.name}</p>
                  <p className="text-xs font-mono text-terminal-muted">{item.characterName}</p>
                </div>
                <Badge variant="outline" className="font-mono text-xs">v{item.version}</Badge>
              </div>

              <p className="text-sm text-terminal-muted">{item.description || "No description"}</p>
              <div className="flex flex-wrap gap-3 text-xs font-mono text-terminal-muted">
                <span>Category: {item.category || "general"}</span>
                <span>Runs: {item.runCount30d}</span>
                <span>Success: {item.successRate30d ?? "N/A"}%</span>
                <span>Updated: {new Date(item.updatedAt).toLocaleString()}</span>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <select
                  value={copyTargets[item.skillId] || ""}
                  onChange={(e) => setCopyTargets((prev) => ({ ...prev, [item.skillId]: e.target.value }))}
                  className="rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
                >
                  <option value="">Select target agent</option>
                  {characters
                    .filter((character) => character.id !== item.characterId)
                    .map((character) => (
                      <option key={character.id} value={character.id}>{character.displayName || character.name}</option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  className="font-mono"
                  onClick={() => onCopy(item.skillId)}
                  disabled={!copyTargets[item.skillId] || copyingSkillId === item.skillId}
                >
                  {copyingSkillId === item.skillId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Copy
                </Button>
                <Button
                  variant="outline"
                  className="font-mono"
                  onClick={() => onOpenSkill?.(item.skillId, item.characterId)}
                >
                  Open
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}