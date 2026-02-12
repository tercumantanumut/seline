"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FileText,
  Upload,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronDown,
  FileIcon,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { resilientFetch, resilientPost, resilientDelete } from "@/lib/utils/resilient-fetch";

export interface AgentDocument {
  id: string;
  originalFilename: string;
  title?: string | null;
  contentType: string;
  sizeBytes?: number | null;
  status: "pending" | "ready" | "failed";
  errorMessage?: string | null;
  createdAt: string;
}

interface DocumentsPanelProps {
  agentId: string;
  agentName?: string;
}

const FILE_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/html": "html",
};

export function DocumentsPanel({ agentId }: DocumentsPanelProps) {
  const [documents, setDocuments] = useState<AgentDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const formatter = useFormatter();

  const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} ${t("units.bytes")}`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} ${t("units.kb")}`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} ${t("units.mb")}`;
  };

  const formatDate = (dateStr: string): string =>
    formatter.dateTime(new Date(dateStr), { dateStyle: "medium" });

  const fetchDocuments = useCallback(async () => {
    setError(null);
    const { data, error } = await resilientFetch<{ documents: AgentDocument[] }>(
      `/api/characters/${agentId}/documents`
    );
    if (error || !data) {
      setError(error || t("error.fetch"));
    } else {
      setDocuments(data.documents || []);
    }
    setIsLoading(false);
  }, [agentId, t]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Poll for pending documents every 3 seconds
  useEffect(() => {
    const hasPending = documents.some(doc => doc.status === "pending");
    if (!hasPending) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const { error } = await resilientFetch(`/api/characters/${agentId}/documents`, {
          method: "POST",
          body: formData,
          timeout: 30_000,
        });

        if (error) {
          throw new Error(error || t("error.upload", { file: file.name }));
        }
      }
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.upload"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (documentId: string) => {
    setDeletingId(documentId);
    setError(null);

    const { error } = await resilientDelete(
      `/api/characters/${agentId}/documents?documentId=${documentId}`
    );

    if (error) {
      setError(error || t("error.delete"));
    } else {
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
    }
    setDeletingId(null);
  };

  const handleRetry = async (documentId: string) => {
    setError(null);
    // Trigger re-processing by calling the reindex endpoint
    const { error } = await resilientPost(
      `/api/characters/${agentId}/documents/${documentId}/reindex`,
      {}
    );

    if (error) {
      setError(error || t("error.retry"));
      return;
    }

    await fetchDocuments();
  };

  const getFileTypeLabel = (contentType: string): string => {
    const key = FILE_TYPE_LABELS[contentType];
    return key ? t(`type.${key}`) : contentType.split("/")[1]?.toUpperCase() || "FILE";
  };

  return (
    <div className="flex flex-col h-full overflow-hidden border-t border-terminal-border/40 pt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "shrink-0 flex items-center justify-between w-full px-3 py-2.5",
          "rounded-md transition-all duration-200 ease-out",
          "hover:bg-terminal-dark/8 active:bg-terminal-dark/10",
          "cursor-pointer select-none"
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "transition-transform duration-200",
              isExpanded ? "rotate-0" : "-rotate-90"
            )}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-colors duration-200",
                isExpanded ? "text-terminal-dark" : "text-terminal-muted"
              )}
            />
          </div>
          <FileText
            className={cn(
              "h-4 w-4 transition-colors duration-200",
              isExpanded ? "text-terminal-green" : "text-terminal-muted"
            )}
          />
          <span
            className={cn(
              "text-xs font-semibold font-mono uppercase tracking-wider transition-colors duration-200",
              isExpanded ? "text-terminal-dark" : "text-terminal-muted"
            )}
          >
            {t("title")}
          </span>
          <span className="text-xs font-mono text-terminal-muted/70">
            ({documents.length})
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden mt-2 px-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.markdown,.html,.htm"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />

          <div className="shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={cn(
                "w-full h-9 text-xs font-mono font-medium",
                "border-dashed border-terminal-border transition-all duration-200",
                "hover:border-terminal-green hover:bg-terminal-green/8 hover:shadow-sm",
                "active:bg-terminal-green/12",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  {t("status.processing")}
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  {t("add")}
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 mt-2 bg-red-50 border border-red-200/50 rounded-md text-xs text-red-600 font-mono shadow-sm">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          <ScrollArea className="flex-1 min-h-0 mt-2">
            <div className="space-y-1.5 pr-2 pb-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-terminal-muted" />
                </div>
              ) : documents.length === 0 ? (
                <p className="text-xs text-terminal-muted font-mono py-4 text-center">
                  {t("empty")}
                </p>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={cn(
                      "group flex items-start gap-2.5 px-3 py-2.5 rounded-md",
                      "bg-terminal-dark/5 hover:bg-terminal-dark/10",
                      "transition-all duration-200 ease-out"
                    )}
                  >
                    <FileIcon className="h-4 w-4 flex-shrink-0 text-terminal-muted mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-mono text-terminal-dark truncate"
                        title={doc.originalFilename}
                      >
                        {doc.title || doc.originalFilename}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-terminal-muted/70 font-mono mt-1">
                        <span className="px-1.5 py-0.5 bg-terminal-dark/10 rounded text-[10px] font-medium">
                          {getFileTypeLabel(doc.contentType)}
                        </span>
                        {doc.sizeBytes && <span>{formatFileSize(doc.sizeBytes)}</span>}
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {formatDate(doc.createdAt)}
                        </span>
                        {doc.status === "pending" && (
                          <span className="text-amber-500 font-medium">
                            {t("status.processing")}
                          </span>
                        )}
                        {doc.status === "failed" && (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-red-500" />
                            <span className="text-red-500 font-medium">
                              {t("status.failed")}
                            </span>
                            {doc.errorMessage && (
                              <span
                                className="text-red-600/80 text-[10px] truncate max-w-[150px]"
                                title={doc.errorMessage}
                              >
                                - {doc.errorMessage}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {doc.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => handleRetry(doc.id)}
                        title={t("retry")}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        {t("retry")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 w-7 p-0 opacity-0 group-hover:opacity-100",
                        "transition-all duration-150 ease-out",
                        "text-terminal-muted hover:text-red-500 hover:bg-red-50 rounded hover:shadow-sm"
                      )}
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      title={t("delete")}
                    >
                      {deletingId === doc.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
