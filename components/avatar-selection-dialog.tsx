"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Check, Trash2, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { resilientFetch, resilientPost, resilientPatch, resilientDelete } from "@/lib/utils/resilient-fetch";
import type { CharacterImage } from "@/lib/db/sqlite-character-schema";
import { useTranslations } from "next-intl";

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface AvatarSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterId: string;
  characterName: string;
  currentAvatarUrl: string | null;
  onAvatarChange: (newAvatarUrl: string | null) => void;
}

export function AvatarSelectionDialog({
  open,
  onOpenChange,
  characterId,
  characterName,
  onAvatarChange,
}: AvatarSelectionDialogProps) {
  const [images, setImages] = useState<CharacterImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("avatar");
  const tc = useTranslations("common");

  useEffect(() => {
    if (open) {
      fetchImages();
    }
  }, [open, characterId]);

  const fetchImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await resilientFetch<{ images: CharacterImage[] }>(`/api/characters/${characterId}/images`);
      if (fetchError || !data) throw new Error(t("error.fetch"));
      setImages(data.images || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.load"));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setError(t("error.invalidType"));
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(t("error.tooLarge"));
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("role", "avatar");

        const { data: uploadData, error: uploadError } = await resilientFetch<{ url: string; localPath: string }>("/api/upload", { method: "POST", body: formData, timeout: 30_000 });
        if (uploadError || !uploadData) throw new Error(t("error.upload"));
        const { url, localPath } = uploadData;

        const { error: createError } = await resilientPost(`/api/characters/${characterId}/images`, { url, localPath, imageType: "avatar", isPrimary: true });
        if (createError) throw new Error(t("error.upload"));

        await fetchImages();
        onAvatarChange(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error.upload"));
      } finally {
        setUploading(false);
      }
    },
    [characterId, onAvatarChange, t]
  );

  const handleSetPrimary = async (imageId: string, imageUrl: string) => {
    setSettingPrimary(imageId);
    try {
      const { error: patchError } = await resilientPatch(`/api/characters/${characterId}/images`, { imageId });
      if (patchError) throw new Error(t("error.setPrimary"));
      await fetchImages();
      onAvatarChange(imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.setPrimary"));
    } finally {
      setSettingPrimary(null);
    }
  };

  const handleDelete = async (imageId: string) => {
    try {
      const { error: deleteError } = await resilientDelete(`/api/characters/${characterId}/images?imageId=${imageId}`);
      if (deleteError) throw new Error(t("error.delete"));
      await fetchImages();
      const deleted = images.find((img) => img.id === imageId);
      if (deleted?.isPrimary) {
        const remaining = images.filter((img) => img.id !== imageId);
        onAvatarChange(remaining[0]?.url || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.delete"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-terminal-cream border-terminal-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-terminal-dark">
            {t("dialog.title", { name: characterName })}
          </DialogTitle>
          <DialogDescription className="font-mono text-terminal-muted">
            {t("dialog.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="hidden"
        />

        {error && (
          <div className="p-3 bg-red-100 rounded-lg">
            <p className="text-sm font-mono text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-terminal-green" />
            </div>
          ) : images.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={cn(
                    "relative group aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all",
                    image.isPrimary
                      ? "border-terminal-green ring-2 ring-terminal-green/20"
                      : "border-terminal-border hover:border-terminal-green/50"
                  )}
                  onClick={() => !image.isPrimary && handleSetPrimary(image.id, image.url)}
                >
                  <img
                    src={image.url}
                    alt={t("dialog.title", { name: characterName })}
                    className="w-full h-full object-cover"
                  />
                  {image.isPrimary && (
                    <div className="absolute top-1 right-1 bg-terminal-green text-terminal-cream rounded-full p-1">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                  {settingPrimary === image.id && (
                    <div className="absolute inset-0 bg-terminal-dark/50 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-terminal-cream" />
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(image.id);
                    }}
                    className="absolute bottom-1 right-1 bg-red-500/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    title={t("delete")}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-terminal-muted font-mono text-sm">
              <ImagePlus className="w-10 h-10 mx-auto mb-2 opacity-50" />
              {t("empty")}
            </div>
          )}

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="outline"
            className="w-full font-mono border-terminal-border hover:bg-terminal-dark/5"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("actions.uploading")}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {t("actions.upload")}
              </>
            )}
          </Button>
          <p className="text-xs font-mono text-terminal-muted text-center">
            {t("note")}
          </p>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              className="font-mono"
              onClick={() => onOpenChange(false)}
            >
              {tc("close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
