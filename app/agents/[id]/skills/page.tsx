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
import { SkillCatalogPage } from "@/components/skills/skill-catalog-page";
import { SkillSection } from "@/components/skills/skill-section";
import { toast } from "sonner";
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

export default function AgentSkillsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: characterId } = use(params);
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const router = useRouter();
  const catalogT = useTranslations("skills.catalog");

  const [character, setCharacter] = useState<CharacterBasic | null>(null);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());


  // Load character and agent skills on mount
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        const [characterRes, skillsRes] = await Promise.all([
          fetch(`/api/characters/${characterId}`),
          fetch(`/api/skills?characterId=${encodeURIComponent(characterId)}`),
        ]);

        if (!mounted) return;

        if (!characterRes.ok) {
          setError(characterRes.status === 404 ? tc("notFound") : tc("somethingWentWrong"));
          return;
        }

        const characterData = await characterRes.json();
        const skillsData = skillsRes.ok ? await skillsRes.json() : { skills: [] };

        setCharacter(characterData.character || null);
        setSkills(Array.isArray(skillsData.skills) ? skillsData.skills : []);
      } catch (err) {
        console.error("Failed to load skills page:", err);
        if (mounted) setError(tc("somethingWentWrong"));
      } finally {
        if (mounted) {
          setIsLoading(false);
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
    } catch (err) {
      console.error("Toggle error:", err);
      toast.error(catalogT("toggleFailed"));
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

          {/* Your Skills section — always visible */}
          <SkillSection title={t("mySkills")} count={customSkills.length}>
            {customSkills.length > 0 ? (
              customSkills.map((skill) => (
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
                  {catalogT("emptyCustomSkills")}
                </p>
                <p className="mt-1.5 text-xs text-terminal-muted">
                  {catalogT("emptyCustomSkillsHint")}
                </p>
              </div>
            )}
          </SkillSection>

          <SkillCatalogPage
            embedded
            initialCharacterId={characterId}
            hideCharacterSelector
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
