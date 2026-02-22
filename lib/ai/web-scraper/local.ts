import puppeteer from "puppeteer";

type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;

const DEFAULT_NAVIGATION_TIMEOUT_MS = 30000;
const NETWORK_IDLE_TIMEOUT_MS = 10000;
const MAX_WAIT_FOR_MS = 15000;

// Enable verbose logging via environment variable
const VERBOSE_LOGGING = process.env.LOCAL_SCRAPER_VERBOSE === "true";

function log(message: string, ...args: unknown[]): void {
  if (VERBOSE_LOGGING) {
    console.log(`[LOCAL-SCRAPER] ${message}`, ...args);
  }
}

function logWarn(message: string, ...args: unknown[]): void {
  console.warn(`[LOCAL-SCRAPER] ${message}`, ...args);
}

export interface LocalScrapeOptions {
  waitFor?: number;
  onlyMainContent?: boolean;
  /** Enable verbose diagnostic logging */
  verbose?: boolean;
}

export interface LocalScrapeResult {
  url: string;
  title: string;
  description?: string;
  markdown: string;
  links: string[];
  images: string[];
  ogImage?: string;
}

export interface LocalCrawlOptions {
  url: string;
  maxPages?: number;
  includePaths?: string[];
  excludePaths?: string[];
  waitFor?: number;
  onlyMainContent?: boolean;
}

export interface LocalCrawlResult {
  pages: Array<{ url: string; title?: string; markdown?: string }>;
  totalPages: number;
}

function buildMarkdown(title: string, description: string | null, text: string): string {
  const cleanedText = text.replace(/\n{3,}/g, "\n\n").trim();
  const parts: string[] = [];

  if (title) {
    parts.push(`# ${title}`.trim());
  }
  if (description) {
    parts.push(description.trim());
  }
  if (cleanedText) {
    parts.push(cleanedText);
  }

  return parts.join("\n\n").trim();
}

function normalizeUrl(input: string): string | null {
  try {
    const parsed = new URL(input);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function filterHttpUrls(items: string[]): string[] {
  return items.filter((item) => item.startsWith("http://") || item.startsWith("https://"));
}

function compilePathMatchers(patterns?: string[]): RegExp[] {
  if (!patterns || patterns.length === 0) {
    return [];
  }

  return patterns.map((pattern) => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const withWildcards = escaped.replace(/\*/g, ".*");
    return new RegExp(`^${withWildcards}$`);
  });
}

function matchesAny(pathname: string, matchers: RegExp[]): boolean {
  return matchers.some((matcher) => matcher.test(pathname));
}

function shouldIncludePath(
  pathname: string,
  includeMatchers: RegExp[],
  excludeMatchers: RegExp[]
): boolean {
  if (excludeMatchers.length > 0 && matchesAny(pathname, excludeMatchers)) {
    return false;
  }
  if (includeMatchers.length === 0) {
    return true;
  }
  return matchesAny(pathname, includeMatchers);
}

async function scrapePageInBrowser(
  browser: Browser,
  url: string,
  options: LocalScrapeOptions
): Promise<LocalScrapeResult> {
  const verbose = options.verbose || VERBOSE_LOGGING;
  const page = await browser.newPage();

  try {
    // Set realistic viewport and user agent to avoid bot detection
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS);
    if (verbose) log(`Navigating to: ${url}`);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: DEFAULT_NAVIGATION_TIMEOUT_MS });

    if (options.waitFor && options.waitFor > 0) {
      if (verbose) log(`Waiting ${options.waitFor}ms (custom waitFor)`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(options.waitFor!, MAX_WAIT_FOR_MS)));
    } else {
      if (verbose) log("Waiting for network idle...");
      await page.waitForNetworkIdle({ idleTime: 600, timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {
        if (verbose) log("Network idle timeout - continuing anyway");
      });
    }

    // Scroll to trigger lazy-loaded images
    if (verbose) log("Scrolling page to trigger lazy loading...");
    // Use string-based evaluate to avoid esbuild __name transformation
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)");
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 2 / 3)");
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    await page.evaluate("window.scrollTo(0, 0)");
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    // Use string-based evaluate to avoid esbuild __name transformation issues
    const extractionScript = `
      (function(onlyMainContent) {
        function getMeta(selector) {
          var el = document.querySelector(selector);
          if (!el) return null;
          return el.content || null;
        }

        function getAttr(el, attr) {
          try { return el.getAttribute(attr); } catch(e) { return null; }
        }

        var title = document.title || location.href;
        var description = getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]') || getMeta('meta[name="twitter:description"]');
        var ogImage = getMeta('meta[property="og:image"]') || getMeta('meta[name="twitter:image"]');
        var container = onlyMainContent ? (document.querySelector("main") || document.querySelector("article") || document.body) : document.body;
        var text = container ? container.innerText : "";

        var links = [];
        document.querySelectorAll("a[href]").forEach(function(link) {
          if (link.href) links.push(link.href);
        });

        var imageSet = new Set();
        var diagnostics = { documentImages: 0, srcImages: 0, currentSrc: 0, dataSrc: 0, srcset: 0, pictureSource: 0 };

        // Method 1: document.images collection
        for (var i = 0; i < document.images.length; i++) {
          var img = document.images[i];
          var src = img.currentSrc || img.src;
          if (src) { imageSet.add(src); diagnostics.documentImages++; }
        }

        // Method 2: img[src] elements
        document.querySelectorAll("img[src]").forEach(function(el) {
          var src = getAttr(el, "src");
          if (src && !src.startsWith("data:")) {
            try { imageSet.add(new URL(src, document.baseURI).href); diagnostics.srcImages++; } catch(e) {}
          }
        });

        // Method 3: currentSrc from responsive images
        document.querySelectorAll("img").forEach(function(el) {
          var cs = el.currentSrc;
          if (cs && !cs.startsWith("data:")) { imageSet.add(cs); diagnostics.currentSrc++; }
        });

        // Method 4: data-src, data-lazy-src, data-original (lazy loading)
        document.querySelectorAll("[data-src], [data-lazy-src], [data-original], [data-srcset]").forEach(function(el) {
          ["data-src", "data-lazy-src", "data-original"].forEach(function(attr) {
            var val = getAttr(el, attr);
            if (val && !val.startsWith("data:")) {
              try { imageSet.add(new URL(val, document.baseURI).href); diagnostics.dataSrc++; } catch(e) {}
            }
          });
        });

        // Method 5: srcset parsing
        document.querySelectorAll("[srcset], [data-srcset]").forEach(function(el) {
          var srcset = getAttr(el, "srcset") || getAttr(el, "data-srcset");
          if (srcset) {
            srcset.split(",").forEach(function(part) {
              var urlPart = part.trim().split(/\\s+/)[0];
              if (urlPart && !urlPart.startsWith("data:")) {
                try { imageSet.add(new URL(urlPart, document.baseURI).href); diagnostics.srcset++; } catch(e) {}
              }
            });
          }
        });

        // Method 6: picture > source elements
        document.querySelectorAll("picture source[srcset]").forEach(function(source) {
          var srcset = getAttr(source, "srcset");
          if (srcset) {
            srcset.split(",").forEach(function(part) {
              var urlPart = part.trim().split(/\\s+/)[0];
              if (urlPart && !urlPart.startsWith("data:")) {
                try { imageSet.add(new URL(urlPart, document.baseURI).href); diagnostics.pictureSource++; } catch(e) {}
              }
            });
          }
        });

        return { title: title, description: description, ogImage: ogImage, text: text, links: links, images: Array.from(imageSet), diagnostics: diagnostics };
      })(${options.onlyMainContent ?? true})
    `;
    const data = await page.evaluate(extractionScript) as {
      title: string;
      description: string | null;
      ogImage: string | null;
      text: string;
      links: string[];
      images: string[];
      diagnostics: {
        documentImages: number;
        srcImages: number;
        currentSrc: number;
        dataSrc: number;
        srcset: number;
        pictureSource: number;
      };
    };

    if (verbose) {
      log(`Image extraction diagnostics for ${url}:`);
      log(`  - document.images: ${data.diagnostics.documentImages}`);
      log(`  - img[src]: ${data.diagnostics.srcImages}`);
      log(`  - currentSrc: ${data.diagnostics.currentSrc}`);
      log(`  - data-src (lazy): ${data.diagnostics.dataSrc}`);
      log(`  - srcset: ${data.diagnostics.srcset}`);
      log(`  - picture source: ${data.diagnostics.pictureSource}`);
      log(`  - Total unique images: ${data.images.length}`);
    }

    const title = data.title || url;
    const markdown = buildMarkdown(title, data.description, data.text);
    const links = dedupe(filterHttpUrls(data.links));
    const images = dedupe(filterHttpUrls(data.images));

    if (verbose) {
      log(`Final results for ${url}:`);
      log(`  - Title: ${title}`);
      log(`  - Links: ${links.length}`);
      log(`  - Images: ${images.length}`);
      log(`  - OG Image: ${data.ogImage || "not found"}`);
    }

    return {
      url,
      title,
      description: data.description || undefined,
      ogImage: data.ogImage || undefined,
      markdown,
      links,
      images,
    };
  } finally {
    await page.close();
  }
}

export async function localScrapePage(
  url: string,
  options: LocalScrapeOptions = {}
): Promise<LocalScrapeResult> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    return await scrapePageInBrowser(browser, url, options);
  } finally {
    await browser.close();
  }
}

export async function localCrawlSite(options: LocalCrawlOptions): Promise<LocalCrawlResult> {
  const startUrl = normalizeUrl(options.url);
  if (!startUrl) {
    throw new Error("Invalid URL");
  }

  const maxPages = Math.min(Math.max(options.maxPages ?? 10, 1), 50);
  const includeMatchers = compilePathMatchers(options.includePaths);
  const excludeMatchers = compilePathMatchers(options.excludePaths);
  const origin = new URL(startUrl).origin;

  const queue: string[] = [startUrl];
  const queued = new Set<string>([startUrl]);
  const visited = new Set<string>();
  const pages: Array<{ url: string; title?: string; markdown?: string }> = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    while (queue.length > 0 && pages.length < maxPages) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }

      visited.add(current);

      try {
        const result = await scrapePageInBrowser(browser, current, {
          waitFor: options.waitFor,
          onlyMainContent: options.onlyMainContent ?? true,
        });

        pages.push({ url: current, title: result.title, markdown: result.markdown });

        for (const link of result.links) {
          const normalized = normalizeUrl(link);
          if (!normalized || visited.has(normalized) || queued.has(normalized)) {
            continue;
          }

          const parsed = new URL(normalized);
          if (parsed.origin !== origin) {
            continue;
          }

          if (!shouldIncludePath(parsed.pathname, includeMatchers, excludeMatchers)) {
            continue;
          }

          queued.add(normalized);
          queue.push(normalized);
        }
      } catch (error) {
        console.warn("[LOCAL-SCRAPER] Failed to crawl URL:", current, error);
      }
    }
  } finally {
    await browser.close();
  }

  return { pages, totalPages: pages.length };
}
