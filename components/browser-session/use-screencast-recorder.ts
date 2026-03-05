"use client";

/**
 * useScreencastRecorder — Canvas + MediaRecorder hook for browser session recording.
 *
 * Draws SSE frames onto an offscreen canvas, captures the stream via
 * canvas.captureStream(), and records to WebM VP8 using MediaRecorder.
 *
 * Zero external dependencies — uses browser-native APIs only.
 */

import { useCallback, useRef, useState, type RefObject } from "react";
import { getElectronAPI } from "@/lib/electron/types";

interface UseScreencastRecorderReturn {
  isRecording: boolean;
  hasRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  downloadRecording: (filename?: string) => Promise<void>;
  feedFrame: (dataUrl: string) => void;
}

export function useScreencastRecorder(
  canvasRef: RefObject<HTMLCanvasElement | null>
): UseScreencastRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const feedFrame = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Lazy-create an offscreen Image element for drawing
    if (!imgRef.current) {
      imgRef.current = new Image();
    }

    const img = imgRef.current;
    img.onload = () => {
      // Resize canvas to match frame dimensions (only on first frame or size change)
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
    };
    img.src = dataUrl;
  }, [canvasRef]);

  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ensure canvas has dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      canvas.width = 1280;
      canvas.height = 720;
    }

    chunksRef.current = [];
    blobRef.current = null;

    try {
      const stream = canvas.captureStream(10); // 10 FPS
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm;codecs=vp8";

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          blobRef.current = new Blob(chunksRef.current, { type: mimeType });
          setHasRecording(true);
        }
        setIsRecording(false);
      };

      recorder.start(1000); // Collect chunks every second
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setHasRecording(false);
    } catch (err) {
      console.error("[Recorder] Failed to start:", err);
    }
  }, [canvasRef]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  const downloadRecording = useCallback(async (filename?: string) => {
    const blob = blobRef.current;
    if (!blob) return;

    const name = filename || "browser-recording.webm";

    // Try Electron native save dialog first
    const api = getElectronAPI();
    if (api) {
      try {
        const result = await api.ipc.invoke("browser-session:save-recording", {
          defaultPath: name,
        }) as { success: boolean; filePath?: string; canceled?: boolean };

        if (result.success && result.filePath) {
          // Write the blob to disk via file API
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          await api.ipc.invoke("file:write", result.filePath, buffer);
          return;
        }
      } catch {
        // Fall through to browser download
      }
    }

    // Browser fallback: download via anchor element
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return {
    isRecording,
    hasRecording,
    startRecording,
    stopRecording,
    downloadRecording,
    feedFrame,
  };
}
