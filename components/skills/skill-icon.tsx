"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface SkillIconProps {
  icon: string | null;
  displayName: string;
  size?: 24 | 32 | 40 | 48;
  className?: string;
}

const FALLBACK_COLORS = [
  "bg-emerald-100 text-emerald-800",
  "bg-cyan-100 text-cyan-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-lime-100 text-lime-800",
];

function getInitials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "SK";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function hashToColorIndex(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % FALLBACK_COLORS.length;
}

export function SkillIcon({ icon, displayName, size = 32, className }: SkillIconProps) {
  const [failed, setFailed] = useState(false);

  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const colorClass = useMemo(() => FALLBACK_COLORS[hashToColorIndex(displayName)], [displayName]);

  if (!icon || failed) {
    return (
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-full font-mono text-[10px] font-semibold",
          colorClass,
          className
        )}
        style={{ width: size, height: size }}
        aria-label={displayName}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={`/icons/skills/${icon}`}
      alt={displayName}
      width={size}
      height={size}
      className={cn("rounded-md object-contain", className)}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
