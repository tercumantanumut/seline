"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_ENABLED_TOOLS } from "@/lib/characters/templates/resolve-tools";
import { resilientPost } from "@/lib/utils/resilient-fetch";

interface CreateAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface Template {
  id: string;
  name: string;
  tagline: string;
}

export function CreateAgentModal({ open, onOpenChange, onCreated }: CreateAgentModalProps) {
  const router = useRouter();
  const t = useTranslations("picker.createModal");

  const [activeTab, setActiveTab] = useState<"quick" | "template">("quick");
  const [inputValue, setInputValue] = useState("");
  const [isQuickCreating, setIsQuickCreating] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [templatesLoadFailed, setTemplatesLoadFailed] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isBusy = isQuickCreating || creatingTemplateId !== null;
  const inputLength = inputValue.trim().length;

  const mapCreateErrorMessage = useCallback(
    (message: string, fallbackKey: "errorCreation" | "errorExpansion") => {
      const lowered = message.toLowerCase();

      if (message === "SESSION_EXPIRED") return t("sessionExpired");
      if (lowered.includes("model") || lowered.includes("provider") || lowered.includes("api key")) {
        return t("providerSetupRequired");
      }
      if (lowered.includes("429") || lowered.includes("rate limit")) return t("rateLimited");
      if (lowered.includes("timeout") || lowered.includes("timed out") || lowered.includes("aborted")) {
        return t("requestTimeout");
      }
      if (lowered.includes("network") || lowered.includes("fetch")) return t("networkError");

      return fallbackKey === "errorExpansion" ? t("errorExpansion") : t("errorCreation");
    },
    [t]
  );

  const loadTemplates = useCallback(async () => {
    setIsTemplatesLoading(true);
    setTemplatesLoadFailed(false);

    try {
      const response = await fetch("/api/characters/templates", { method: "GET" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as { templates?: Template[] };
      if (Array.isArray(data.templates)) {
        setTemplates(data.templates);
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
      setTemplatesLoadFailed(true);
    } finally {
      setIsTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      setTemplatesLoadFailed(false);
      setIsQuickCreating(false);
      setCreatingTemplateId(null);
      return;
    }

    void loadTemplates();
  }, [loadTemplates, open]);

  const handleQuickCreate = async () => {
    if (inputLength < 10 || isBusy) return;

    setIsQuickCreating(true);
    setError(null);

    try {
      const { data: expandData, error: expandErr, status: expandStatus } = await resilientPost<{
        success: boolean;
        agent: { name: string; tagline: string; purpose: string };
      }>("/api/characters/quick-create", { concept: inputValue.trim() }, { retries: 0, timeout: 30000 });

      if (expandStatus === 401 || expandErr === "HTTP 401") {
        throw new Error("SESSION_EXPIRED");
      }

      if (expandErr || !expandData?.agent) {
        throw new Error(`EXPANSION_ERROR:${expandErr || "unknown"}`);
      }

      const { name, tagline, purpose } = expandData.agent;
      const { data: createData, error: createErr, status: createStatus } = await resilientPost<{
        character: { id: string };
      }>(
        "/api/characters",
        {
          character: { name, tagline },
          metadata: { purpose, enabledTools: DEFAULT_ENABLED_TOOLS },
        },
        { retries: 0 }
      );

      if (createStatus === 401 || createErr === "HTTP 401") {
        throw new Error("SESSION_EXPIRED");
      }

      if (createErr || !createData?.character?.id) {
        throw new Error(createErr || "CREATE_FAILED");
      }

      onCreated();
      onOpenChange(false);
      router.push(`/chat/${createData.character.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "CREATE_FAILED";
      const mappedError = message.startsWith("EXPANSION_ERROR:")
        ? mapCreateErrorMessage(message.replace("EXPANSION_ERROR:", ""), "errorExpansion")
        : mapCreateErrorMessage(message, "errorCreation");

      setError(mappedError);
      toast.error(mappedError);
    } finally {
      setIsQuickCreating(false);
    }
  };

  const handleUseTemplate = async (templateId: string) => {
    if (isBusy) return;

    setCreatingTemplateId(templateId);
    setError(null);

    try {
      const { data, error: createErr, status } = await resilientPost<{
        success: boolean;
        characterId: string;
        templateId: string;
      }>(`/api/characters/templates/${templateId}/create`, {}, { retries: 0 });

      if (status === 401 || createErr === "HTTP 401") {
        throw new Error("SESSION_EXPIRED");
      }

      if (createErr || !data?.characterId) {
        throw new Error(createErr || "CREATE_FAILED");
      }

      onCreated();
      onOpenChange(false);
      router.push(`/chat/${data.characterId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "CREATE_FAILED";
      const mappedError = mapCreateErrorMessage(message, "errorCreation");
      setError(mappedError);
      toast.error(mappedError);
    } finally {
      setCreatingTemplateId(null);
    }
  };

  const isQuickCreateDisabled = isBusy || inputLength < 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[calc(100vw-1rem)] sm:max-w-[440px] bg-terminal-cream border-terminal-border font-mono">
        <DialogHeader>
          <DialogTitle className="font-mono text-terminal-dark">{t("title")}</DialogTitle>
        </DialogHeader>

        {error && <p className="px-1 text-xs font-mono text-red-600">{error}</p>}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "quick" | "template")}>
          <TabsList className="w-full rounded-md bg-terminal-dark/10 p-1">
            <TabsTrigger
              value="quick"
              className="flex-1 font-mono text-sm data-[state=active]:bg-terminal-cream data-[state=active]:text-terminal-green data-[state=active]:shadow-sm"
            >
              {t("quickCreateTab")}
            </TabsTrigger>
            <TabsTrigger
              value="template"
              className="flex-1 font-mono text-sm data-[state=active]:bg-terminal-cream data-[state=active]:text-terminal-green data-[state=active]:shadow-sm"
            >
              {t("fromTemplateTab")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="mt-4 space-y-4">
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !isQuickCreateDisabled) {
                  void handleQuickCreate();
                }
              }}
              placeholder={t("descriptionPlaceholder")}
              className="h-24 w-full resize-none rounded border border-terminal-border bg-white px-3 py-2 font-mono text-xs text-terminal-dark focus:outline-none focus:ring-1 focus:ring-terminal-green"
              disabled={isBusy}
            />
            <p className="text-xs font-mono text-terminal-muted">
              {inputLength < 10 ? t("minCharsHint") : t("descriptionQualityHint")}
            </p>
            <Button
              onClick={() => void handleQuickCreate()}
              disabled={isQuickCreateDisabled}
              className="w-full bg-terminal-green font-mono text-white hover:bg-terminal-green/90"
            >
              {isQuickCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("creating")}
                </>
              ) : (
                `${t("createAndChat")} ->`
              )}
            </Button>
          </TabsContent>

          <TabsContent value="template" className="mt-4">
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {isTemplatesLoading ? (
                <p className="col-span-3 py-4 text-center font-mono text-xs text-terminal-muted">{t("loadingTemplates")}</p>
              ) : templatesLoadFailed ? (
                <div className="col-span-3 flex flex-col items-center gap-2 py-4 text-center">
                  <p className="font-mono text-xs text-red-600">{t("templateLoadError")}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadTemplates()}
                    disabled={isBusy || isTemplatesLoading}
                    className="h-7 px-2 text-[10px] font-mono"
                  >
                    {t("retryTemplates")}
                  </Button>
                </div>
              ) : templates.length === 0 ? (
                <p className="col-span-3 py-4 text-center font-mono text-xs text-terminal-muted">{t("noTemplates")}</p>
              ) : (
                templates.map((tmpl) => {
                  const isTemplateLoading = creatingTemplateId === tmpl.id;

                  return (
                    <button
                      key={tmpl.id}
                      onClick={() => void handleUseTemplate(tmpl.id)}
                      disabled={isBusy}
                      className="cursor-pointer rounded-lg border border-terminal-border bg-white p-3 text-left transition-colors hover:border-terminal-green disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <p className="line-clamp-1 font-mono text-xs font-medium text-terminal-dark">{tmpl.name}</p>
                      {tmpl.tagline ? (
                        <p className="mt-0.5 line-clamp-2 font-mono text-[10px] text-terminal-muted">{tmpl.tagline}</p>
                      ) : null}
                      {isTemplateLoading ? (
                        <Loader2 className="mt-2 h-3 w-3 animate-spin text-terminal-green" />
                      ) : (
                        <span className="mt-1 block font-mono text-[10px] text-terminal-green">{t("useTemplate")}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-2 border-t border-terminal-border/40 pt-3">
          <Link
            href="/create-character"
            className="font-mono text-xs text-terminal-muted transition-colors hover:text-terminal-dark"
            onClick={() => onOpenChange(false)}
          >
            {t("advancedSetup")}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
