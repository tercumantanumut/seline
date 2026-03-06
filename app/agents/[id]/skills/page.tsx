"use client";

import { useEffect, useState, useMemo, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertCircle, Plus, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { SkillImportDropzone } from "@/components/skills/skill-import-dropzone";
import { SkillCard } from "@/components/skills/skill-card";
import { SkillSearch } from "@/components/skills/skill-search";
import { SkillSection } from "@/components/skills/skill-section";
import { SkillDetailDialog } from "@/components/skills/skill-detail-dialog";
import { toast } from "sonner";
import type { CatalogSkillWithStatus, SkillCategory } from "@/lib/skills/catalog/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SkillRecord = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  status: "draft" | "active" | "archived";
  runCount: number;
  successCount: number;
  lastRunAt: string | null;
  category: string;
  version: number;
  catalogId: string | null;
};

type CharacterBasic = {
  id: string;
  name: string;
  displayName?: string | null;
};

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

export default function AgentSkillsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: characterId } = use(params);
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const router = useRouter();

  const [character, setCharacter] = useState<CharacterBasic | null>(null);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Catalog state
  const [catalog, setCatalog] = useState<CatalogSkillWithStatus[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [selectedSkill, setSelectedSkill] = useState<CatalogSkillWithStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Load character + agent skills + catalog all on mount
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setCatalogLoading(true);

        const [characterRes, skillsRes, catalogRes] = await Promise.all([
          fetch(`/api/characters/${characterId}`),
          fetch(`/api/skills?characterId=${encodeURIComponent(characterId)}`),
          fetch(`/api/skills/catalog?characterId=${encodeURIComponent(characterId)}`),
        ]);

        if (!mounted) return;

        if (!characterRes.ok) {
          setError(characterRes.status === 404 ? tc("notFound") : tc("somethingWentWrong"));
          return;
        }

        const characterData = await characterRes.json();
        const skillsData = skillsRes.ok ? await skillsRes.json() : { skills: [] };
        const catalogData = catalogRes.ok ? await catalogRes.json() : { catalog: [], systemSkills: [] };

        setCharacter(characterData.character || null);
        setSkills(Array.isArray(skillsData.skills) ? skillsData.skills : []);

        const allCatalog: CatalogSkillWithStatus[] = [
          ...(Array.isArray(catalogData.systemSkills) ? catalogData.systemSkills : []),
          ...(Array.isArray(catalogData.catalog) ? catalogData.catalog : []),
        ];
        setCatalog(allCatalog);
      } catch (err) {
        console.error("Failed to load skills page:", err);
        if (mounted) setError(tc("somethingWentWrong"));
      } finally {
        if (mounted) {
          setIsLoading(false);
          setCatalogLoading(false);
        }
      }
    }

    loadData();
    return () => { mounted = false; };
  }, [characterId, tc]);

  const reloadSkills = async () => {
    const res = await fetch(`/api/skills?characterId=${encodeURIComponent(characterId)}`);
    if (res.ok) {
      const data = await res.json();
      setSkills(Array.isArray(data.skills) ? data.skills : []);
    }
  };

  // Custom skills = agent's skills not from catalog
  const customSkills = useMemo(() => {
    return skills.filter((s) => !s.catalogId);
  }, [skills]);

  // Filtered custom skills by search
  const filteredCustomSkills = useMemo(() => {
    if (!search.trim()) return customSkills;
    const q = search.toLowerCase();
    return customSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q))
    );
  }, [customSkills, search]);

  // Filtered catalog skills by search
  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    return catalog.filter(
      (s) =>
        s.displayName.toLowerCase().includes(q) ||
        s.shortDescription.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [catalog, search]);

  // Group catalog by category (same logic as SkillCatalogPage)
  const grouped = useMemo(() => {
    const map = new Map<string, CatalogSkillWithStatus[]>();
    for (const skill of filteredCatalog) {
      const existing = map.get(skill.category) || [];
      existing.push(skill);
      map.set(skill.category, existing);
    }
    const result: Array<{ category: string; label: string; skills: CatalogSkillWithStatus[] }> = [];
    const seen = new Set<string>();
    for (const cat of CATEGORY_ORDER) {
      const catSkills = map.get(cat);
      if (catSkills && catSkills.length > 0) {
        result.push({ category: cat, label: CATEGORY_LABELS[cat], skills: catSkills });
      }
      seen.add(cat);
    }
    for (const [cat, catSkills] of map) {
      if (!seen.has(cat) && catSkills.length > 0) {
        result.push({ category: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1), skills: catSkills });
      }
    }
    return result;
  }, [filteredCatalog]);

  // Toggle skill status (active/archived) — works for both custom and catalog-installed skills
  const handleToggleSkill = useCallback(async (skillId: string, enabled: boolean, catalogId?: string) => {
    setTogglingIds((prev) => new Set(prev).add(skillId));
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: enabled ? "active" : "archived" }),
      });
      if (!res.ok) throw new Error("Failed to update skill");
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? { ...s, status: enabled ? "active" : "archived" } : s))
      );
      // Sync catalog state if this is a catalog-installed skill
      if (catalogId) {
        setCatalog((prev) => prev.map((s) => s.id === catalogId ? { ...s, isEnabled: enabled } : s));
        setSelectedSkill((prev) => prev?.id === catalogId ? { ...prev, isEnabled: enabled } : prev);
      }
    } catch (err) {
      console.error("Toggle error:", err);
      toast.error("Failed to update skill status");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  }, []);

  // Delete custom skill
  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/skills/${skillToDelete}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete skill");
      setSkills((prev) => prev.filter((s) => s.id !== skillToDelete));
      toast.success(t("delete.success"));
    } catch (err) {
      toast.error(t("delete.error"));
      console.error(err);
    } finally {
      setIsDeleting(false);
      setSkillToDelete(null);
    }
  };

  // Uninstall a catalog skill (delete the installed copy, update catalog state)
  const handleUninstallCatalogSkill = useCallback(async (catalogSkillId: string, installedSkillId: string) => {
    setTogglingIds((prev) => new Set(prev).add(installedSkillId));
    try {
      const res = await fetch(`/api/skills/${installedSkillId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to uninstall skill");
      setCatalog((prev) =>
        prev.map((s) =>
          s.id === catalogSkillId ? { ...s, isInstalled: false, installedSkillId: null, isEnabled: null } : s
        )
      );
      setSelectedSkill((prev) =>
        prev?.id === catalogSkillId ? { ...prev, isInstalled: false, installedSkillId: null, isEnabled: null } : prev
      );
      await reloadSkills();
      toast.success("Skill uninstalled");
    } catch (err) {
      console.error("Uninstall error:", err);
      toast.error("Failed to uninstall skill");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(installedSkillId);
        return next;
      });
    }
  }, []);

  // Install catalog skill
  const handleInstallCatalogSkill = useCallback(async (catalogSkillId: string) => {
    setInstallingIds((prev) => new Set(prev).add(catalogSkillId));
    try {
      const res = await fetch("/api/skills/catalog/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogSkillId, characterId }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        toast.info("Skill is already installed on this agent");
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
        throw new Error(data.error || "Failed to install skill");
      }

      toast.success(`${data.name || "Skill"} installed`);

      setCatalog((prev) =>
        prev.map((s) =>
          s.id === catalogSkillId
            ? { ...s, isInstalled: true, installedSkillId: data.skillId, isEnabled: true }
            : s
        )
      );

      setSelectedSkill((prev) =>
        prev?.id === catalogSkillId
          ? { ...prev, isInstalled: true, installedSkillId: data.skillId, isEnabled: true }
          : prev
      );

      await reloadSkills();
    } catch (err) {
      console.error("Catalog install error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to install skill");
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(catalogSkillId);
        return next;
      });
    }
  }, [characterId]);

  if (isLoading) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold font-mono">{error}</h1>
            <Button asChild><Link href="/">{tc("back")}</Link></Button>
          </div>
        </div>
      </Shell>
    );
  }

  const agentName = character?.displayName || character?.name || "Agent";

  return (
    <Shell>
      <ScrollArea className="h-full">
        <div className="px-6 py-8 space-y-6">
          {/* Header */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-mono font-bold text-terminal-dark">{t("title")}</h1>
              <p className="mt-1 text-sm text-terminal-muted">{t("pageDescription", { name: agentName })}</p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => setShowImport(!showImport)}
                className="gap-2 font-mono"
              >
                <Upload className="h-4 w-4" />
                {showImport ? t("hideImport") : t("importPackage")}
              </Button>
              <Button asChild className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono">
                <Link href={`/agents/${characterId}/skills/new`}>
                  <Plus className="h-4 w-4" />{tc("create")}
                </Link>
              </Button>
            </div>
          </header>

          {/* Import dropzone */}
          {showImport && character && (
            <SkillImportDropzone
              characterId={character.id}
              onImportSuccess={(skillId) => {
                toast.success(t("importSuccess"), {
                  description: t("importSuccessDesc", { skillId }),
                });
                setShowImport(false);
                reloadSkills();
              }}
              onImportError={(importError) => {
                toast.error(t("importFailed"), { description: importError });
              }}
            />
          )}

          {/* Search */}
          <SkillSearch value={search} onChange={setSearch} className="max-w-full" />

          {/* Your Skills section — always visible */}
          <SkillSection title="Your Skills" count={filteredCustomSkills.length}>
            {filteredCustomSkills.length > 0 ? (
              filteredCustomSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={{
                    id: skill.id,
                    displayName: skill.name,
                    shortDescription: skill.description || "",
                    icon: skill.icon,
                    category: skill.category || "general",
                  }}
                  variant="installed"
                  isEnabled={skill.status === "active"}
                  isBusy={togglingIds.has(skill.id)}
                  onToggle={(enabled) => handleToggleSkill(skill.id, enabled)}
                  onDelete={() => setSkillToDelete(skill.id)}
                  onClick={() => router.push(`/agents/${characterId}/skills/${skill.id}`)}
                />
              ))
            ) : (
              <div className="col-span-full rounded-lg border border-dashed border-terminal-border bg-terminal-cream/50 p-6 text-center">
                <p className="font-mono text-sm text-terminal-muted">
                  {search ? "No custom skills match your search." : "No custom skills yet."}
                </p>
                {!search && (
                  <p className="mt-1.5 text-xs text-terminal-muted">
                    Create your own or install from the catalog below.
                  </p>
                )}
              </div>
            )}
          </SkillSection>

          {/* Catalog loading */}
          {catalogLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-terminal-green" />
            </div>
          )}

          {/* Catalog sections grouped by category */}
          {grouped.map(({ category, label, skills: catSkills }) => (
            <SkillSection key={category} title={label} count={catSkills.length}>
              {catSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  variant={skill.isInstalled ? "installed" : "catalog"}
                  isEnabled={skill.isEnabled ?? false}
                  isBusy={
                    installingIds.has(skill.id) ||
                    (skill.installedSkillId ? togglingIds.has(skill.installedSkillId) : false)
                  }
                  onInstall={skill.isInstalled ? undefined : () => handleInstallCatalogSkill(skill.id)}
                  onToggle={
                    skill.isInstalled && skill.installedSkillId
                      ? (enabled) => handleToggleSkill(skill.installedSkillId!, enabled, skill.id)
                      : undefined
                  }
                  onDelete={
                    skill.isInstalled && skill.installedSkillId
                      ? () => handleUninstallCatalogSkill(skill.id, skill.installedSkillId!)
                      : undefined
                  }
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
            characterId={characterId}
            onInstall={handleInstallCatalogSkill}
            onToggle={async (catalogId, installedId, enabled) => {
              await handleToggleSkill(installedId, enabled, catalogId);
            }}
            onUninstall={handleUninstallCatalogSkill}
          />
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!skillToDelete} onOpenChange={(open) => !open && setSkillToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteSkill();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
