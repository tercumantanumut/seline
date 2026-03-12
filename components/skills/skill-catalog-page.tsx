"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { SkillCard } from "@/components/skills/skill-card";
import { SkillCollectionCard } from "@/components/skills/skill-collection-card";
import { SkillSearch } from "@/components/skills/skill-search";
import { SkillSection } from "@/components/skills/skill-section";
import { SkillDetailDialog } from "@/components/skills/skill-detail-dialog";
import { CatalogSelectionDialog } from "@/components/skills/catalog-selection-dialog";
import {
  buildCatalogCollections,
  groupCatalogSkills,
} from "@/components/skills/catalog-display";
import type {
  CatalogInstallManyResponse,
  CatalogSkillCollection,
  CatalogSkillWithStatus,
  CatalogUninstallManyResponse,
} from "@/lib/skills/catalog/types";

type CharacterOption = { id: string; name: string; displayName?: string | null };

type SelectionMode = "install" | "uninstall";
type CatalogPageMode = "single-agent" | "multi-agent";

interface SkillCatalogPageProps {
  mode?: CatalogPageMode;
  characters?: CharacterOption[];
  embedded?: boolean;
  initialCharacterId?: string | null;
  hideCharacterSelector?: boolean;
  autoRefreshKeys?: Array<string | number | null | undefined>;
}

function normalizeRefreshKeys(keys?: Array<string | number | null | undefined>): string {
  if (!keys || keys.length === 0) {
    return "";
  }

  return keys
    .map((value) => String(value ?? ""))
    .filter(Boolean)
    .join("::");
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function buildInstalledMap(payload: CatalogInstallManyResponse) {
  const installedMap = new Map<string, string>();

  for (const item of payload.installed) {
    installedMap.set(item.catalogSkillId, item.skillId);
  }

  for (const item of payload.skipped) {
    installedMap.set(item.catalogSkillId, item.existingSkillId);
  }

  return installedMap;
}

export function SkillCatalogPage({
  mode = "single-agent",
  characters: providedCharacters,
  embedded = false,
  initialCharacterId = null,
  hideCharacterSelector = false,
}: SkillCatalogPageProps) {
  const t = useTranslations("skills.catalog");
  const [catalog, setCatalog] = useState<CatalogSkillWithStatus[]>([]);
  const [collections, setCollections] = useState<CatalogSkillCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<CatalogSkillWithStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [characters, setCharacters] = useState<CharacterOption[]>(providedCharacters || []);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(initialCharacterId);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("install");
  const [selectionSkills, setSelectionSkills] = useState<CatalogSkillWithStatus[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [selectionBusy, setSelectionBusy] = useState(false);

  const isMultiAgent = mode === "multi-agent";

  useEffect(() => {
    if (providedCharacters) {
      setCharacters(providedCharacters);
    }
  }, [providedCharacters]);

  useEffect(() => {
    if (isMultiAgent) {
      setActiveCharacterId(null);
      return;
    }

    if (initialCharacterId) {
      setActiveCharacterId(initialCharacterId);
      return;
    }

    if (!activeCharacterId && providedCharacters && providedCharacters.length > 0) {
      setActiveCharacterId(providedCharacters[0].id);
    }
  }, [activeCharacterId, initialCharacterId, isMultiAgent, providedCharacters]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const catalogUrl = !isMultiAgent && activeCharacterId
        ? `/api/skills/catalog?characterId=${encodeURIComponent(activeCharacterId)}`
        : "/api/skills/catalog";

      const requests: Promise<Response>[] = [fetch(catalogUrl)];
      if (!providedCharacters) {
        requests.push(fetch("/api/characters"));
      }

      const [catalogRes, charsRes] = await Promise.all(requests);
      if (!catalogRes.ok) {
        throw new Error("Failed to load catalog");
      }

      const catalogData = await catalogRes.json();
      const allCatalog: CatalogSkillWithStatus[] = [
        ...(Array.isArray(catalogData.systemSkills) ? catalogData.systemSkills : []),
        ...(Array.isArray(catalogData.catalog) ? catalogData.catalog : []),
      ];

      setCatalog(allCatalog);
      setCollections(Array.isArray(catalogData.collections) ? catalogData.collections : []);

      if (!providedCharacters && charsRes) {
        const charsData = charsRes.ok ? await charsRes.json() : { characters: [] };
        const charList: CharacterOption[] = Array.isArray(charsData.characters) ? charsData.characters : [];
        setCharacters(charList);

        if (!isMultiAgent && !activeCharacterId && !initialCharacterId && charList.length > 0) {
          setActiveCharacterId(charList[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [activeCharacterId, initialCharacterId, isMultiAgent, providedCharacters]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const filtered = useMemo(() => {
    if (!search.trim()) return catalog;
    const query = search.toLowerCase();

    return catalog.filter(
      (skill) =>
        skill.displayName.toLowerCase().includes(query) ||
        skill.shortDescription.toLowerCase().includes(query) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        skill.category.toLowerCase().includes(query)
    );
  }, [catalog, search]);

  const grouped = useMemo(() => groupCatalogSkills(filtered), [filtered]);
  const allCollectionSummaries = useMemo(
    () => buildCatalogCollections(catalog, collections),
    [catalog, collections]
  );
  const collectionSummaries = useMemo(() => {
    if (!search.trim()) return allCollectionSummaries;

    const visibleCollectionIds = new Set(
      filtered.map((skill) => skill.collectionId).filter((id): id is string => Boolean(id))
    );

    return allCollectionSummaries.filter((collection) => visibleCollectionIds.has(collection.id));
  }, [allCollectionSummaries, filtered, search]);

  const openSelectionDialog = useCallback((params: {
    mode: SelectionMode;
    skills: CatalogSkillWithStatus[];
    defaultSkillIds: string[];
  }) => {
    setSelectionMode(params.mode);
    setSelectionSkills(params.skills);
    setSelectedSkillIds(new Set(params.defaultSkillIds));
    setSelectedAgentIds(new Set());
    setSelectionOpen(true);
  }, []);

  const markBusy = useCallback((...ids: Array<string | null | undefined>) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (id) next.add(id);
      }
      return next;
    });
  }, []);

  const clearBusy = useCallback((...ids: Array<string | null | undefined>) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (id) next.delete(id);
      }
      return next;
    });
  }, []);

  const handleInstall = useCallback(async (catalogSkillId: string) => {
    if (!activeCharacterId) {
      toast.error(t("selectAgentFirst"));
      return;
    }

    markBusy(catalogSkillId);

    try {
      const res = await fetch("/api/skills/catalog/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogSkillId, characterId: activeCharacterId }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.info(t("alreadyInstalledOnAgent"));
        setCatalog((prev) =>
          prev.map((skill) =>
            skill.id === catalogSkillId
              ? {
                  ...skill,
                  isInstalled: true,
                  installedSkillId: data.existingSkillId ?? skill.installedSkillId,
                  isEnabled: true,
                }
              : skill
          )
        );
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || t("installFailed"));
      }

      toast.success(t("installSuccess", { name: data.name || t("skillFallback") }));
      setCatalog((prev) =>
        prev.map((skill) =>
          skill.id === catalogSkillId
            ? { ...skill, isInstalled: true, installedSkillId: data.skillId, isEnabled: true }
            : skill
        )
      );
      setSelectedSkill((prev) =>
        prev?.id === catalogSkillId
          ? { ...prev, isInstalled: true, installedSkillId: data.skillId, isEnabled: true }
          : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("installFailed"));
    } finally {
      clearBusy(catalogSkillId);
    }
  }, [activeCharacterId, clearBusy, markBusy, t]);

  const handleToggleInstalledSkill = useCallback(async (
    catalogSkillId: string,
    installedSkillId: string,
    enabled: boolean
  ) => {
    markBusy(catalogSkillId, installedSkillId);

    try {
      const res = await fetch(`/api/skills/${installedSkillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: enabled ? "active" : "archived" }),
      });

      if (!res.ok) {
        throw new Error("Failed to update skill");
      }

      setCatalog((prev) =>
        prev.map((skill) =>
          skill.id === catalogSkillId ? { ...skill, isEnabled: enabled } : skill
        )
      );
      setSelectedSkill((prev) =>
        prev?.id === catalogSkillId ? { ...prev, isEnabled: enabled } : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toggleFailed"));
    } finally {
      clearBusy(catalogSkillId, installedSkillId);
    }
  }, [clearBusy, markBusy, t]);

  const handleUninstallInstalledSkill = useCallback(async (
    catalogSkillId: string,
    installedSkillId: string
  ) => {
    markBusy(catalogSkillId, installedSkillId);

    try {
      const res = await fetch(`/api/skills/${installedSkillId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to uninstall skill");
      }

      setCatalog((prev) =>
        prev.map((skill) =>
          skill.id === catalogSkillId
            ? { ...skill, isInstalled: false, installedSkillId: null, isEnabled: null }
            : skill
        )
      );
      setSelectedSkill((prev) =>
        prev?.id === catalogSkillId
          ? { ...prev, isInstalled: false, installedSkillId: null, isEnabled: null }
          : prev
      );
      toast.success(t("uninstallSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("uninstallFailed"));
    } finally {
      clearBusy(catalogSkillId, installedSkillId);
    }
  }, [clearBusy, markBusy, t]);

  const openSingleSkillApply = useCallback((skill: CatalogSkillWithStatus) => {
    openSelectionDialog({
      mode: "install",
      skills: [skill],
      defaultSkillIds: [skill.id],
    });
  }, [openSelectionDialog]);

  const openCollectionInstallSelection = useCallback((collectionId: string) => {
    const skills = catalog.filter((skill) => skill.collectionId === collectionId);
    const defaultSkillIds = isMultiAgent
      ? []
      : skills.filter((skill) => !skill.isInstalled).map((skill) => skill.id);

    openSelectionDialog({
      mode: "install",
      skills,
      defaultSkillIds,
    });
  }, [catalog, isMultiAgent, openSelectionDialog]);

  const openCollectionUninstallSelection = useCallback((collectionId: string) => {
    const skills = catalog.filter((skill) => skill.collectionId === collectionId && skill.isInstalled);
    openSelectionDialog({
      mode: "uninstall",
      skills,
      defaultSkillIds: skills.map((skill) => skill.id),
    });
  }, [catalog, openSelectionDialog]);

  const handleApplySelection = useCallback(async () => {
    const catalogSkillIds = Array.from(selectedSkillIds);
    if (catalogSkillIds.length === 0) {
      toast.error(t("selectionRequired"));
      return;
    }

    if (selectionMode === "install" && isMultiAgent && selectedAgentIds.size === 0) {
      toast.error(t("selectAgentsRequired"));
      return;
    }

    if (!isMultiAgent && !activeCharacterId) {
      toast.error(t("selectAgentFirst"));
      return;
    }

    setSelectionBusy(true);

    try {
      if (selectionMode === "install" && isMultiAgent) {
        const agentIds = Array.from(selectedAgentIds);
        const results = await Promise.all(
          agentIds.map(async (characterId) => {
            const res = await fetch("/api/skills/catalog/install", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ characterId, catalogSkillIds }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data.error || t("installFailed"));
            }
            return data as CatalogInstallManyResponse;
          })
        );

        const failed = results.reduce((sum, result) => sum + result.failed.length, 0);
        const applied = results.reduce(
          (sum, result) => sum + result.installed.length + result.skipped.length,
          0
        );

        await loadCatalog();
        setSelectionOpen(false);

        if (failed > 0) {
          toast.error(t("applySelectionPartial", {
            skills: catalogSkillIds.length,
            agents: agentIds.length,
            failed,
          }));
        } else {
          toast.success(t("applySelectionSuccess", {
            skills: applied,
            agents: agentIds.length,
          }));
        }
        return;
      }

      if (selectionMode === "install" && activeCharacterId) {
        const res = await fetch("/api/skills/catalog/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: activeCharacterId, catalogSkillIds }),
        });
        const data = (await res.json().catch(() => ({}))) as CatalogInstallManyResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || t("installFailed"));
        }

        const installedMap = buildInstalledMap(data);
        setCatalog((prev) =>
          prev.map((skill) => {
            const installedSkillId = installedMap.get(skill.id);
            if (!installedSkillId) return skill;
            return {
              ...skill,
              isInstalled: true,
              installedSkillId,
              isEnabled: true,
            };
          })
        );
        setSelectedSkill((prev) => {
          if (!prev) return prev;
          const installedSkillId = installedMap.get(prev.id);
          return installedSkillId
            ? { ...prev, isInstalled: true, installedSkillId, isEnabled: true }
            : prev;
        });

        setSelectionOpen(false);
        if (data.failed.length > 0) {
          toast.error(t("collectionInstallPartial", {
            installed: data.installed.length + data.skipped.length,
            failed: data.failed.length,
          }));
        } else {
          toast.success(t("collectionInstallSuccess", {
            installed: data.installed.length,
            skipped: data.skipped.length,
          }));
        }
        return;
      }

      if (selectionMode === "uninstall" && activeCharacterId) {
        const res = await fetch("/api/skills/catalog/install", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: activeCharacterId, catalogSkillIds }),
        });
        const data = (await res.json().catch(() => ({}))) as CatalogUninstallManyResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || t("uninstallFailed"));
        }

        const removedIds = new Set(data.removed.map((item) => item.catalogSkillId));
        setCatalog((prev) =>
          prev.map((skill) =>
            removedIds.has(skill.id)
              ? { ...skill, isInstalled: false, installedSkillId: null, isEnabled: null }
              : skill
          )
        );
        setSelectedSkill((prev) =>
          prev && removedIds.has(prev.id)
            ? { ...prev, isInstalled: false, installedSkillId: null, isEnabled: null }
            : prev
        );

        setSelectionOpen(false);
        if (data.failed.length > 0) {
          toast.error(t("selectionUninstallPartial", {
            removed: data.removed.length,
            failed: data.failed.length,
          }));
        } else {
          toast.success(t("selectionUninstallSuccess", {
            removed: data.removed.length,
          }));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("installFailed"));
    } finally {
      setSelectionBusy(false);
    }
  }, [
    activeCharacterId,
    isMultiAgent,
    loadCatalog,
    selectedAgentIds,
    selectedSkillIds,
    selectionMode,
    t,
  ]);

  const selectionApplyLabel = selectionMode === "install"
    ? isMultiAgent
      ? t("applyToAgents")
      : t("chooseSkills")
    : t("removeInstalled");

  const selectionTitle = selectionMode === "install"
    ? isMultiAgent
      ? t("selectionInstallTitleMultiAgent")
      : t("selectionInstallTitle")
    : t("selectionUninstallTitle");

  const selectionDescription = selectionMode === "install"
    ? isMultiAgent
      ? t("selectionInstallDescriptionMultiAgent")
      : t("selectionInstallDescription")
    : t("selectionUninstallDescription");

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
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <header>
          <h1 className="text-2xl font-mono font-bold text-terminal-dark">{t("title")}</h1>
          <p className="mt-1 text-sm text-terminal-muted">{t("description")}</p>
        </header>
      ) : null}

      {!isMultiAgent && !hideCharacterSelector ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={activeCharacterId || ""}
            onChange={(e) => setActiveCharacterId(e.target.value || null)}
            className="rounded-lg border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark sm:w-52"
          >
            <option value="">{t("selectAgent")}</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.displayName || character.name}
              </option>
            ))}
          </select>
          <SkillSearch value={search} onChange={setSearch} placeholder={t("search")} className="flex-1" />
        </div>
      ) : (
        <SkillSearch value={search} onChange={setSearch} placeholder={t("search")} className="max-w-full" />
      )}

      {collectionSummaries.length > 0 ? (
        <SkillSection title={t("collectionsTitle")} count={collectionSummaries.length}>
          {collectionSummaries.map((collection) => {
            const collectionSkills = catalog.filter((skill) => skill.collectionId === collection.id);
            const hasInstalledSkills = collectionSkills.some((skill) => skill.isInstalled);
            const hasAvailableSkills = isMultiAgent || collectionSkills.some((skill) => !skill.isInstalled);

            return (
              <SkillCollectionCard
                key={collection.id}
                collection={collection}
                primaryLabel={isMultiAgent ? t("applyToAgents") : t("chooseSkills")}
                secondaryLabel={!isMultiAgent && hasInstalledSkills ? t("removeInstalled") : undefined}
                onPrimaryAction={() => openCollectionInstallSelection(collection.id)}
                onSecondaryAction={
                  !isMultiAgent && hasInstalledSkills
                    ? () => openCollectionUninstallSelection(collection.id)
                    : undefined
                }
                primaryDisabled={!hasAvailableSkills}
                secondaryDisabled={!hasInstalledSkills}
              />
            );
          })}
        </SkillSection>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-terminal-border bg-terminal-cream/50 p-8 text-center">
          <p className="font-mono text-terminal-muted">
            {search ? t("noResults") : t("noSkills")}
          </p>
        </div>
      ) : null}

      {grouped.map(({ category, label, skills }) => (
        <SkillSection key={category} title={label} count={skills.length}>
          {skills.map((skill) => {
            const cardVariant = isMultiAgent ? "catalog" : skill.isInstalled ? "installed" : "catalog";
            const cardBusy = busyIds.has(skill.id) || (skill.installedSkillId ? busyIds.has(skill.installedSkillId) : false);

            return (
              <SkillCard
                key={skill.id}
                skill={skill}
                variant={cardVariant}
                isEnabled={skill.isEnabled ?? false}
                isBusy={cardBusy}
                onInstall={
                  isMultiAgent
                    ? () => openSingleSkillApply(skill)
                    : skill.isInstalled
                      ? undefined
                      : () => handleInstall(skill.id)
                }
                onToggle={
                  !isMultiAgent && skill.isInstalled && skill.installedSkillId
                    ? (enabled) => handleToggleInstalledSkill(skill.id, skill.installedSkillId!, enabled)
                    : undefined
                }
                onDelete={
                  !isMultiAgent && skill.isInstalled && skill.installedSkillId
                    ? () => handleUninstallInstalledSkill(skill.id, skill.installedSkillId!)
                    : undefined
                }
                onClick={() => {
                  setSelectedSkill(skill);
                  setDialogOpen(true);
                }}
              />
            );
          })}
        </SkillSection>
      ))}

      <SkillDetailDialog
        skill={selectedSkill}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        characterId={isMultiAgent ? null : activeCharacterId}
        onInstall={async (catalogSkillId) => {
          const skill = catalog.find((item) => item.id === catalogSkillId);
          if (!skill) return;

          if (isMultiAgent) {
            openSingleSkillApply(skill);
            return;
          }

          await handleInstall(catalogSkillId);
        }}
        installLabel={isMultiAgent ? t("applyToAgents") : undefined}
        installDisabled={isMultiAgent ? characters.length === 0 : !activeCharacterId}
        onToggle={
          !isMultiAgent
            ? async (catalogSkillId, installedSkillId, enabled) => {
                await handleToggleInstalledSkill(catalogSkillId, installedSkillId, enabled);
              }
            : undefined
        }
        onUninstall={
          !isMultiAgent
            ? async (catalogSkillId, installedSkillId) => {
                await handleUninstallInstalledSkill(catalogSkillId, installedSkillId);
              }
            : undefined
        }
      />

      <CatalogSelectionDialog
        open={selectionOpen}
        onOpenChange={setSelectionOpen}
        title={selectionTitle}
        description={selectionDescription}
        skills={selectionSkills}
        selectedSkillIds={selectedSkillIds}
        onToggleSkill={(skillId) => setSelectedSkillIds((prev) => toggleSetValue(prev, skillId))}
        onSelectAllSkills={() => setSelectedSkillIds(new Set(selectionSkills.map((skill) => skill.id)))}
        onClearSkills={() => setSelectedSkillIds(new Set())}
        agents={isMultiAgent ? characters : []}
        selectedAgentIds={isMultiAgent ? selectedAgentIds : undefined}
        onToggleAgent={
          isMultiAgent
            ? (agentId) => setSelectedAgentIds((prev) => toggleSetValue(prev, agentId))
            : undefined
        }
        onSelectAllAgents={
          isMultiAgent
            ? () => setSelectedAgentIds(new Set(characters.map((agent) => agent.id)))
            : undefined
        }
        onClearAgents={isMultiAgent ? () => setSelectedAgentIds(new Set()) : undefined}
        applyLabel={selectionApplyLabel}
        applyDisabled={
          selectionBusy ||
          selectedSkillIds.size === 0 ||
          (selectionMode === "install" && isMultiAgent && selectedAgentIds.size === 0)
        }
        isApplying={selectionBusy}
        onApply={handleApplySelection}
      />
    </div>
  );
}
