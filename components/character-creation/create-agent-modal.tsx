"use client";

import { useEffect, useState } from "react";
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
  const [isLoading, setIsLoading] = useState(false);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }

    const loadTemplates = async () => {
      setIsTemplatesLoading(true);
      try {
        const response = await fetch("/api/characters/templates", { method: "GET" });
        const data = (await response.json()) as { templates?: Template[] };
        if (Array.isArray(data.templates)) {
          setTemplates(data.templates);
        } else {
          setTemplates([]);
        }
      } catch {
        setTemplates([]);
      } finally {
        setIsTemplatesLoading(false);
      }
    };

    void loadTemplates();
  }, [open]);

  const handleQuickCreate = async () => {
    if (inputValue.trim().length < 10 || isLoading) return;

    setIsLoading(true);
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
        throw new Error(expandErr || t("errorExpansion"));
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
        throw new Error(createErr || t("errorCreation"));
      }

      onCreated();
      onOpenChange(false);
      router.push(`/chat/${createData.character.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errorCreation");

      if (message === "SESSION_EXPIRED") {
        setError("Session expired, please reload");
      } else if (
        message.toLowerCase().includes("model") ||
        message.toLowerCase().includes("provider") ||
        message.toLowerCase().includes("api key")
      ) {
        setError("Please configure an AI provider in Settings first");
      } else {
        setError(message);
      }

      toast.error(t("errorCreation"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseTemplate = async (templateId: string) => {
    if (isLoading) return;

    setIsLoading(true);
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
        throw new Error(createErr || t("errorCreation"));
      }

      onCreated();
      onOpenChange(false);
      router.push(`/chat/${data.characterId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errorCreation");
      if (message === "SESSION_EXPIRED") {
        setError("Session expired, please reload");
      } else {
        setError(message);
      }
      toast.error(t("errorCreation"));
    } finally {
      setIsLoading(false);
    }
  };

  const isQuickCreateDisabled = isLoading || inputValue.trim().length < 10;

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
              disabled={isLoading}
            />
            <p className="text-xs font-mono text-terminal-muted">
              {inputValue.trim().length < 10 ? t("minCharsHint") : `${inputValue.trim().length}/10`}
            </p>
            <Button
              onClick={() => void handleQuickCreate()}
              disabled={isQuickCreateDisabled}
              className="w-full bg-terminal-green font-mono text-white hover:bg-terminal-green/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("creating")}
                </>
              ) : (
                `${t("createAndChat")} →`
              )}
            </Button>
          </TabsContent>

          <TabsContent value="template" className="mt-4">
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {isTemplatesLoading ? (
                <p className="col-span-3 py-4 text-center font-mono text-xs text-terminal-muted">{t("loadingTemplates")}</p>
              ) : templates.length === 0 ? (
                <p className="col-span-3 py-4 text-center font-mono text-xs text-terminal-muted">{t("noTemplates")}</p>
              ) : (
                templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => void handleUseTemplate(tmpl.id)}
                    disabled={isLoading}
                    className="cursor-pointer rounded-lg border border-terminal-border bg-white p-3 text-left transition-colors hover:border-terminal-green disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <p className="line-clamp-1 font-mono text-xs font-medium text-terminal-dark">{tmpl.name}</p>
                    {tmpl.tagline ? (
                      <p className="mt-0.5 line-clamp-2 font-mono text-[10px] text-terminal-muted">{tmpl.tagline}</p>
                    ) : null}
                    {isLoading ? (
                      <Loader2 className="mt-2 h-3 w-3 animate-spin text-terminal-green" />
                    ) : (
                      <span className="mt-1 block font-mono text-[10px] text-terminal-green">{t("useTemplate")}</span>
                    )}
                  </button>
                ))
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
