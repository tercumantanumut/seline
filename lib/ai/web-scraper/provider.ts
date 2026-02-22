import { loadSettings } from "@/lib/settings/settings-manager";

export type WebScraperProvider = "firecrawl" | "local";

export function getWebScraperProvider(): WebScraperProvider {
  const settings = loadSettings();

  if (settings.webScraperProvider === "local") {
    return "local";
  }

  const hasFirecrawlKey =
    typeof process.env.FIRECRAWL_API_KEY === "string" &&
    process.env.FIRECRAWL_API_KEY.trim().length > 0;

  // Automatic local fallback keeps the unified web tool usable even without Firecrawl.
  return hasFirecrawlKey ? "firecrawl" : "local";
}

export function isWebScraperConfigured(): boolean {
  // Always true: local scraper is the baseline, Firecrawl is optional enhancement.
  return true;
}
