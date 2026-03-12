"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GripVertical,
  Volume2Icon,
  VolumeXIcon,
  MinusIcon,
  UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarRenderer } from "./avatar-renderer";
import type { Avatar3DConfig, Avatar3DRef } from "./types";

// =============================================================================
// Types
// =============================================================================

interface AvatarPipWidgetProps {
  avatarRef: React.RefObject<Avatar3DRef | null>;
  config: Avatar3DConfig;
  muted: boolean;
  hidden: boolean;
  onMuteToggle: () => void;
  onHide: () => void;
  onShow: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const INSET = 16;
const WIDGET_W = 280;
const WIDGET_H = 360;
const DEV_LOGS_BUTTON_SIZE = 44;
const FLOATING_BUTTON_GAP = 12;
const HIDDEN_AVATAR_RIGHT_OFFSET = INSET + DEV_LOGS_BUTTON_SIZE + FLOATING_BUTTON_GAP;

// =============================================================================
// Component
// =============================================================================

function AvatarPipWidget({
  avatarRef,
  config,
  muted,
  hidden,
  onMuteToggle,
  onHide,
  onShow,
}: AvatarPipWidgetProps) {
  // ── Drag state ──
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ sx: 0, sy: 0, ox: 0, oy: 0 });
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === "undefined") return { x: -1, y: -1 };
    return {
      x: window.innerWidth - WIDGET_W - INSET,
      y: window.innerHeight - WIDGET_H - INSET,
    };
  });

  // ── Drag on header bar ──
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      isDraggingRef.current = true;
      dragStartRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    },
    [pos],
  );

  // ── Snap to nearest corner ──
  const snapToCorner = useCallback((x: number, y: number) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = x + WIDGET_W / 2;
    const cy = y + WIDGET_H / 2;

    const corners = [
      { x: INSET, y: INSET },                                   // top-left
      { x: w - WIDGET_W - INSET, y: INSET },                    // top-right
      { x: INSET, y: h - WIDGET_H - INSET },                    // bottom-left
      { x: w - WIDGET_W - INSET, y: h - WIDGET_H - INSET },    // bottom-right
    ];

    let nearest = corners[0];
    let minDist = Infinity;
    for (const c of corners) {
      const dx = cx - (c.x + WIDGET_W / 2);
      const dy = cy - (c.y + WIDGET_H / 2);
      const dist = dx * dx + dy * dy;
      if (dist < minDist) { minDist = dist; nearest = c; }
    }
    return nearest;
  }, []);

  useEffect(() => {
    const handleMove = (e: globalThis.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const { sx, sy, ox, oy } = dragStartRef.current;
      setPos({ x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) });
    };
    const handleUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setPos((prev) => snapToCorner(prev.x, prev.y));
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [snapToCorner]);

  // ── Render ──
  if (pos.x === -1) return null;

  return (
    <AnimatePresence mode="wait">
      {!hidden ? (
        <motion.div
          key="avatar-pip"
          className={cn(
            "fixed z-50 pointer-events-auto select-none",
            "bg-card/80 backdrop-blur-xl border border-border/50",
            "rounded-2xl shadow-2xl overflow-hidden",
            "flex flex-col",
          )}
          style={{ width: WIDGET_W, height: WIDGET_H }}
          initial={{ left: pos.x, top: pos.y, scale: 0.8, opacity: 0 }}
          animate={{ left: pos.x, top: pos.y, scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Header — drag handle + controls */}
          <div
            className="flex items-center h-8 px-2 shrink-0 bg-muted/40 cursor-grab active:cursor-grabbing"
            onPointerDown={handlePointerDown}
          >
            <GripVertical className="size-3.5 text-muted-foreground/60 shrink-0" />
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onMuteToggle(); }}
                className="size-7 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-sm hover:bg-background/90 transition-colors cursor-pointer"
                title={muted ? "Unmute avatar" : "Mute avatar"}
              >
                {muted ? (
                  <VolumeXIcon className="size-3.5 text-muted-foreground" />
                ) : (
                  <Volume2Icon className="size-3.5 text-muted-foreground" />
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onHide(); }}
                className="size-7 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-sm hover:bg-background/90 transition-colors cursor-pointer"
                title="Minimize avatar"
              >
                <MinusIcon className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* 3D canvas — drag to rotate the avatar */}
          <div className="flex-1 min-h-0">
            <AvatarRenderer ref={avatarRef} config={config} className="rounded-b-2xl" />
          </div>
        </motion.div>
      ) : (
        <motion.button
          key="avatar-restore"
          onClick={onShow}
          className={cn(
            "fixed z-[60] pointer-events-auto",
            "h-9 px-3 rounded-full",
            "bg-card/95 backdrop-blur-md border border-border shadow-lg",
            "flex items-center gap-2",
            "hover:bg-card hover:shadow-xl hover:scale-105 transition-all cursor-pointer",
          )}
          style={{ right: HIDDEN_AVATAR_RIGHT_OFFSET, bottom: INSET }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.2 }}
          title="Show avatar"
        >
          <UserIcon className="size-4 text-foreground" />
          <span className="text-xs font-medium text-foreground">Avatar</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export { AvatarPipWidget };
export type { AvatarPipWidgetProps };
