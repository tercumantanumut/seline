"use client";

/**
 * ActionIndicators — Renders visual overlays for browser session actions.
 *
 * Placed as an absolutely-positioned sibling inside the screencast container.
 * All indicator types use CSS transform/opacity animations for performance.
 */

import { type FC, type RefObject } from "react";
import type { ActionIndicator } from "./use-action-indicators";

interface ActionIndicatorsProps {
  indicators: ActionIndicator[];
  containerRef: RefObject<HTMLDivElement | null>;
}

// ─── Keyframe styles ──────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes action-ripple {
  0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
}
@keyframes action-fade-out {
  0% { opacity: 0.6; }
  100% { opacity: 0; }
}
@keyframes action-type-pop {
  0% { transform: translate(-50%, -100%) scale(0.8); opacity: 0.7; }
  30% { transform: translate(-50%, -100%) scale(1.05); opacity: 0.6; }
  100% { transform: translate(-50%, -100%) scale(1); opacity: 0; }
}
@keyframes action-nav-bar {
  0% { width: 0%; opacity: 0.7; }
  70% { width: 100%; opacity: 0.7; }
  100% { width: 100%; opacity: 0; }
}
`;

// ─── Keyframe injection (once per page load) ─────────────────────────────────

let keyframesInjected = false;

function ensureKeyframes() {
  if (keyframesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-selene-action-indicators", "");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  keyframesInjected = true;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ClickRipple: FC<{ indicator: ActionIndicator }> = ({ indicator }) => {
  if (indicator.x == null || indicator.y == null) return null;

  const isUser = indicator.source === "user";
  const borderColor = isUser
    ? "rgba(96, 165, 250, 0.6)"   // blue-400/60
    : "rgba(167, 139, 250, 0.6)"; // violet-400/60

  return (
    <>
      {/* Outer ring */}
      <div
        style={{
          position: "absolute",
          left: indicator.x,
          top: indicator.y,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: `2px solid ${borderColor}`,
          animation: "action-ripple 700ms ease-out forwards",
          willChange: "transform, opacity",
        }}
      />
      {/* Inner ring */}
      <div
        style={{
          position: "absolute",
          left: indicator.x,
          top: indicator.y,
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: `2px solid ${borderColor}`,
          animation: "action-ripple 700ms ease-out 50ms forwards",
          willChange: "transform, opacity",
        }}
      />
    </>
  );
};

const ScrollIndicator: FC<{ indicator: ActionIndicator }> = ({ indicator }) => {
  if (indicator.x == null || indicator.y == null) return null;

  const deltaY = indicator.input?.deltaY;
  const isDown = typeof deltaY === "number" ? deltaY > 0 : true;

  return (
    <div
      style={{
        position: "absolute",
        left: indicator.x,
        top: indicator.y,
        transform: "translate(-50%, -50%)",
        fontSize: 18,
        color: "rgba(255, 255, 255, 0.4)",
        animation: "action-fade-out 500ms ease-out forwards",
        willChange: "opacity",
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {isDown ? "▼" : "▲"}
    </div>
  );
};

const TypeIndicator: FC<{ indicator: ActionIndicator }> = ({ indicator }) => {
  const text = indicator.input?.text;
  if (typeof text !== "string" || !text) return null;

  // Position at provided coordinates, or center of container
  const hasPos = indicator.x != null && indicator.y != null;

  return (
    <div
      style={{
        position: "absolute",
        ...(hasPos
          ? { left: indicator.x, top: indicator.y }
          : { left: "50%", top: "50%" }),
        fontFamily: "monospace",
        fontSize: 14,
        color: "rgba(255, 255, 255, 0.6)",
        animation: "action-type-pop 1000ms ease-out forwards",
        willChange: "transform, opacity",
        whiteSpace: "pre",
        userSelect: "none",
        textShadow: "0 1px 4px rgba(0,0,0,0.5)",
      }}
    >
      {text.length > 20 ? text.slice(0, 20) + "\u2026" : text}
    </div>
  );
};

const NavigateIndicator: FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: "linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.7), transparent)",
        animation: "action-nav-bar 700ms ease-out forwards",
        willChange: "width, opacity",
      }}
    />
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const ActionIndicators: FC<ActionIndicatorsProps> = ({ indicators }) => {
  ensureKeyframes();

  if (indicators.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {indicators.map((indicator) => {
        switch (indicator.action) {
          case "click":
            return <ClickRipple key={indicator.id} indicator={indicator} />;
          case "scroll":
            return <ScrollIndicator key={indicator.id} indicator={indicator} />;
          case "type":
            return <TypeIndicator key={indicator.id} indicator={indicator} />;
          case "navigate":
          case "open":
            return <NavigateIndicator key={indicator.id} />;
          default:
            return null;
        }
      })}
    </div>
  );
};
