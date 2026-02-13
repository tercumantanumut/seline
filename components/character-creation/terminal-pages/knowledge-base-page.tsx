"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ComputerGraphic } from "../computer-graphic";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { TerminalPrompt } from "@/components/ui/terminal-prompt";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useTranslations } from "next-intl";
import { resilientFetch, resilientDelete } from "@/lib/utils/resilient-fetch";

export interface UploadedDocument {
  id: string;
  originalFilename: string;
  title?: string;
  status: "pending" | "ready" | "failed";
  sizeBytes?: number;
}

interface KnowledgeBasePageProps {
  agentId: string;
  agentName: string;
  initialDocuments?: UploadedDocument[];
  onSubmit: (documents: UploadedDocument[]) => void;
  onBack: () => void;
}

export function KnowledgeBasePage({
  agentId,
  agentName,
  initialDocuments = [],
  onSubmit,
  onBack,
}: KnowledgeBasePageProps) {
  const t = useTranslations("characterCreation.knowledgeBase");
  const [documents, setDocuments] = useState<UploadedDocument[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  // Fetch existing documents on mount
  useEffect(() => {
    if (!agentId) return;
    resilientFetch<{ documents?: UploadedDocument[] }>(`/api/characters/${agentId}/documents`)
      .then(({ data }) => {
        if (data?.documents) {
          setDocuments(data.documents);
        }
      })
      .catch((err) => console.error("Failed to load documents:", err));
  }, [agentId]);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);

      const { data, error: uploadError } = await resilientFetch<{ document: UploadedDocument; error?: string }>(
        `/api/characters/${agentId}/documents`,
        { method: "POST", body: formData, timeout: 30_000 },
      );
      if (uploadError || !data) {
        setError(data?.error || uploadError || "Upload failed");
        continue;
      }
      setDocuments((prev) => [...prev, data.document]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [agentId]);

  const handleDelete = useCallback(async (docId: string) => {
    const { error } = await resilientDelete(`/api/characters/${agentId}/documents?documentId=${docId}`);
    if (!error) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } else {
      console.error("Delete failed:", error);
    }
  }, [agentId]);

  const handleSubmit = () => {
    onSubmit(documents);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full min-h-full flex-col items-center bg-terminal-cream px-4 py-6 sm:px-8">
      <div className="flex w-full max-w-2xl flex-1 flex-col gap-6 min-h-0">
        {/* Header */}
        <div className="flex items-start gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          >
            <ComputerGraphic size="sm" />
          </motion.div>

          <div className="flex-1 space-y-4">
            <TerminalPrompt prefix="step-3" symbol="$" animate={!prefersReducedMotion}>
              <span className="text-terminal-amber">agent.knowledge({agentName})</span>
            </TerminalPrompt>

            <div className="font-mono text-lg text-terminal-dark">
              {!hasAnimated.current ? (
                <TypewriterText
                  text={t("question")}
                  delay={prefersReducedMotion ? 0 : 200}
                  speed={prefersReducedMotion ? 0 : 25}
                  onComplete={() => {
                    hasAnimated.current = true;
                    setShowForm(true);
                  }}
                  showCursor={false}
                />
              ) : (
                <span>{t("question")}</span>
              )}
            </div>
          </div>
        </div>

        {/* Upload Section - Scrollable Container */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
            className="flex min-h-0 flex-1 flex-col rounded-lg border border-terminal-border bg-terminal-bg/30"
          >
            {/* Scrollable content area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              {/* Upload Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-terminal-border/50 rounded-lg p-8 text-center cursor-pointer hover:border-terminal-amber transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.html,.htm"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />
                <div className="font-mono text-terminal-dark/70">
                  {uploading ? (
                    <span className="text-terminal-amber">{t("uploading")}</span>
                  ) : (
                    <>
                      <span className="text-terminal-amber">{t("clickToUpload")}</span> {t("orDragFiles")}
                    </>
                  )}
                </div>
                <div className="text-xs font-mono text-terminal-dark/50 mt-2">
                  {t("supportedFormats")}
                </div>
              </div>

              {error && (
                <div className="text-red-500 text-sm font-mono">! {error}</div>
              )}

              {/* Document List */}
              {documents.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-mono text-terminal-amber">{t("uploadedDocuments")}</h3>
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 bg-terminal-bg/20 rounded border border-terminal-border/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm text-terminal-dark truncate">
                          {doc.title || doc.originalFilename}
                        </div>
                        <div className="font-mono text-xs text-terminal-dark/50">
                          {formatSize(doc.sizeBytes)} • {doc.status}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="ml-2 text-red-500/70 hover:text-red-500 text-sm font-mono"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Skip hint */}
              <div className="text-xs font-mono text-terminal-dark/50 text-center">
                {t("skipHint")}
              </div>
            </div>

            {/* Navigation - Fixed at bottom */}
            <div className="flex flex-col gap-3 border-t border-terminal-border/50 bg-terminal-cream/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={onBack}
                className="order-2 text-sm font-mono text-terminal-dark/60 transition-colors hover:text-terminal-dark sm:order-1"
              >
                ← {t("back")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={uploading}
                className="order-1 w-full rounded bg-terminal-dark px-4 py-2 text-sm font-mono text-terminal-cream transition-colors hover:bg-terminal-dark/90 disabled:opacity-50 sm:order-2 sm:w-auto"
              >
                {documents.length > 0 ? t("continue") : t("skip")}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
