"use client";

import type { FC } from "react";
import { useEffect, useRef, useCallback } from "react";
import { ThreadPrimitive, useThread, useThreadRuntime } from "@assistant-ui/react";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GalleryProvider } from "./gallery-context";

/**
 * GalleryWrapper provides the GalleryContext that enables gallery components
 * to attach images to the chat composer for referencing.
 */
export const GalleryWrapper: FC<{ children: React.ReactNode }> = ({ children }) => {
  const threadRuntime = useThreadRuntime();

  const attachImageToComposer = useCallback(async (imageUrl: string, name: string) => {
    try {
      // Fetch the image as a blob
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Determine file extension from content type
      const contentType = blob.type || 'image/jpeg';
      const extension = contentType.split('/')[1] || 'jpg';

      // Create a File object from the blob
      const fileName = name ? `${name.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}` : `gallery_image.${extension}`;
      const file = new File([blob], fileName, { type: contentType });

      // Add the file as an attachment to the composer
      await threadRuntime.composer.addAttachment(file);

      console.log(`[Gallery] Attached image: ${fileName}`);
    } catch (error) {
      console.error('[Gallery] Failed to attach image:', error);
      throw error;
    }
  }, [threadRuntime]);

  return (
    <GalleryProvider attachImageToComposer={attachImageToComposer}>
      {children}
    </GalleryProvider>
  );
};

export const SessionActivityWatcher: FC<{ onSessionActivity?: (message: { id?: string; role: "user" | "assistant" }) => void }> = ({ onSessionActivity }) => {
  const messages = useThread((t) => t.messages);
  const previousCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!onSessionActivity) {
      previousCountRef.current = messages.length;
      return;
    }

    if (previousCountRef.current === null) {
      previousCountRef.current = messages.length;
      return;
    }

    if (messages.length > previousCountRef.current) {
      const newMessages = messages.slice(previousCountRef.current);
      const recent = [...newMessages]
        .reverse()
        .find((msg) => msg.role === "user" || msg.role === "assistant");

      if (recent) {
        onSessionActivity({ id: recent.id, role: recent.role as "user" | "assistant" });
      }
    }

    previousCountRef.current = messages.length;
  }, [messages, onSessionActivity]);

  return null;
};

export const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <Button
        variant="outline"
        size="icon"
        className="absolute -top-10 rounded-full disabled:invisible bg-terminal-cream text-terminal-dark hover:bg-terminal-dark hover:text-terminal-cream shadow-md"
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    </ThreadPrimitive.ScrollToBottom>
  );
};
