"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SkillCard } from "@/components/skills/skill-card";
import { SkillSearch } from "@/components/skills/skill-search";
import { SkillSection } from "@/components/skills/skill-section";
import { SkillDetailDialog } from "@/components/skills/skill-detail-dialog";
import type { CatalogSkillWithStatus, SkillCategory } from "@/lib/skills/catalog/types";

type CharacterOption = { id: string; name: string; displayName?: string | null };

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  design: "Design",
  deploy: "Deploy",
  "dev-tools": "Dev Tools",
  productivity: "Productivity",
  creative: "Creative",
  docs: "Docs",
  security: "Security",
};

const CATEGORY_ORDER: SkillCategory[] = [
  "dev-tools",
  "deploy",
  "design",
  "productivity",
  "creative",
  "docs",
  "security",
];

export function SkillCatalogPage() {
  const [catalog, setCatalog] = useState<CatalogSkillWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<CatalogSkillWithStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());

  // Fetch catalog + characters on mount
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [catalogRes, charsRes] = await Promise.all([
          fetch("/api/skills/catalog"),
          fetch("/api/characters"),
        ]);

        if (!active) return;

        if (!catalogRes.ok) throw new Error("Failed to load catalog");

        const catalogData = await catalogRes.json();
        const charsData = charsRes.ok ? await charsRes.json() : { characters: [] };

        const allCatalog: CatalogSkillWithStatus[] = [
          ...(Array.isArray(catalogData.systemSkills) ? catalogData.systemSkills : []),
          ...(Array.isArray(catalogData.catalog) ? catalogData.catalog : []),
        ];
        setCatalog(allCatalog);

        const charList: CharacterOption[] = Array.isArray(charsData.characters)
          ? charsData.characters
          : [];
        setCharacters(charList);

        // Default to the first character (usually the default agent)
        if (charList.length > 0) {
          setActiveCharacterId(charList[0].id);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, []);

  // Filtered catalog
  const filtered = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    return catalog.filter(
      (s) =>
        s.displayName.toLowerCase().includes(q) ||
        s.shortDescription.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.category.toLowerCase().includes(q)
    );
  }, [catalog, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, CatalogSkillWithStatus[]>();
    for (const skill of filtered) {
      const existing = map.get(skill.category) || [];
      existing.push(skill);
      map.set(skill.category, existing);
    }
    // Return in preferred order, with a fallback for unknown categories
    const result: Array<{ category: string; label: string; skills: CatalogSkillWithStatus[] }> = [];
    const seen = new Set<string>();
    for (const cat of CATEGORY_ORDER) {
      const skills = map.get(cat);
      if (skills && skills.length > 0) {
        result.push({ category: cat, label: CATEGORY_LABELS[cat], skills });
      }
      seen.add(cat);
    }
    // Collect any skills with categories not in CATEGORY_ORDER
    for (const [cat, skills] of map) {
      if (!seen.has(cat) && skills.length > 0) {
        result.push({ category: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1), skills });
      }
    }
    return result;
  }, [filtered]);

  const handleInstall = useCallback(async (catalogSkillId: string) => {
    if (!activeCharacterId) {
      toast.error("Select an agent first");
      return;
    }

    setInstallingIds((prev) => new Set(prev).add(catalogSkillId));

    try {
      const res = await fetch("/api/skills/catalog/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogSkillId, characterId: activeCharacterId }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        toast.info("Already installed");
        // Update local state
        setCatalog((prev) =>
          prev.map((s) =>
            s.id === catalogSkillId
              ? { ...s, isInstalled: true, installedSkillId: data.existingSkillId ?? s.installedSkillId, isEnabled: true }
              : s
          )
        );
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Install failed");
      }

      toast.success(`${data.name || "Skill"} installed`);

      // Update local state to reflect installation
      setCatalog((prev) =>
        prev.map((s) =>
          s.id === catalogSkillId
            ? { ...s, isInstalled: true, installedSkillId: data.skillId, isEnabled: true }
            : s
        )
      );

      // Also update the selected skill if the dialog is open
      setSelectedSkill((prev) =>
        prev?.id === catalogSkillId
          ? { ...prev, isInstalled: true, installedSkillId: data.skillId, isEnabled: true }
          : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(catalogSkillId);
        return next;
      });
    }
  }, [activeCharacterId]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <p className="font-mono text-terminal-muted">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="font-mono text-sm text-terminal-green underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-mono font-bold text-terminal-dark">Skill Catalog</h1>
        <p className="mt-1 text-sm text-terminal-muted">
          Browse and install skills to extend your agents.
        </p>
      </header>

      {/* Agent selector + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={activeCharacterId || ""}
          onChange={(e) => setActiveCharacterId(e.target.value || null)}
          className="rounded-lg border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark sm:w-48"
        >
          <option value="">Select agent</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName || c.name}
            </option>
          ))}
        </select>
        <SkillSearch value={search} onChange={setSearch} className="flex-1" />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-terminal-border bg-terminal-cream/50 p-8 text-center">
          <p className="font-mono text-terminal-muted">
            {search ? "No skills match your search." : "No skills available."}
          </p>
        </div>
      )}

      {/* Grouped sections */}
      {grouped.map(({ category, label, skills }) => (
        <SkillSection key={category} title={label} count={skills.length}>
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              variant={skill.isInstalled ? "installed" : "catalog"}
              isEnabled={skill.isEnabled ?? false}
              isBusy={installingIds.has(skill.id)}
              onInstall={() => handleInstall(skill.id)}
              onClick={() => {
                setSelectedSkill(skill);
                setDialogOpen(true);
              }}
            />
          ))}
        </SkillSection>
      ))}

      {/* Detail dialog */}
      <SkillDetailDialog
        skill={selectedSkill}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        characterId={activeCharacterId}
        onInstall={handleInstall}
      />
    </div>
  );
}
