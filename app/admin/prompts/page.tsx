"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { FileTextIcon, Loader2Icon, RefreshCwIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { PromptTemplate } from "@/lib/db/sqlite-schema";

interface PromptsResponse { templates: PromptTemplate[]; }

export default function AdminPromptsPage() {
  const t = useTranslations("admin.prompts");
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch("/api/admin/prompts");
      if (!res.ok) throw new Error(t("loadFailed"));
      const data = (await res.json()) as PromptsResponse;
      setTemplates(data.templates);
    } catch (err) { setError(err instanceof Error ? err.message : t("loadFailed")); } finally { setLoading(false); }
  };

  useEffect(() => { loadTemplates(); }, []);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

  return (
    <Shell>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-terminal-border bg-terminal-cream p-4">
          <div className="flex items-center gap-3">
            <FileTextIcon className="size-6 text-terminal-green" />
            <div>
              <h1 className="font-mono text-xl font-bold text-terminal-dark">{t("title")}</h1>
              <p className="font-mono text-sm text-terminal-muted">{t("subtitle")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadTemplates}><RefreshCwIcon className="mr-1 size-4" />{t("refresh")}</Button>
        </div>
        <div className="flex-1 overflow-auto bg-terminal-cream p-4">
          {loading ? <div className="flex h-full items-center justify-center"><Loader2Icon className="size-6 animate-spin text-terminal-muted" /></div>
          : error ? <div className="flex h-full items-center justify-center"><p className="font-mono text-red-500">{error}</p></div>
          : templates.length === 0 ? <div className="flex h-full items-center justify-center"><p className="font-mono text-terminal-muted">{t("noTemplates")}</p></div>
          : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Link key={template.id} href={`/admin/prompts/${encodeURIComponent(template.key)}`} className="group rounded-lg border border-terminal-border bg-white p-4 hover:border-terminal-green hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-mono text-sm font-medium text-terminal-dark truncate">{template.key}</h3>
                      {template.description && <p className="font-mono text-xs text-terminal-muted mt-1 line-clamp-2">{template.description}</p>}
                    </div>
                    <ChevronRightIcon className="size-4 text-terminal-muted group-hover:text-terminal-green transition-colors flex-shrink-0 ml-2" />
                  </div>
                  <div className="mt-3 pt-3 border-t border-terminal-border/50">
                    <p className="font-mono text-xs text-terminal-muted">{t("created", { date: formatDate(template.createdAt) })}</p>
                  </div>
                </Link>
              ))}
            </div>}
        </div>
      </div>
    </Shell>
  );
}
