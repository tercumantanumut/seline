"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

interface MultiViewManagerProps {
  children: React.ReactNode;
  viewKey: string; // e.g., "home" or "chat-{characterId}"
  keepAlive?: boolean;
}

/**
 * MultiViewManager keeps components mounted in the background using CSS visibility.
 * This prevents unmounting of active chat sessions when navigating away.
 *
 * Usage:
 * <MultiViewManager viewKey="chat-123" keepAlive={true}>
 *   <ChatInterface ... />
 * </MultiViewManager>
 */
export function MultiViewManager({ children, viewKey, keepAlive = false }: MultiViewManagerProps) {
  const pathname = usePathname();
  const mountedViews = useRef<Set<string>>(new Set());

  const isActive = pathname.includes(viewKey) || pathname === "/";

  useEffect(() => {
    if (isActive || keepAlive) {
      mountedViews.current.add(viewKey);
    }
  }, [isActive, keepAlive, viewKey]);

  const shouldRender = mountedViews.current.has(viewKey);
  const isVisible = isActive;

  if (!shouldRender) return null;

  return (
    <div style={{ display: isVisible ? "block" : "none" }}>
      {children}
    </div>
  );
}
