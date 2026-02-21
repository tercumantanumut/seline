"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileCode, FileText, Image, FileArchive, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { SkillFile } from "@/lib/db/sqlite-skills-schema";

interface SkillFilesTabProps {
  skillId: string;
}

export function SkillFilesTab({ skillId }: SkillFilesTabProps) {
  const t = useTranslations("skills.files");
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<SkillFile | null>(null);

  useEffect(() => {
    loadFiles();
  }, [skillId]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/skills/${skillId}/files`);
      if (!response.ok) {
        throw new Error("Failed to load files");
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (file: SkillFile) => {
    const ext = file.relativePath.split(".").pop()?.toLowerCase();
    
    if (file.isExecutable) {
      return <FileCode className="h-4 w-4 text-terminal-green" />;
    }
    
    if (["jpg", "jpeg", "png", "gif", "svg"].includes(ext || "")) {
      return <Image className="h-4 w-4 text-blue-500" />;
    }
    
    if (["md", "txt", "json", "yaml", "yml"].includes(ext || "")) {
      return <FileText className="h-4 w-4 text-terminal-muted" />;
    }
    
    return <FileArchive className="h-4 w-4 text-terminal-muted" />;
  };

  const getFileCategory = (file: SkillFile): string => {
    const firstDir = file.relativePath.split("/")[0]?.toLowerCase();
    
    if (["scripts", "script"].includes(firstDir)) return "script";
    if (["references", "reference", "docs"].includes(firstDir)) return "reference";
    if (["assets", "asset", "resources"].includes(firstDir)) return "asset";
    
    return "other";
  };

  const downloadFile = async (file: SkillFile) => {
    try {
      const response = await fetch(`/api/skills/${skillId}/files/${encodeURIComponent(file.relativePath)}`);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.relativePath.split("/").pop() || "file";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download error:", err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const categorizedFiles = {
    scripts: files.filter(f => getFileCategory(f) === "script"),
    references: files.filter(f => getFileCategory(f) === "reference"),
    assets: files.filter(f => getFileCategory(f) === "asset"),
    other: files.filter(f => getFileCategory(f) === "other"),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-terminal-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        Error: {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-terminal-muted">
        {t("noFiles")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scripts */}
      {categorizedFiles.scripts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-terminal-dark mb-3 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Scripts ({categorizedFiles.scripts.length})
          </h3>
          <div className="space-y-2">
            {categorizedFiles.scripts.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border border-terminal-border rounded-lg hover:bg-terminal-green/5 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-terminal-dark truncate">
                      {file.relativePath}
                    </p>
                    <p className="text-xs text-terminal-muted">
                      {formatFileSize(file.size)} • {file.mimeType}
                    </p>
                  </div>
                  {file.isExecutable && (
                    <Badge variant="outline" className="text-terminal-green border-terminal-green">
                      Executable
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadFile(file)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* References */}
      {categorizedFiles.references.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-terminal-dark mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            References ({categorizedFiles.references.length})
          </h3>
          <div className="space-y-2">
            {categorizedFiles.references.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border border-terminal-border rounded-lg hover:bg-terminal-green/5 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-terminal-dark truncate">
                      {file.relativePath}
                    </p>
                    <p className="text-xs text-terminal-muted">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadFile(file)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assets */}
      {categorizedFiles.assets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-terminal-dark mb-3 flex items-center gap-2">
            <FileArchive className="h-4 w-4" />
            Assets ({categorizedFiles.assets.length})
          </h3>
          <div className="space-y-2">
            {categorizedFiles.assets.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border border-terminal-border rounded-lg hover:bg-terminal-green/5 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-terminal-dark truncate">
                      {file.relativePath}
                    </p>
                    <p className="text-xs text-terminal-muted">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadFile(file)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other files */}
      {categorizedFiles.other.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-terminal-dark mb-3">
            Other Files ({categorizedFiles.other.length})
          </h3>
          <div className="space-y-2">
            {categorizedFiles.other.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border border-terminal-border rounded-lg hover:bg-terminal-green/5 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-terminal-dark truncate">
                      {file.relativePath}
                    </p>
                    <p className="text-xs text-terminal-muted">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadFile(file)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
