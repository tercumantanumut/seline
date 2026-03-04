/**
 * Video Wallpaper Catalog
 *
 * 20 curated looping video backgrounds from Mixkit.
 * All videos: Mixkit Stock Video Free License (commercial & personal use, no attribution required).
 * CDN: assets.mixkit.co — stable public URLs.
 *
 * Videos are 1080p H.264 MP4 — browser-universal, GPU-composited, streamed on demand.
 * Designed to loop seamlessly as ambient background layers behind UI at reduced opacity.
 */

export interface VideoWallpaper {
  id: string;
  /** Display label */
  label: string;
  /** Category for filtering */
  category: VideoWallpaperCategory;
  /** MP4 video URL (1080p H.264) */
  videoUrl: string;
  /** Poster/thumbnail image URL */
  posterUrl: string;
  /** Dominant color for loading placeholder */
  dominantColor: string;
  /** Video duration in seconds */
  duration: number;
  /** Credit — source platform */
  credit: string;
}

export type VideoWallpaperCategory =
  | "forest"
  | "ocean"
  | "night"
  | "aerial"
  | "sky";

export const VIDEO_WALLPAPER_CATEGORIES: {
  id: VideoWallpaperCategory;
  label: string;
}[] = [
  { id: "forest", label: "Forest" },
  { id: "ocean", label: "Ocean" },
  { id: "night", label: "Night Sky" },
  { id: "aerial", label: "Aerial" },
  { id: "sky", label: "Sky" },
];

/** Mixkit CDN helper — produces 1080p video + poster URLs from a video ID */
function mixkit(
  videoId: number,
  thumbIndex = 0
): { videoUrl: string; posterUrl: string } {
  const base = `https://assets.mixkit.co/videos/${videoId}`;
  return {
    videoUrl: `${base}/${videoId}-1080.mp4`,
    posterUrl: `${base}/${videoId}-thumb-1080-${thumbIndex}.jpg`,
  };
}

export const VIDEO_WALLPAPERS: VideoWallpaper[] = [
  // ═══════════════════════════════════════════
  // FOREST (5) — drone/aerial forest footage
  // ═══════════════════════════════════════════
  {
    id: "forest-1",
    ...mixkit(50847),
    label: "Tranquil Forest",
    category: "forest",
    dominantColor: "#2D5016",
    duration: 24,
    credit: "Mixkit",
  },
  {
    id: "forest-2",
    ...mixkit(529),
    label: "Forest Stream",
    category: "forest",
    dominantColor: "#1B4332",
    duration: 36,
    credit: "Mixkit",
  },
  {
    id: "forest-3",
    ...mixkit(41378),
    label: "Forest Aerial",
    category: "forest",
    dominantColor: "#2D5A27",
    duration: 25,
    credit: "Mixkit",
  },
  {
    id: "forest-4",
    ...mixkit(5039, 1),
    label: "Jungle Canopy",
    category: "forest",
    dominantColor: "#1D3D1B",
    duration: 31,
    credit: "Mixkit",
  },
  {
    id: "forest-5",
    ...mixkit(41545),
    label: "Mountain Forest",
    category: "forest",
    dominantColor: "#2E5930",
    duration: 24,
    credit: "Mixkit",
  },

  // ═══════════════════════════════════════════
  // OCEAN (3) — waves, aerial sea, coastal
  // ═══════════════════════════════════════════
  {
    id: "ocean-1",
    ...mixkit(44370),
    label: "Ocean Sunset Flight",
    category: "ocean",
    dominantColor: "#1E3A5F",
    duration: 30,
    credit: "Mixkit",
  },
  {
    id: "ocean-2",
    ...mixkit(44392),
    label: "Coastal Flight",
    category: "ocean",
    dominantColor: "#0C4A6E",
    duration: 26,
    credit: "Mixkit",
  },
  {
    id: "ocean-3",
    ...mixkit(2091),
    label: "Turquoise Waves",
    category: "ocean",
    dominantColor: "#0E7490",
    duration: 32,
    credit: "Mixkit",
  },

  // ═══════════════════════════════════════════
  // NIGHT SKY (4) — stars, milky way, night
  // ═══════════════════════════════════════════
  {
    id: "night-1",
    ...mixkit(4148),
    label: "Milky Way",
    category: "night",
    dominantColor: "#0A0E27",
    duration: 16,
    credit: "Mixkit",
  },
  {
    id: "night-2",
    // Newer Mixkit video — uses hashed CDN URLs
    videoUrl: "https://assets.mixkit.co/069cihu8taaw66sfkyxv56ozpomu",
    posterUrl: "https://assets.mixkit.co/jb80dnjmmeuf4p32xws1byni2uty",
    label: "Dark Starry Night",
    category: "night",
    dominantColor: "#0C0A1D",
    duration: 11,
    credit: "Mixkit",
  },
  {
    id: "night-3",
    ...mixkit(1704),
    label: "Lakeside Stars",
    category: "night",
    dominantColor: "#0F172A",
    duration: 12,
    credit: "Mixkit",
  },
  {
    id: "night-4",
    ...mixkit(39768),
    label: "Starfield",
    category: "night",
    dominantColor: "#050714",
    duration: 12,
    credit: "Mixkit",
  },

  // ═══════════════════════════════════════════
  // AERIAL (5) — cities, roads, landscapes
  // ═══════════════════════════════════════════
  {
    id: "aerial-1",
    ...mixkit(41375),
    label: "City at Dusk",
    category: "aerial",
    dominantColor: "#1C1917",
    duration: 14,
    credit: "Mixkit",
  },
  {
    id: "aerial-2",
    ...mixkit(41537),
    label: "Mountain Road",
    category: "aerial",
    dominantColor: "#1B4332",
    duration: 29,
    credit: "Mixkit",
  },
  {
    id: "aerial-3",
    ...mixkit(5008),
    label: "Bay from Above",
    category: "aerial",
    dominantColor: "#0891B2",
    duration: 15,
    credit: "Mixkit",
  },
  {
    id: "aerial-4",
    ...mixkit(41389),
    label: "Road through Nature",
    category: "aerial",
    dominantColor: "#365314",
    duration: 10,
    credit: "Mixkit",
  },
  {
    id: "aerial-5",
    ...mixkit(4999),
    label: "Bay Sunset",
    category: "aerial",
    dominantColor: "#7C2D12",
    duration: 10,
    credit: "Mixkit",
  },

  // ═══════════════════════════════════════════
  // SKY (3) — clouds, atmosphere, timelapse
  // ═══════════════════════════════════════════
  {
    id: "sky-1",
    ...mixkit(2408),
    label: "Drifting Clouds",
    category: "sky",
    dominantColor: "#3B82F6",
    duration: 18,
    credit: "Mixkit",
  },
  {
    id: "sky-2",
    // Newer Mixkit video — uses hashed CDN URLs
    videoUrl: "https://assets.mixkit.co/npl7mbwmzqmgrbd0oi6obaqrvtj5",
    posterUrl: "https://assets.mixkit.co/ndov76tlmx4x4j5l6xu9jmdhcnhx",
    label: "Through the Clouds",
    category: "sky",
    dominantColor: "#166534",
    duration: 11,
    credit: "Mixkit",
  },
  {
    id: "sky-3",
    ...mixkit(26108),
    label: "Wind-Blown Clouds",
    category: "sky",
    dominantColor: "#60A5FA",
    duration: 9,
    credit: "Mixkit",
  },
];

/** Get a video wallpaper by ID */
export function getVideoWallpaperById(
  id: string
): VideoWallpaper | undefined {
  return VIDEO_WALLPAPERS.find((v) => v.id === id);
}
