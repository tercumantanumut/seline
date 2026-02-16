"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, Plus, Library, ExternalLink, Upload, Trash2, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { SkillImportDropzone } from "@/components/skills/skill-import-dropzone";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type SkillItem = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  runCount: number;
  successCount: number;
  lastRunAt: string | null;
  category: string;
  version: number;
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

  const [character, setCharacter] = useState<CharacterBasic | null>(null);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        const [characterRes, skillsRes] = await Promise.all([
          fetch(`/api/characters/${characterId}`),
          fetch(`/api/skills?characterId=${encodeURIComponent(characterId)}`),
        ]);

        if (!characterRes.ok) {
          setError(characterRes.status === 404 ? tc("notFound") : tc("somethingWentWrong"));
          return;
        }

        const characterData = await characterRes.json();
        const skillsData = skillsRes.ok ? await skillsRes.json() : { skills: [] };

        if (!mounted) return;
        setCharacter(characterData.character || null);
        setSkills(Array.isArray(skillsData.skills) ? skillsData.skills : []);
      } catch (err) {
        console.error("Failed to load skills page:", err);
        if (mounted) setError(tc("somethingWentWrong"));
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [characterId, tc]);

  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/skills/${skillToDelete}`, {
        method: "DELETE",
      });
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
    return <Shell><div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-terminal-green" /></div></Shell>;
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
          <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-mono font-bold text-terminal-dark">{t("title")}</h1>
              <p className="mt-1 text-sm text-terminal-muted">{t("pageDescription", { name: agentName })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="gap-2 font-mono">
                <Link href="/skills/library"><Library className="h-4 w-4" />Library</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowImport(!showImport)}
                className="gap-2 font-mono"
              >
                <Upload className="h-4 w-4" />
                {showImport ? "Hide Import" : "Import Package"}
              </Button>
              <Button asChild className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono">
                <Link href={`/agents/${characterId}/skills/new`}><Plus className="h-4 w-4" />{tc("create")}</Link>
              </Button>
            </div>
          </header>

          {/* Import Section */}
          {showImport && character && (
            <div className="mb-6">
              <SkillImportDropzone
                characterId={character.id}
                onImportSuccess={(skillId) => {
                  toast.success("Skill imported successfully", {
                    description: `Skill ID: ${skillId}`,
                  });
                  setShowImport(false);
                  // Reload skills
                  const loadSkills = async () => {
                    const res = await fetch(`/api/skills?characterId=${encodeURIComponent(characterId)}`);
                    if (res.ok) {
                      const data = await res.json();
                      setSkills(Array.isArray(data.skills) ? data.skills : []);
                    }
                  };
                  loadSkills();
                }}
                onImportError={(error) => {
                  toast.error("Import failed", {
                    description: error,
                  });
                }}
              />
            </div>
          )}

          {skills.length === 0 ? (
            <div className="rounded-lg border border-dashed border-terminal-border bg-terminal-cream/50 p-8 text-center">
              <p className="text-base font-mono text-terminal-dark">{t("emptyTitle")}</p>
              <p className="mt-2 text-sm text-terminal-muted">{t("emptyDescription")}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {skills.map((skill) => (
                <article key={skill.id} className="rounded-lg border border-terminal-border bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-mono text-terminal-dark font-semibold truncate">{skill.name}</h2>
                    <Badge variant="outline" className="font-mono text-xs">{t(`status.${skill.status}`)}</Badge>
                  </div>
                  {skill.description ? <p className="mt-2 text-sm text-terminal-muted">{skill.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-4 text-xs font-mono text-terminal-muted">
                    <span>{t("stats.runs")}: {skill.runCount}</span>
                    <span>{t("stats.success")}: {skill.successCount}</span>
                    <span>{t("stats.lastRun")}: {skill.lastRunAt ? new Date(skill.lastRunAt).toLocaleString() : t("stats.never")}</span>
                    <span>Category: {skill.category || "general"}</span>
                    <span>Version: {skill.version}</span>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setSkillToDelete(skill.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("delete.action")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button asChild variant="outline" size="sm" className="font-mono">
                      <Link href={`/agents/${characterId}/skills/${skill.id}`}>
                        Open <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={!!skillToDelete} onOpenChange={(open) => !open && setSkillToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.description")}
            </AlertDialogDescription>
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
