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
  { id: "scuderia",    label: "Scuderia",    hsl: "0 85% 48%",   hslDark: "0 85% 54%",   hex: "#DC2626" },
  { id: "papaya",      label: "Papaya",      hsl: "25 95% 53%",  hslDark: "25 95% 58%",  hex: "#F97316" },
  { id: "petronas",    label: "Petronas",    hsl: "174 85% 42%", hslDark: "174 85% 50%", hex: "#10B4A6" },
  { id: "alpine",      label: "Alpine",      hsl: "215 90% 55%", hslDark: "215 90% 62%", hex: "#2563EB" },
  { id: "racinggreen", label: "Racing Green", hsl: "152 80% 35%", hslDark: "152 80% 44%", hex: "#0D9255" },
  { id: "pitlane",     label: "Pit Lane",    hsl: "270 80% 58%", hslDark: "270 80% 64%", hex: "#8B5CF6" },
  { id: "podium",      label: "Podium",      hsl: "42 95% 50%",  hslDark: "42 95% 55%",  hex: "#EAB308" },
  { id: "haas",        label: "Haas",        hsl: "345 85% 50%", hslDark: "345 85% 56%", hex: "#E11D48" },
  { id: "gulf",        label: "Gulf",        hsl: "195 85% 52%", hslDark: "195 85% 58%", hex: "#0EA5E9" },
  { id: "marshalsafe", label: "Marshal",     hsl: "55 90% 48%",  hslDark: "55 90% 54%",  hex: "#CAAD08" },
  { id: "drs",         label: "DRS",         hsl: "142 75% 40%", hslDark: "142 75% 48%", hex: "#16A34A" },
  { id: "slick",       label: "Slick",       hsl: "240 70% 55%", hslDark: "240 70% 62%", hex: "#4F46E5" },
  { id: "champagne",   label: "Champagne",   hsl: "330 80% 55%", hslDark: "330 80% 62%", hex: "#DB2777" },
  { id: "monaco",      label: "Monaco",      hsl: "12 90% 52%",  hslDark: "12 90% 58%",  hex: "#EA580C" },
  { id: "titanium",    label: "Titanium",    hsl: "200 30% 48%", hslDark: "200 30% 56%", hex: "#5586A0" },
  { id: "carbon",      label: "Carbon",      hsl: "295 75% 52%", hslDark: "295 75% 60%", hex: "#A855F7" },
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
