/**
 * Theme Palette Presets
 *
 * Each preset defines a complete set of CSS variable overrides for both
 * light and dark modes. The "ember" preset matches the current default look.
 * Presets are applied via `data-theme-preset` attribute on <html>.
 */

export type ThemePresetId =
  | "ember"
  | "midnight"
  | "forest"
  | "monochrome"
  | "ocean"
  | "lavender"
  | "rose"
  | "aurora";

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  description: string;
  /** Preview swatch colors: [accent, background, foreground] */
  swatches: [string, string, string];
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "ember",
    label: "Ember",
    description: "Warm terracotta & cream — the classic Selene look",
    swatches: ["#C2714F", "#F5E6D3", "#1A1A1A"],
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep navy with cool cyan accents",
    swatches: ["#38BDF8", "#0F172A", "#E2E8F0"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Dark green & warm cream tones",
    swatches: ["#22C55E", "#14291E", "#E8E4D9"],
  },
  {
    id: "monochrome",
    label: "Monochrome",
    description: "Pure grayscale — minimal & clean",
    swatches: ["#A1A1AA", "#18181B", "#FAFAFA"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Dark teal depths with coral highlights",
    swatches: ["#F97316", "#0C2D3E", "#E0F2FE"],
  },
  {
    id: "lavender",
    label: "Lavender",
    description: "Muted purple with soft cream whites",
    swatches: ["#A78BFA", "#1E1B2E", "#F5F3FF"],
  },
  {
    id: "rose",
    label: "Rosé",
    description: "Warm pink tones with elegant contrast",
    swatches: ["#F472B6", "#2D1A24", "#FFF1F2"],
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Northern lights — teal greens & cool blues",
    swatches: ["#2DD4BF", "#0B1D2C", "#ECFDF5"],
  },
];

export const DEFAULT_THEME_PRESET: ThemePresetId = "ember";
