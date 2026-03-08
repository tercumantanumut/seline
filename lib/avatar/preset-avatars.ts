// =============================================================================
// Preset 3D Avatar Catalog
// =============================================================================

export interface PresetAvatar {
  id: string;
  name: string;
  modelUrl: string;
  bodyType: "M" | "F";
  /** Unique accent color for visual distinction in the selector */
  accent: string;
  /** Initials shown in the avatar circle */
  initials: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: "default", name: "Default", modelUrl: "/avatars/default.glb", bodyType: "F", accent: "#8b5cf6", initials: "De" },
  { id: "aria", name: "Aria", modelUrl: "/avatars/aria.glb", bodyType: "F", accent: "#ec4899", initials: "Ar" },
  { id: "kai", name: "Kai", modelUrl: "/avatars/kai.glb", bodyType: "M", accent: "#0ea5e9", initials: "Ka" },
  { id: "playerzero", name: "Player Zero", modelUrl: "/avatars/playerzero.glb", bodyType: "M", accent: "#f97316", initials: "PZ" },
];

export function getPresetById(id: string): PresetAvatar | undefined {
  return PRESET_AVATARS.find((p) => p.id === id);
}
