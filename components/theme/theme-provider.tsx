"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { BackgroundConfig } from "@/lib/personalization/wallpapers";
import { DEFAULT_THEME_PRESET, type ThemePresetId } from "@/lib/personalization/theme-presets";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "seline-theme";
const PRESET_STORAGE_KEY = "seline-theme-preset";
const HOMEPAGE_BG_STORAGE_KEY = "seline-homepage-bg";
const CHAT_BG_STORAGE_KEY = "seline-chat-bg";

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  themePreset: ThemePresetId;
  setThemePreset: (preset: ThemePresetId) => void;
  homepageBackground: BackgroundConfig;
  setHomepageBackground: (bg: BackgroundConfig) => void;
  chatBackground: BackgroundConfig;
  setChatBackground: (bg: BackgroundConfig) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

const getStoredTheme = (): ThemePreference | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : null;
  } catch {
    return null;
  }
};

const getStoredPreset = (): ThemePresetId | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PRESET_STORAGE_KEY) as ThemePresetId | null;
  } catch {
    return null;
  }
};

function getStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const resolveTheme = (theme: ThemePreference): ResolvedTheme => {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme: ThemePreference): ResolvedTheme => {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  root.dataset.theme = theme;
  return resolved;
};

const applyPreset = (preset: ThemePresetId): void => {
  const root = document.documentElement;
  // "ember" is the default — no data attribute needed (no CSS override)
  if (preset === "ember") {
    delete root.dataset.themePreset;
  } else {
    root.dataset.themePreset = preset;
  }
};

const DEFAULT_BG: BackgroundConfig = { type: "none" };

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemePreference;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<ThemePreference>(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(initialTheme));
  const [themePreset, setThemePresetState] = useState<ThemePresetId>(DEFAULT_THEME_PRESET);
  const [homepageBackground, setHomepageBgState] = useState<BackgroundConfig>(DEFAULT_BG);
  const [chatBackground, setChatBgState] = useState<BackgroundConfig>(DEFAULT_BG);

  // Load stored values on mount
  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored ?? initialTheme);
    const storedPreset = getStoredPreset();
    if (storedPreset) setThemePresetState(storedPreset);
    setHomepageBgState(getStoredJson(HOMEPAGE_BG_STORAGE_KEY, DEFAULT_BG));
    setChatBgState(getStoredJson(CHAT_BG_STORAGE_KEY, DEFAULT_BG));
  }, [initialTheme]);

  // Apply theme mode
  useEffect(() => {
    setResolvedTheme(applyTheme(theme));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  // Apply preset
  useEffect(() => {
    applyPreset(themePreset);
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, themePreset);
    } catch {
      // Ignore
    }
  }, [themePreset]);

  // System theme media query listener
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolvedTheme(applyTheme("system"));
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  const setThemePreset = (preset: ThemePresetId) => {
    setThemePresetState(preset);
  };

  const setHomepageBackground = (bg: BackgroundConfig) => {
    setHomepageBgState(bg);
    try {
      window.localStorage.setItem(HOMEPAGE_BG_STORAGE_KEY, JSON.stringify(bg));
    } catch {
      // Ignore
    }
  };

  const setChatBackground = (bg: BackgroundConfig) => {
    setChatBgState(bg);
    try {
      window.localStorage.setItem(CHAT_BG_STORAGE_KEY, JSON.stringify(bg));
    } catch {
      // Ignore
    }
  };

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      themePreset,
      setThemePreset,
      homepageBackground,
      setHomepageBackground,
      chatBackground,
      setChatBackground,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, resolvedTheme, themePreset, homepageBackground, chatBackground]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
