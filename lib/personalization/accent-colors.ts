/**
 * Agent Accent Colors
 *
 * Curated palette of 16 accent colors for visually differentiating agents.
 * Colors are assigned deterministically based on character ID hash so they
 * persist across sessions without needing a database migration.
 *
 * Manual override is supported via `character.metadata.accentColor`.
 */

export interface AccentColor {
  /** Unique identifier (e.g. "terracotta") */
  id: string;
  /** Display label */
  label: string;
  /** HSL values (hue saturation% lightness%) for light mode */
  hsl: string;
  /** HSL values for dark mode (slightly adjusted for contrast) */
  hslDark: string;
  /** Hex value (for previews/swatches) */
  hex: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: "terracotta",  label: "Terracotta",  hsl: "18 49% 54%",  hslDark: "18 49% 58%",  hex: "#C2714F" },
  { id: "ocean",       label: "Ocean",       hsl: "200 80% 50%", hslDark: "200 80% 55%", hex: "#1A8FE3" },
  { id: "emerald",     label: "Emerald",     hsl: "152 60% 42%", hslDark: "152 60% 48%", hex: "#2BA36B" },
  { id: "violet",      label: "Violet",      hsl: "262 60% 58%", hslDark: "262 60% 64%", hex: "#7C5CBF" },
  { id: "amber",       label: "Amber",       hsl: "41 100% 50%", hslDark: "41 100% 55%", hex: "#FFB000" },
  { id: "rose",        label: "Rose",        hsl: "340 65% 55%", hslDark: "340 65% 60%", hex: "#D44A7A" },
  { id: "cyan",        label: "Cyan",        hsl: "185 70% 45%", hslDark: "185 70% 52%", hex: "#22A3B3" },
  { id: "coral",       label: "Coral",       hsl: "10 75% 60%",  hslDark: "10 75% 65%",  hex: "#E6704A" },
  { id: "indigo",      label: "Indigo",      hsl: "230 65% 55%", hslDark: "230 65% 62%", hex: "#4A5AC7" },
  { id: "lime",        label: "Lime",        hsl: "82 60% 45%",  hslDark: "82 60% 52%",  hex: "#6BA332" },
  { id: "fuchsia",     label: "Fuchsia",     hsl: "292 60% 55%", hslDark: "292 60% 62%", hex: "#B34ABF" },
  { id: "teal",        label: "Teal",        hsl: "170 55% 42%", hslDark: "170 55% 50%", hex: "#30A396" },
  { id: "gold",        label: "Gold",        hsl: "48 85% 50%",  hslDark: "48 85% 55%",  hex: "#EBBD17" },
  { id: "slate",       label: "Slate",       hsl: "215 20% 50%", hslDark: "215 20% 58%", hex: "#667788" },
  { id: "crimson",     label: "Crimson",     hsl: "0 72% 50%",   hslDark: "0 72% 56%",   hex: "#DC2828" },
  { id: "sage",        label: "Sage",        hsl: "140 25% 50%", hslDark: "140 25% 58%", hex: "#60996E" },
];

/** Simple FNV-1a-like hash for deterministic color assignment */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

/** Get an accent color by ID (internal helper) */
function getAccentColorById(id: string): AccentColor | undefined {
  return ACCENT_COLORS.find((c) => c.id === id);
}

/**
 * Get the accent color for a character.
 * Uses manual override from metadata if available, otherwise deterministic hash.
 */
export function getAgentAccentColor(
  characterId: string,
  metadataAccentColor?: string | null
): AccentColor {
  if (metadataAccentColor) {
    const found = getAccentColorById(metadataAccentColor);
    if (found) return found;
  }
  const index = hashString(characterId) % ACCENT_COLORS.length;
  return ACCENT_COLORS[index];
}
