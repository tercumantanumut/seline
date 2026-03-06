/**
 * Wallpaper Gallery
 *
 * 30 curated high-quality wallpapers from Unsplash (free for any use).
 * Categorized for use as chat backgrounds, homepage backgrounds, etc.
 * All URLs use Unsplash's image CDN with optimized dimensions.
 */

export interface Wallpaper {
  id: string;
  url: string;
  thumbnailUrl: string;
  category: WallpaperCategory;
  label: string;
  credit: string;
  /** Dominant color for loading placeholder */
  dominantColor: string;
}

export type WallpaperCategory =
  | "abstract"
  | "gradient"
  | "nature"
  | "minimal"
  | "dark"
  | "texture";

export const WALLPAPER_CATEGORIES: { id: WallpaperCategory; label: string }[] = [
  { id: "abstract", label: "Abstract" },
  { id: "gradient", label: "Gradients" },
  { id: "nature", label: "Nature" },
  { id: "minimal", label: "Minimal" },
  { id: "dark", label: "Dark" },
  { id: "texture", label: "Textures" },
];

/** Unsplash photo helper — produces optimized URLs */
function unsplash(photoId: string, w = 1920, q = 80): { url: string; thumbnailUrl: string } {
  const base = `https://images.unsplash.com/photo-${photoId}`;
  return {
    url: `${base}?w=${w}&q=${q}&auto=format&fit=crop`,
    thumbnailUrl: `${base}?w=400&q=60&auto=format&fit=crop`,
  };
}

export const WALLPAPERS: Wallpaper[] = [
  // === ABSTRACT (5) ===
  {
    id: "abstract-1",
    ...unsplash("1557672172-298e090bd0f1"),
    category: "abstract",
    label: "Colorful Fluid",
    credit: "Pawel Czerwinski",
    dominantColor: "#2D1B69",
  },
  {
    id: "abstract-2",
    ...unsplash("1618005182384-a83a8bd57fbe"),
    category: "abstract",
    label: "Neon Swirl",
    credit: "Pawel Czerwinski",
    dominantColor: "#1A0533",
  },
  {
    id: "abstract-3",
    ...unsplash("1579546929518-9e396f3cc809"),
    category: "abstract",
    label: "Gradient Mesh",
    credit: "Gradienta",
    dominantColor: "#4A0E4E",
  },
  {
    id: "abstract-4",
    ...unsplash("1550684376-efcbd6e3f031"),
    category: "abstract",
    label: "Color Smoke",
    credit: "Pawel Czerwinski",
    dominantColor: "#0D0D0D",
  },
  {
    id: "abstract-5",
    ...unsplash("1614850523296-d8c1af93d400"),
    category: "abstract",
    label: "Crystal Prism",
    credit: "Codioful",
    dominantColor: "#1E0A3C",
  },

  // === GRADIENTS (5) ===
  {
    id: "gradient-1",
    ...unsplash("1620641788421-7a1c342ea42e"),
    category: "gradient",
    label: "Purple Haze",
    credit: "Gradienta",
    dominantColor: "#2E1065",
  },
  {
    id: "gradient-2",
    ...unsplash("1635776062127-d379bfcba9f8"),
    category: "gradient",
    label: "Sunset Blend",
    credit: "Gradienta",
    dominantColor: "#FF6B35",
  },
  {
    id: "gradient-3",
    ...unsplash("1557683316-973673baf926"),
    category: "gradient",
    label: "Ocean Gradient",
    credit: "Pawel Czerwinski",
    dominantColor: "#0077B6",
  },
  {
    id: "gradient-4",
    ...unsplash("1614854262318-831574f15f1f"),
    category: "gradient",
    label: "Coral Drift",
    credit: "Codioful",
    dominantColor: "#FF5733",
  },
  {
    id: "gradient-5",
    ...unsplash("1604076913837-52ab5f7c1ac2"),
    category: "gradient",
    label: "Teal Aurora",
    credit: "Gradienta",
    dominantColor: "#134E4A",
  },

  // === NATURE (5) ===
  {
    id: "nature-1",
    ...unsplash("1506905925346-21bda4d32df4"),
    category: "nature",
    label: "Mountain Peaks",
    credit: "Benjamin Voros",
    dominantColor: "#1A1A2E",
  },
  {
    id: "nature-2",
    ...unsplash("1507400492013-162706c8c05e"),
    category: "nature",
    label: "Starry Night",
    credit: "Vincentiu Solomon",
    dominantColor: "#0A0E27",
  },
  {
    id: "nature-3",
    ...unsplash("1518837695005-2083093ee35b"),
    category: "nature",
    label: "Ocean Wave",
    credit: "Matt Hardy",
    dominantColor: "#0C4A6E",
  },
  {
    id: "nature-4",
    ...unsplash("1441974231531-c6227db76b6e"),
    category: "nature",
    label: "Deep Forest",
    credit: "Luca Bravo",
    dominantColor: "#1B4332",
  },
  {
    id: "nature-5",
    ...unsplash("1534088568595-a066f410bcda"),
    category: "nature",
    label: "Desert Dunes",
    credit: "Keith Hardy",
    dominantColor: "#C2A76C",
  },

  // === MINIMAL (5) ===
  {
    id: "minimal-1",
    ...unsplash("1553356084-58ef4a67b2a7"),
    category: "minimal",
    label: "Soft Pink",
    credit: "Pawel Czerwinski",
    dominantColor: "#FECDD3",
  },
  {
    id: "minimal-2",
    ...unsplash("1558591710-4b4a1ae0f04d"),
    category: "minimal",
    label: "White Paper",
    credit: "Scott Webb",
    dominantColor: "#F5F5F4",
  },
  {
    id: "minimal-3",
    ...unsplash("1517483000871-1dbf64a6e1c6"),
    category: "minimal",
    label: "Calm Water",
    credit: "Matthew Henry",
    dominantColor: "#BAE6FD",
  },
  {
    id: "minimal-4",
    ...unsplash("1519681393784-d120267933ba"),
    category: "minimal",
    label: "Snow Mountain",
    credit: "Benjamin Voros",
    dominantColor: "#1E293B",
  },
  {
    id: "minimal-5",
    ...unsplash("1528459801416-a9e53bbf4e17"),
    category: "minimal",
    label: "Soft Fog",
    credit: "Tim Swaan",
    dominantColor: "#D1D5DB",
  },

  // === DARK (5) ===
  {
    id: "dark-1",
    ...unsplash("1534796636912-3b95b3ab5986"),
    category: "dark",
    label: "Galaxy",
    credit: "Shot by Cerqueira",
    dominantColor: "#0C0A1D",
  },
  {
    id: "dark-2",
    ...unsplash("1550684848-fac1c5b4e853"),
    category: "dark",
    label: "Dark Abstract",
    credit: "Pawel Czerwinski",
    dominantColor: "#111111",
  },
  {
    id: "dark-3",
    ...unsplash("1502134249126-9f3755a50d78"),
    category: "dark",
    label: "Night Sky",
    credit: "Klemen Vrankar",
    dominantColor: "#0F172A",
  },
  {
    id: "dark-4",
    ...unsplash("1536514498073-50e69d39c6cf"),
    category: "dark",
    label: "Dark Mountains",
    credit: "Bailey Zindel",
    dominantColor: "#1C1917",
  },
  {
    id: "dark-5",
    ...unsplash("1451187580459-43490279c0fa"),
    category: "dark",
    label: "Earth at Night",
    credit: "NASA",
    dominantColor: "#020617",
  },

  // === TEXTURES (5) ===
  {
    id: "texture-1",
    ...unsplash("1558618666-fcd25c85f82e"),
    category: "texture",
    label: "Concrete",
    credit: "Annie Spratt",
    dominantColor: "#78716C",
  },
  {
    id: "texture-2",
    ...unsplash("1550859492-d5da9d8e45f3"),
    category: "texture",
    label: "Marble",
    credit: "Henry & Co.",
    dominantColor: "#E7E5E4",
  },
  {
    id: "texture-3",
    ...unsplash("1546484396-fb3fc6f95f98"),
    category: "texture",
    label: "Dark Fabric",
    credit: "Eugene Golovesov",
    dominantColor: "#1C1917",
  },
  {
    id: "texture-4",
    ...unsplash("1557682250-33bd709cbe85"),
    category: "texture",
    label: "Paper Grain",
    credit: "Pawel Czerwinski",
    dominantColor: "#FEF3C7",
  },
  {
    id: "texture-5",
    ...unsplash("1560015534-cee980ba7e13"),
    category: "texture",
    label: "Dark Wood",
    credit: "Toa Heftiba",
    dominantColor: "#292524",
  },
];

/** Get a wallpaper by ID */
export function getWallpaperById(id: string): Wallpaper | undefined {
  return WALLPAPERS.find((w) => w.id === id);
}

/** Background config for settings storage */
export interface BackgroundConfig {
  type: "none" | "wallpaper" | "color" | "url" | "video";
  /** Wallpaper ID (when type="wallpaper") */
  wallpaperId?: string;
  /** CSS color value (when type="color") */
  color?: string;
  /** External URL (when type="url") */
  url?: string;
  /** Video wallpaper ID (when type="video") */
  videoId?: string;
  /** Opacity 0-100 (how much the background shows through) */
  opacity?: number;
  /** Blur in px */
  blur?: number;
}

