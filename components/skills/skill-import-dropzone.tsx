"use client";

import { useCallback, useState } from "react";
import { Upload, FileArchive, Folder, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface SkillImportDropzoneProps {
  characterId: string;
  onImportSuccess: (skillId: string) => void;
  onImportError?: (error: string) => void;
}

type UploadPhase = "idle" | "uploading" | "parsing" | "importing" | "success" | "error";

export function SkillImportDropzone({ 
  characterId, 
  onImportSuccess,
  onImportError 
}: SkillImportDropzoneProps) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    console.log(`[SkillUpload] 📤 Starting upload for: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    
    const isZip = file.name.endsWith(".zip");
    const isMd = file.name.endsWith(".md");
    
    if (!isZip && !isMd) {
      const errorMsg = "Only .zip packages or .md files are supported";
      console.log(`[SkillUpload] ❌ Invalid file type: ${file.name}`);
      setError(errorMsg);
      setPhase("error");
      toast.error("Invalid file type", {
        description: errorMsg,
      });
      return;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      const errorMsg = "File size exceeds 50MB limit";
      setError(errorMsg);
      setPhase("error");
      toast.error("File too large", {
        description: errorMsg,
      });
      return;
    }

    try {
      console.log(`[SkillUpload] 🔄 Phase: uploading`);
      setPhase("uploading");
      setProgress(10);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("characterId", characterId);

      console.log(`[SkillUpload] 🔄 Phase: parsing (30%)`);
      setProgress(30);
      setPhase("parsing");

      console.log(`[SkillUpload] 🌐 Sending request to /api/skills/import...`);
      const fetchStart = Date.now();
      const response = await fetch("/api/skills/import", {
        method: "POST",
        body: formData,
      });
      const fetchDuration = Date.now() - fetchStart;
      console.log(`[SkillUpload] ✅ Response received after ${fetchDuration}ms - status: ${response.status}`);

      console.log(`[SkillUpload] 🔄 Phase: importing (70%)`);
      setProgress(70);
      setPhase("importing");

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import failed");
      }

      const result = await response.json();
      console.log(`[SkillUpload] 📦 Result:`, result);
      
      console.log(`[SkillUpload] 🔄 Phase: success (100%)`);
      setProgress(100);
      setPhase("success");

      toast.success("Skill imported successfully", {
        description: `${result.skillName} with ${result.scriptsFound} script(s)`,
      });

      onImportSuccess(result.skillId);

      // Reset after 2 seconds
      setTimeout(() => {
        setPhase("idle");
        setProgress(0);
      }, 2000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[SkillUpload] ❌ Upload failed:`, error);
      setError(errorMsg);
      setPhase("error");
      
      toast.error("Import failed", {
        description: errorMsg,
      });

      if (onImportError) {
        onImportError(errorMsg);
      }
    }
  }, [characterId, onImportSuccess, onImportError]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    await uploadFile(file);
  }, [uploadFile]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await uploadFile(file);
  }, [uploadFile]);

  const getPhaseLabel = () => {
    switch (phase) {
      case "uploading": return "Uploading...";
      case "parsing": return "Parsing package...";
      case "importing": return "Importing skill...";
      case "success": return "Import complete!";
      case "error": return "Import failed";
      default: return "Drag & drop a skill package";
    }
  };

  const getPhaseIcon = () => {
    switch (phase) {
      case "uploading":
      case "parsing":
      case "importing":
        return <Loader2 className="h-12 w-12 text-terminal-green animate-spin" />;
      case "success":
        return <CheckCircle className="h-12 w-12 text-terminal-green" />;
      case "error":
        return <XCircle className="h-12 w-12 text-red-500" />;
      default:
        return isDragging 
          ? <Folder className="h-12 w-12 text-terminal-green" />
          : <FileArchive className="h-12 w-12 text-terminal-muted" />;
    }
  };

  const isProcessing = ["uploading", "parsing", "importing"].includes(phase);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        transition-all duration-200
        ${isDragging ? "border-terminal-green bg-terminal-green/10 scale-[1.02]" : "border-terminal-border"}
        ${isProcessing ? "opacity-50 cursor-not-allowed" : "hover:border-terminal-green hover:bg-terminal-green/5"}
        ${phase === "success" ? "border-terminal-green bg-terminal-green/10" : ""}
        ${phase === "error" ? "border-red-500 bg-red-500/10" : ""}
      `}
    >
      <input
        type="file"
        id="skill-file-input"
        accept=".zip,.md"
        onChange={handleFileInput}
        disabled={isProcessing}
        className="hidden"
      />
      
      <div className="flex flex-col items-center gap-4">
        {getPhaseIcon()}
        
        <div className="space-y-2">
          <p className="font-mono text-terminal-dark font-semibold">
            {getPhaseLabel()}
          </p>
          
          {phase === "idle" && (
            <p className="text-sm text-terminal-muted">
              or click to browse (.zip packages or .md files)
            </p>
          )}

          {error && phase === "error" && (
            <p className="text-sm text-red-500 max-w-md">
              {error}
            </p>
          )}
        </div>

        {isProcessing && (
          <div className="w-full max-w-xs space-y-2" data-testid="upload-progress">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-terminal-muted">
              {progress}%
            </p>
            <p className="text-xs text-terminal-muted opacity-50">
              [{phase}]
            </p>
          </div>
        )}

        {phase === "idle" && !isDragging && (
          <Button 
            variant="outline" 
            className="mt-2"
            onClick={() => document.getElementById("skill-file-input")?.click()}
          >
            Browse Files
          </Button>
        )}

        {phase === "error" && (
          <Button 
            variant="outline" 
            className="mt-2"
            onClick={() => {
              setPhase("idle");
              setError(null);
              setProgress(0);
            }}
          >
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
}
