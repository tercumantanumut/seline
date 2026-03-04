"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  isRecording: boolean;
  analyserNode: AnalyserNode | null;
  className?: string;
}

const BAR_COUNT = 24;
const BAR_MIN_HEIGHT = 2;
const BAR_MAX_HEIGHT = 28;

export function VoiceWaveform({ isRecording, analyserNode, className }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const canvasSizedRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);

  // Elapsed timer
  useEffect(() => {
    if (!isRecording) {
      setElapsed(0);
      return;
    }

    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 100);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Canvas waveform animation
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Only resize canvas buffer when dimensions actually change (avoids GPU realloc per frame)
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (!canvasSizedRef.current || canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvasSizedRef.current = true;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const barWidth = Math.max(2, (width - (BAR_COUNT - 1) * 2) / BAR_COUNT);
    const gap = 2;

    let frequencies: Uint8Array<ArrayBuffer>;

    if (analyserNode && isRecording) {
      frequencies = new Uint8Array(analyserNode.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      analyserNode.getByteFrequencyData(frequencies);
    } else {
      frequencies = new Uint8Array(BAR_COUNT).fill(0) as Uint8Array<ArrayBuffer>;
    }

    const step = Math.max(1, Math.floor(frequencies.length / BAR_COUNT));

    for (let i = 0; i < BAR_COUNT; i++) {
      const freqIndex = Math.min(i * step, frequencies.length - 1);
      const normalized = frequencies[freqIndex] / 255;
      const barHeight = BAR_MIN_HEIGHT + normalized * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT);

      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      // Terminal green gradient based on amplitude
      const alpha = 0.4 + normalized * 0.6;
      ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    }

    if (isRecording) {
      animationRef.current = requestAnimationFrame(draw);
    }
  }, [analyserNode, isRecording]);

  useEffect(() => {
    if (isRecording) {
      animationRef.current = requestAnimationFrame(draw);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRecording, draw]);

  const formatElapsed = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!isRecording) return null;

  return (
    <div className={cn("flex items-center gap-3 px-3 py-2", className)}>
      {/* Recording dot */}
      <div className="relative flex items-center justify-center">
        <span className="absolute size-3 rounded-full bg-red-500/30 animate-ping" />
        <span className="relative size-2 rounded-full bg-red-500" />
      </div>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        className="h-8 flex-1"
        style={{ minWidth: 120 }}
      />

      {/* Timer */}
      <span className="text-xs font-mono text-terminal-muted tabular-nums min-w-[3ch]">
        {formatElapsed(elapsed)}
      </span>
    </div>
  );
}
