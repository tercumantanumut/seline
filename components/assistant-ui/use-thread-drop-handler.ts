import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { resilientPost } from "@/lib/utils/resilient-fetch";
import type { CustomComfyUIInput, CustomComfyUIOutput } from "@/lib/comfyui/custom/types";
import type {
  DroppedImportFile,
  ComfyWorkflowImportPreview,
  ComfyWorkflowImportResult,
} from "./thread-drop-utils";
import {
  collectDroppedImportFiles,
  isDirectPluginFile,
  isPluginStructureFile,
  isComfyWorkflowJsonFile,
  getDisplayFileName,
  buildWorkflowNameSuggestion,
  countWorkflowNodesInChat,
  mapByRelativePath,
} from "./thread-drop-utils";

interface UseThreadDropHandlerOptions {
  characterId?: string;
  characterName?: string;
  sessionId?: string;
  isDeepResearchMode: boolean;
  threadRuntime: { composer: { addAttachment: (file: File) => Promise<void> } };
  router: { push: (path: string) => void };
}

export function useThreadDropHandler({
  characterId,
  characterName,
  sessionId,
  isDeepResearchMode,
  threadRuntime,
  router,
}: UseThreadDropHandlerOptions) {
  const t = useTranslations("assistantUi");

  // Drag and drop state for full-page drop zone
  const [isDragging, setIsDragging] = useState(false);
  const [isImportingSkill, setIsImportingSkill] = useState(false);
  const [skillImportPhase, setSkillImportPhase] = useState<"idle" | "uploading" | "parsing" | "importing" | "success" | "error">("idle");
  const [skillImportProgress, setSkillImportProgress] = useState(0);
  const [skillImportName, setSkillImportName] = useState<string | null>(null);
  const [skillImportError, setSkillImportError] = useState<string | null>(null);
  const [importResultDetail, setImportResultDetail] = useState<string | null>(null);
  const [comfyImportDialogOpen, setComfyImportDialogOpen] = useState(false);
  const [comfyImportFiles, setComfyImportFiles] = useState<DroppedImportFile[]>([]);
  const [comfyImportPreviews, setComfyImportPreviews] = useState<ComfyWorkflowImportPreview[]>([]);
  const [comfyImportSelected, setComfyImportSelected] = useState<Record<string, boolean>>({});
  const [comfyImportNameOverrides, setComfyImportNameOverrides] = useState<Record<string, string>>({});
  const [comfyImportExpanded, setComfyImportExpanded] = useState<Record<string, boolean>>({});
  const [comfyImportLoading, setComfyImportLoading] = useState(false);
  const [comfyImportSubmitting, setComfyImportSubmitting] = useState(false);
  const dragCounter = useRef(0);
  const isMountedRef = useRef(true);
  const importAbortControllerRef = useRef<AbortController | null>(null);
  const importRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comfyImportAbortControllerRef = useRef<AbortController | null>(null);
  const comfyImportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSkillImportReset = useCallback((delayMs: number, clearError: boolean) => {
    if (importResetTimeoutRef.current) {
      clearTimeout(importResetTimeoutRef.current);
    }
    importResetTimeoutRef.current = setTimeout(() => {
      importResetTimeoutRef.current = null;
      if (!isMountedRef.current) {
        return;
      }
      setIsImportingSkill(false);
      setSkillImportPhase("idle");
      setSkillImportProgress(0);
      setSkillImportName(null);
      if (clearError) {
        setSkillImportError(null);
      }
      setImportResultDetail(null);
    }, delayMs);
  }, []);

  const resetComfyImportState = useCallback(() => {
    comfyImportAbortControllerRef.current?.abort();
    comfyImportAbortControllerRef.current = null;
    if (comfyImportTimeoutRef.current) {
      clearTimeout(comfyImportTimeoutRef.current);
      comfyImportTimeoutRef.current = null;
    }

    setComfyImportDialogOpen(false);
    setComfyImportFiles([]);
    setComfyImportPreviews([]);
    setComfyImportSelected({});
    setComfyImportNameOverrides({});
    setComfyImportExpanded({});
    setComfyImportLoading(false);
    setComfyImportSubmitting(false);
  }, []);

  const loadComfyWorkflowPreviews = useCallback(
    async (workflowItems: DroppedImportFile[]) => {
      if (!characterId || characterId === "default") {
        toast.error(t("skillImportOverlay.selectAgentFirst"));
        return;
      }

      if (workflowItems.length === 0) {
        toast.error(t("comfyuiImport.noWorkflowsFound"));
        return;
      }

      if (workflowItems.length > 25) {
        toast.error(t("comfyuiImport.tooManyFiles", { max: 25 }));
        return;
      }

      const oversized = workflowItems.find(({ file }) => file.size > 5 * 1024 * 1024);
      if (oversized) {
        toast.error(t("comfyuiImport.fileTooLarge", { name: oversized.relativePath }));
        return;
      }

      comfyImportAbortControllerRef.current?.abort();
      comfyImportAbortControllerRef.current = null;
      if (comfyImportTimeoutRef.current) {
        clearTimeout(comfyImportTimeoutRef.current);
        comfyImportTimeoutRef.current = null;
      }

      setComfyImportLoading(true);
      setComfyImportDialogOpen(true);
      setComfyImportFiles(workflowItems);
      setComfyImportPreviews([]);
      setComfyImportSelected({});
      setComfyImportNameOverrides({});
      setComfyImportExpanded({});

      const previews: ComfyWorkflowImportPreview[] = [];

      for (let index = 0; index < workflowItems.length; index += 1) {
        const item = workflowItems[index];
        try {
          const text = await item.file.text();
          const workflowJson = JSON.parse(text) as Record<string, unknown>;

          const { data, error } = await resilientPost<{
            format: "ui" | "api";
            inputs?: CustomComfyUIInput[];
            outputs?: CustomComfyUIOutput[];
            nodeCount?: number;
            summary?: string;
            importantInputIds?: string[];
            error?: string;
          }>("/api/comfyui/custom-workflows/analyze", {
            workflow: workflowJson,
            fileName: getDisplayFileName(item.relativePath),
          }, {
            timeout: 45_000,
            retries: 0,
          });

          if (error || !data) {
            previews.push({
              fileName: item.relativePath,
              suggestedName: buildWorkflowNameSuggestion(item.relativePath, index + 1),
              nodeCount: countWorkflowNodesInChat(workflowJson),
              inputCount: 0,
              outputCount: 0,
              inputs: [],
              outputs: [],
              summary: t("comfyuiImport.analysisFailed"),
              importantInputIds: [],
              error: data?.error || error || t("comfyuiImport.analysisFailed"),
            });
            continue;
          }

          previews.push({
            fileName: item.relativePath,
            suggestedName: buildWorkflowNameSuggestion(item.relativePath, index + 1),
            nodeCount: data.nodeCount ?? countWorkflowNodesInChat(workflowJson),
            inputCount: data.inputs?.length || 0,
            outputCount: data.outputs?.length || 0,
            inputs: data.inputs || [],
            outputs: data.outputs || [],
            summary: data.summary || t("comfyuiImport.summaryFallback"),
            importantInputIds: data.importantInputIds || [],
          });
        } catch (error) {
          previews.push({
            fileName: item.relativePath,
            suggestedName: buildWorkflowNameSuggestion(item.relativePath, index + 1),
            nodeCount: 0,
            inputCount: 0,
            outputCount: 0,
            inputs: [],
            outputs: [],
            summary: t("comfyuiImport.invalidJson"),
            importantInputIds: [],
            error: error instanceof Error ? error.message : t("comfyuiImport.invalidJson"),
          });
        }
      }

      if (!isMountedRef.current) {
        return;
      }

      const initialSelection: Record<string, boolean> = {};
      const nameOverrides: Record<string, string> = {};
      previews.forEach((preview) => {
        const selectable = !preview.error;
        initialSelection[preview.fileName] = selectable;
        nameOverrides[preview.fileName] = preview.suggestedName;
      });

      setComfyImportPreviews(previews);
      setComfyImportSelected(initialSelection);
      setComfyImportNameOverrides(nameOverrides);
      setComfyImportLoading(false);

      const validCount = previews.filter((preview) => !preview.error).length;
      if (validCount === 0) {
        toast.error(t("comfyuiImport.noValidWorkflows"));
      }
    },
    [characterId, t]
  );

  const submitComfyWorkflowImport = useCallback(async () => {
    if (!characterId || characterId === "default") {
      toast.error(t("skillImportOverlay.selectAgentFirst"));
      return;
    }

    const selectedPreviews = comfyImportPreviews.filter((preview) => comfyImportSelected[preview.fileName]);
    if (selectedPreviews.length === 0) {
      toast.error(t("comfyuiImport.selectAtLeastOne"));
      return;
    }

    const selectedFileNames = new Set(selectedPreviews.map((preview) => preview.fileName));
    const fileLookup = mapByRelativePath(comfyImportFiles);

    const formData = new FormData();
    for (const fileName of selectedFileNames) {
      const item = fileLookup.get(fileName);
      if (!item) {
        continue;
      }
      formData.append("files", item.file, item.relativePath);
      const overrideName = comfyImportNameOverrides[fileName]?.trim();
      if (overrideName) {
        formData.append(`name:${fileName}`, overrideName);
      }
    }

    formData.append("characterId", characterId);
    if (sessionId) {
      formData.append("sessionId", sessionId);
    }

    setComfyImportSubmitting(true);

    const controller = new AbortController();
    comfyImportAbortControllerRef.current = controller;
    comfyImportTimeoutRef.current = setTimeout(() => {
      controller.abort();
    }, 120_000);

    try {
      const response = await fetch("/api/comfyui/custom-workflows/import", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (comfyImportTimeoutRef.current) {
        clearTimeout(comfyImportTimeoutRef.current);
        comfyImportTimeoutRef.current = null;
      }
      if (comfyImportAbortControllerRef.current === controller) {
        comfyImportAbortControllerRef.current = null;
      }

      const result = (await response.json().catch(() => null)) as ComfyWorkflowImportResult | { error?: string; failedFiles?: Array<{ fileName: string; error: string }> } | null;
      if (!response.ok || !result || !("success" in result)) {
        throw new Error(result && "error" in result ? result.error || t("comfyuiImport.importFailed") : t("comfyuiImport.importFailed"));
      }

      const successParts: string[] = [
        t("comfyuiImport.workflowCount", { count: result.createdWorkflows.length }),
      ];
      if (result.enabledToolCount > 0) {
        successParts.push(t("comfyuiImport.toolAttachedCount", { count: result.enabledToolCount }));
      }
      if (result.discoveredToolCount > 0) {
        successParts.push(t("comfyuiImport.discoveredCount", { count: result.discoveredToolCount }));
      }

      toast.success(t("comfyuiImport.importSuccess"), {
        description: successParts.join(" · "),
      });

      if (result.failedFiles.length > 0) {
        const failureText = result.failedFiles
          .slice(0, 3)
          .map((entry) => `${entry.fileName}: ${entry.error}`)
          .join("\n");
        toast.warning(t("comfyuiImport.partialFailure"), {
          description: failureText,
        });
      }

      resetComfyImportState();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("comfyuiImport.importFailed");
      toast.error(t("comfyuiImport.importFailed"), {
        description: errorMessage,
      });
      setComfyImportSubmitting(false);
    }
  }, [
    characterId,
    comfyImportFiles,
    comfyImportNameOverrides,
    comfyImportPreviews,
    comfyImportSelected,
    resetComfyImportState,
    sessionId,
    t,
  ]);

  useEffect(() => {
    // Keep mount flag accurate in React Strict Mode dev remount cycles.
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      importAbortControllerRef.current?.abort();
      importAbortControllerRef.current = null;
      comfyImportAbortControllerRef.current?.abort();
      comfyImportAbortControllerRef.current = null;
      if (importRequestTimeoutRef.current) {
        clearTimeout(importRequestTimeoutRef.current);
        importRequestTimeoutRef.current = null;
      }
      if (importResetTimeoutRef.current) {
        clearTimeout(importResetTimeoutRef.current);
        importResetTimeoutRef.current = null;
      }
      if (comfyImportTimeoutRef.current) {
        clearTimeout(comfyImportTimeoutRef.current);
        comfyImportTimeoutRef.current = null;
      }
    };
  }, []);

  // ── Drag-and-drop handlers (full-page drop zone) ──────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only count enters from outside the component tree — ignore
    // bubbled events from child elements (especially the overlay itself)
    if (e.dataTransfer.types.includes("Files")) {
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        setIsDragging(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Force-reset drag state to prevent stuck overlay
      dragCounter.current = 0;
      setIsDragging(false);

      // Block drops in deep research mode
      if (isDeepResearchMode) {
        toast.error(t("composer.attachmentsDisabledResearch"));
        return;
      }

      const droppedItems = await collectDroppedImportFiles(e);

      // ── Skill/plugin files (.zip / .md / .mds / folder structures) ───────
      const pluginItems = droppedItems.filter(
        ({ relativePath }) => isDirectPluginFile(relativePath) || isPluginStructureFile(relativePath)
      );

      if (pluginItems.length > 0) {
        if (!characterId || characterId === "default") {
          toast.error(t("skillImportOverlay.selectAgentFirst"));
          return;
        }

        const confirmInstall = window.confirm(
          t("skillImportOverlay.confirmInstall", { name: characterName ?? "" })
        );
        if (!confirmInstall) {
          return;
        }

        const MAX_SKILL_SIZE = 50 * 1024 * 1024;
        const oversized = pluginItems.find(({ file }) => file.size > MAX_SKILL_SIZE);
        if (oversized) {
          toast.error(t("audio.skillFileTooLarge"), {
            description: `File size: ${Math.round(oversized.file.size / 1024 / 1024)}MB (${oversized.relativePath})`,
          });
          return;
        }

        importAbortControllerRef.current?.abort();
        importAbortControllerRef.current = null;
        if (importRequestTimeoutRef.current) {
          clearTimeout(importRequestTimeoutRef.current);
          importRequestTimeoutRef.current = null;
        }
        if (importResetTimeoutRef.current) {
          clearTimeout(importResetTimeoutRef.current);
          importResetTimeoutRef.current = null;
        }

        setIsImportingSkill(true);
        setSkillImportPhase("uploading");
        setSkillImportProgress(10);
        setSkillImportName(pluginItems[0].relativePath);
        setSkillImportError(null);
        setImportResultDetail(null);

        await new Promise((r) => setTimeout(r, 0));

        let importController: AbortController | null = null;
        let importTimedOut = false;
        try {
          const formData = new FormData();
          formData.append("characterId", characterId);

          if (pluginItems.length === 1 && isDirectPluginFile(pluginItems[0].relativePath)) {
            const single = pluginItems[0];
            formData.append("file", single.file, single.relativePath);
          } else {
            for (const item of pluginItems) {
              formData.append("files", item.file, item.relativePath);
            }
          }

          setSkillImportPhase("parsing");
          setSkillImportProgress(30);

          importController = new AbortController();
          importAbortControllerRef.current = importController;
          importRequestTimeoutRef.current = setTimeout(() => {
            importTimedOut = true;
            importController?.abort();
          }, 120_000);

          let pluginResponse: Response;
          try {
            pluginResponse = await fetch("/api/plugins/import", {
              method: "POST",
              body: formData,
              signal: importController.signal,
            });
          } finally {
            if (importRequestTimeoutRef.current) {
              clearTimeout(importRequestTimeoutRef.current);
              importRequestTimeoutRef.current = null;
            }
            if (importAbortControllerRef.current === importController) {
              importAbortControllerRef.current = null;
            }
          }

          if (!isMountedRef.current || importController.signal.aborted) {
            return;
          }

          setSkillImportPhase("importing");
          setSkillImportProgress(70);

          if (!pluginResponse.ok) {
            const pluginError = await pluginResponse.json().catch(() => null);
            throw new Error(pluginError?.error || "Import failed");
          }

          const pluginResult = await pluginResponse.json();
          if (!isMountedRef.current || importController.signal.aborted) {
            return;
          }

          const parts: string[] = [];
          if (pluginResult.components?.skills?.length > 0) {
            parts.push(t("skillImportOverlay.skillCount", { count: pluginResult.components.skills.length }));
          }
          if (pluginResult.components?.agents?.length > 0) {
            parts.push(t("skillImportOverlay.agentCount", { count: pluginResult.components.agents.length }));
          }
          if (pluginResult.components?.hasHooks) {
            parts.push(t("skillImportOverlay.hooksEnabled"));
          }
          if (pluginResult.components?.mcpServers?.length > 0) {
            parts.push(t("skillImportOverlay.mcpServerCount", { count: pluginResult.components.mcpServers.length }));
          }
          if (Array.isArray(pluginResult.createdAgents) && pluginResult.createdAgents.length > 0) {
            parts.push(t("skillImportOverlay.agentProfilesCreated", { count: pluginResult.createdAgents.length }));
          }
          if (pluginResult.workflow) {
            parts.push(t("skillImportOverlay.workflowCreated", { count: (pluginResult.workflow.subAgentIds?.length || 0) + 1 }));
          }

          setSkillImportPhase("success");
          setSkillImportProgress(100);
          setSkillImportName(pluginResult.plugin?.name || pluginItems[0].relativePath);
          setImportResultDetail(parts.length > 0 ? parts.join(", ") : null);

          const isLegacy = pluginResult.isLegacySkillFormat;
          const summary = parts.length > 0 ? ` (${parts.join(", ")})` : "";
          toast.success(isLegacy ? t("skillImportOverlay.skillImported") : t("skillImportOverlay.pluginInstalled"), {
            description: isLegacy
              ? t("skillImportOverlay.readyToUse", { name: pluginResult.plugin?.name ?? "" })
              : `${pluginResult.plugin?.name}${summary}`,
            action: isLegacy
              ? {
                  label: t("skillImportOverlay.viewSkills"),
                  onClick: () => router.push(`/agents/${characterId}/skills`),
                }
              : pluginResult.workflow
                ? {
                    label: t("skillImportOverlay.viewWorkflow"),
                    onClick: () => router.push("/"),
                  }
                : {
                    label: t("skillImportOverlay.viewPlugins"),
                    onClick: () => router.push("/settings?section=plugins"),
                  },
          });

          if (pluginResult.warnings?.length > 0) {
            for (const warning of pluginResult.warnings.slice(0, 3)) {
              toast.warning(warning);
            }
          }

          scheduleSkillImportReset(3000, false);
        } catch (error) {
          const isAbortError =
            (error instanceof DOMException && error.name === "AbortError") ||
            (error instanceof Error && error.name === "AbortError");
          const wasAborted = Boolean(importController?.signal.aborted) || isAbortError;
          if (wasAborted) {
            if (!isMountedRef.current) {
              return;
            }
            if (importTimedOut) {
              const timeoutMessage = t("skillImportOverlay.importTimedOutDesc");
              setSkillImportPhase("error");
              setSkillImportError(timeoutMessage);
              toast.error(t("skillImportOverlay.importTimedOut"), {
                description: timeoutMessage,
              });
              scheduleSkillImportReset(4000, true);
            }
            return;
          }
          if (!isMountedRef.current) {
            return;
          }
          console.error("[Thread] Skill/plugin import failed:", error);
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          setSkillImportPhase("error");
          setSkillImportError(errorMsg);
          toast.error(t("skillImportOverlay.importFailed"), {
            description: errorMsg,
          });

          scheduleSkillImportReset(4000, true);
        }
        return;
      }

      const comfyWorkflowItems = droppedItems.filter(({ relativePath, file }) =>
        isComfyWorkflowJsonFile(relativePath, file)
      );

      if (comfyWorkflowItems.length > 0) {
        await loadComfyWorkflowPreviews(comfyWorkflowItems);
        return;
      }

      const files = droppedItems.map(({ file }) => file);

      // ── Image attachments ─────────────────────────────────────────
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      if (imageFiles.length === 0) {
        toast.error(t("composer.onlyImagesSupported"));
        return;
      }

      const MAX_SIZE = 10 * 1024 * 1024;
      const oversizedFiles = imageFiles.filter((f) => f.size > MAX_SIZE);

      if (oversizedFiles.length > 0) {
        toast.error(
          t("composer.someFilesTooLarge", {
            count: oversizedFiles.length,
            max: 10,
          })
        );
        return;
      }

      let successCount = 0;
      for (const file of imageFiles) {
        try {
          await threadRuntime.composer.addAttachment(file);
          successCount++;
        } catch (error) {
          console.error("[Thread] Failed to attach dropped file:", file.name, error);
        }
      }

      if (successCount > 0) {
        toast.success(t("composer.filesDropped", { count: successCount }));
      } else {
        toast.error(t("composer.dropError"));
      }
    },
    [
      threadRuntime,
      t,
      isDeepResearchMode,
      characterId,
      characterName,
      router,
      scheduleSkillImportReset,
      loadComfyWorkflowPreviews,
    ]
  );

  const validComfyPreviewCount = comfyImportPreviews.filter(
    (preview) => !preview.error
  ).length;
  const selectedComfyPreviewCount = Object.values(comfyImportSelected).filter(Boolean).length;

  return {
    // Drag state
    isDragging,
    // Skill import overlay state
    isImportingSkill,
    skillImportPhase,
    skillImportProgress,
    skillImportName,
    skillImportError,
    importResultDetail,
    // ComfyUI import dialog state
    comfyImportDialogOpen,
    setComfyImportDialogOpen,
    comfyImportPreviews,
    comfyImportLoading,
    comfyImportSelected,
    setComfyImportSelected,
    comfyImportNameOverrides,
    setComfyImportNameOverrides,
    comfyImportExpanded,
    setComfyImportExpanded,
    comfyImportSubmitting,
    selectedComfyPreviewCount,
    validComfyPreviewCount,
    // Handlers
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    resetComfyImportState,
    submitComfyWorkflowImport,
  };
}
