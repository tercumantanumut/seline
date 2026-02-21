#!/usr/bin/env tsx
/**
 * Verifies DuckDuckGo search across each runtime layer.
 *
 * Usage:
 *   npx tsx scripts/verify-ddg-runtime.ts
 *   npx tsx scripts/verify-ddg-runtime.ts --query "openai"
 */

import { createDDGS } from "@/lib/ai/web-search/ddgs";
import { DuckDuckGoProvider, getSearchProvider, getWebSearchProviderStatus } from "@/lib/ai/web-search/providers";

type Backend = "lite" | "html" | "auto";

const backends: Backend[] = ["lite", "html", "auto"];
const args = process.argv.slice(2);
const queryFlag = args.indexOf("--query");
const query = queryFlag >= 0 && args[queryFlag + 1] ? args[queryFlag + 1] : "openai";

function getHrefKind(href: string | undefined): "absolute" | "relative" | "empty" {
  if (!href) return "empty";
  if (href.startsWith("http://") || href.startsWith("https://")) return "absolute";
  return "relative";
}

async function runRawDDGS(label: string, ddgsFactory: () => Promise<any>) {
  const counts: Record<Backend, number> = { lite: 0, html: 0, auto: 0 };
  const hrefKinds: Record<Backend, Record<string, number>> = {
    lite: { absolute: 0, relative: 0, empty: 0 },
    html: { absolute: 0, relative: 0, empty: 0 },
    auto: { absolute: 0, relative: 0, empty: 0 },
  };
  const errors: string[] = [];

  const ddgs = await ddgsFactory();

  for (const backend of backends) {
    try {
      const raw = await ddgs.text({ keywords: query, maxResults: 8, backend });
      const rows = Array.isArray(raw) ? raw : [];
      counts[backend] = rows.length;
      for (const row of rows) {
        const kind = getHrefKind(row?.href);
        hrefKinds[backend][kind] = (hrefKinds[backend][kind] ?? 0) + 1;
      }
    } catch (error: any) {
      errors.push(`${backend}: ${error?.message ?? String(error)}`);
    }
  }

  console.log(`\n[${label}]`);
  for (const backend of backends) {
    const kinds = hrefKinds[backend];
    console.log(
      `${backend}: count=${counts[backend]} | hrefKinds absolute=${kinds.absolute} relative=${kinds.relative} empty=${kinds.empty}`
    );
  }
  if (errors.length > 0) console.log(`errors: ${errors.join(" | ")}`);

  return { counts, hrefKinds, errors };
}

async function main() {
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log(`Node: ${process.version}`);
  console.log(`Query: ${query}`);
  console.log(`WEB_SEARCH_PROVIDER=${process.env.WEB_SEARCH_PROVIDER ?? "(unset)"}`);
  console.log(`TAVILY_API_KEY=${process.env.TAVILY_API_KEY ? "(set)" : "(unset)"}`);
  console.log(`DDG_VERIFY_TLS=${process.env.DDG_VERIFY_TLS ?? "(unset)"}`);
  console.log(`DDG_TIMEOUT_MS=${process.env.DDG_TIMEOUT_MS ?? "(unset)"}`);

  const status = getWebSearchProviderStatus();
  console.log(`Resolved provider status: configured=${status.configuredProvider} active=${status.activeProvider} available=${status.available}`);

  const vendored = await runRawDDGS("vendored DDGS (direct)", async () => {
    const { DDGS } = await import("@/vendors/duckduckgo-search/index.js");
    return new DDGS();
  });

  const wrapped = await runRawDDGS("wrapped DDGS (createDDGS)", async () => createDDGS());

  const ddgProvider = new DuckDuckGoProvider();
  const providerResult = await ddgProvider.search(query, { maxResults: 8 });
  console.log(`\n[DuckDuckGoProvider.search]`);
  console.log(`sources=${providerResult.sources.length}`);
  if (providerResult.sources[0]) {
    console.log(`firstSource=${providerResult.sources[0].url}`);
  }

  const resolvedProvider = getSearchProvider();
  const resolvedResult = await resolvedProvider.search(query, { maxResults: 8, includeAnswer: true });
  console.log(`\n[getSearchProvider().search]`);
  console.log(`provider=${resolvedProvider.name} sources=${resolvedResult.sources.length}`);

  const vendoredAny = backends.some((b) => vendored.counts[b] > 0);
  const wrappedAny = backends.some((b) => wrapped.counts[b] > 0);

  console.log("\nDiagnosis:");
  if (!vendoredAny) {
    console.log("- Raw vendored DDGS has no results. This is a network/TLS/proxy/rate-limit environment issue.");
    return;
  }
  if (vendoredAny && !wrappedAny) {
    console.log("- Vendored DDGS works but createDDGS does not. Check DDG_* env overrides.");
    return;
  }
  if (wrappedAny && providerResult.sources.length === 0) {
    console.log("- Raw DDGS returns rows but provider returns 0. This indicates filtering/normalization is dropping all rows.");
    return;
  }
  if (resolvedProvider.name !== "duckduckgo" && resolvedResult.sources.length === 0) {
    console.log("- Active provider is not DuckDuckGo and returned 0. Check WEB_SEARCH_PROVIDER / Tavily key config.");
    return;
  }
  console.log("- Runtime path is healthy in this shell. If app still shows 0, issue is app-process env mismatch.");
}

main().catch((error) => {
  console.error("verify-ddg-runtime failed:", error);
  process.exit(1);
});
