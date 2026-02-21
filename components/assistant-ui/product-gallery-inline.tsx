"use client";

import type { FC } from "react";
import { useState, useCallback } from "react";
import { CheckCircle2, ExternalLink, Loader2Icon, ImageIcon, PaperclipIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useGallery } from "./gallery-context";

// Define the component type matching assistant-ui pattern
type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: { query?: string };
  result?: GalleryResult;
}>;

interface GalleryItem {
  id: string;
  name: string;
  imageUrl: string;
  price?: string;
  sourceUrl?: string;
  description?: string;
}

interface GalleryResult {
  status: "success" | "error" | "no_results";
  query?: string;
  products: GalleryItem[];
  message?: string;
  error?: string;
}

const GalleryCard: FC<{
  item: GalleryItem;
  isAttached: boolean;
  isAttaching: boolean;
  onAttach: () => void;
}> = ({ item, isAttached, isAttaching, onAttach }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className={`relative border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${isAttached
          ? "border-terminal-green shadow-lg scale-[1.02]"
          : "border-terminal-dark/20 hover:border-terminal-green/50 hover:shadow-md"
        }`}
      onClick={onAttach}
    >
      {/* Attachment indicator */}
      {isAttached && (
        <div className="absolute top-2 right-2 bg-terminal-green text-white rounded-full p-1 z-10">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      )}

      {/* Attaching indicator */}
      {isAttaching && (
        <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
          <Loader2Icon className="w-6 h-6 text-terminal-green animate-spin" />
        </div>
      )}

      {/* Image */}
      <div className="aspect-square bg-white flex items-center justify-center">
        {imageError ? (
          <div className="flex flex-col items-center text-terminal-muted">
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs mt-1">Image unavailable</span>
          </div>
        ) : (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-contain"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}
      </div>

      {/* Item info */}
      <div className="p-2 bg-terminal-cream">
        <p className="text-sm font-medium text-terminal-dark line-clamp-2">
          {item.name}
        </p>
        {item.price && (
          <p className="text-sm text-terminal-green font-bold mt-1">{item.price}</p>
        )}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-terminal-muted hover:text-terminal-green mt-1"
            onClick={(e) => e.stopPropagation()}
          >
            View source <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
};

export const ProductGalleryToolUI: ToolCallContentPartComponent = ({
  args,
  result,
}) => {
  const t = useTranslations("assistantUi.gallery");
  const [attachedItems, setAttachedItems] = useState<Set<string>>(new Set());
  const [attachingItems, setAttachingItems] = useState<Set<string>>(new Set());
  const gallery = useGallery();
  const isRunning = result === undefined;

  const handleAttach = useCallback(async (item: GalleryItem) => {
    if (!gallery) {
      toast.error(t("noContextAvailable"));
      return;
    }

    // If already attached, just toggle off the visual indicator
    if (attachedItems.has(item.id)) {
      setAttachedItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      return;
    }

    // Mark as attaching
    setAttachingItems((prev) => new Set(prev).add(item.id));

    try {
      await gallery.attachImageToComposer(item.imageUrl, item.name);
      setAttachedItems((prev) => new Set(prev).add(item.id));
      toast.success(t("attachedToChat", { name: item.name }));
    } catch (error) {
      console.error("[Gallery] Failed to attach image:", error);
      toast.error(t("attachFailed"));
    } finally {
      setAttachingItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [gallery, attachedItems]);

  // Loading state
  if (isRunning) {
    return (
      <div className="my-3 rounded-lg bg-terminal-cream/80 shadow-sm p-4 font-mono">
        <div className="flex items-center gap-2">
          <Loader2Icon className="w-4 h-4 text-terminal-green animate-spin" />
          <span className="text-sm text-terminal-dark">Loading images...</span>
        </div>
        {args?.query && (
          <p className="text-xs text-terminal-muted mt-1">Search: &quot;{args.query}&quot;</p>
        )}
      </div>
    );
  }

  // Error state
  if (result?.status === "error") {
    return (
      <div className="my-3 rounded-lg bg-red-50 shadow-sm p-4 font-mono">
        <p className="text-sm text-red-600">{result.error || "Failed to load images"}</p>
      </div>
    );
  }

  // No results state
  if (!result?.products?.length || result.status === "no_results") {
    return (
      <div className="my-3 rounded-lg bg-terminal-cream/80 shadow-sm p-4 font-mono">
        <p className="text-sm text-terminal-muted">No images found</p>
        {args?.query && (
          <p className="text-xs text-terminal-muted mt-1">Search: &quot;{args.query}&quot;</p>
        )}
      </div>
    );
  }

  // Success state with items
  return (
    <div className="my-3 rounded-lg bg-terminal-cream/80 shadow-sm p-4 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-terminal-dark text-sm">
            {result.products.length} Image{result.products.length !== 1 ? "s" : ""} Found
          </h3>
          {args?.query && (
            <p className="text-xs text-terminal-muted">Search: &quot;{args.query}&quot;</p>
          )}
        </div>
        {attachedItems.size > 0 && (
          <span className="text-xs text-terminal-green font-medium flex items-center gap-1">
            <PaperclipIcon className="w-3 h-3" />
            {attachedItems.size} attached
          </span>
        )}
      </div>

      {/* Gallery grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {result.products.map((item) => (
          <GalleryCard
            key={item.id}
            item={item}
            isAttached={attachedItems.has(item.id)}
            isAttaching={attachingItems.has(item.id)}
            onAttach={() => handleAttach(item)}
          />
        ))}
      </div>

      {/* Hint */}
      <p className="text-xs text-terminal-muted mt-3 flex items-center gap-1">
        <PaperclipIcon className="w-3 h-3" />
        Click an image to attach it to your next message
      </p>
    </div>
  );
};

export default ProductGalleryToolUI;
