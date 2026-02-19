import { NextRequest, NextResponse } from "next/server";
import { createDDGS } from "@/lib/ai/web-search/ddgs";

/**
 * POST /api/web-search/validate
 * Validates a web search provider:
 *   - Tavily: validates API key with a test search
 *   - DuckDuckGo: runs a test search (no key needed)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { apiKey, provider } = body;

        // DuckDuckGo validation — just test a search
        if (provider === "duckduckgo") {
            try {
                const ddgs = await createDDGS();
                const results = await ddgs.text({ keywords: "test", maxResults: 1, backend: "lite" });
                if (results && results.length > 0) {
                    return NextResponse.json({ valid: true });
                }
                return NextResponse.json({ valid: false, error: "DuckDuckGo returned no results" });
            } catch (error) {
                console.error("[DDG Validation] Error:", error);
                return NextResponse.json({
                    valid: false,
                    error: "DuckDuckGo search test failed",
                });
            }
        }

        // Tavily validation — requires API key
        if (!apiKey || typeof apiKey !== "string") {
            return NextResponse.json(
                { valid: false, error: "API key is required" },
                { status: 400 }
            );
        }

        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                api_key: apiKey,
                query: "test",
                max_results: 1,
            }),
        });

        if (response.ok) {
            return NextResponse.json({ valid: true });
        } else {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json({
                valid: false,
                error: errorData.error || "Invalid API key",
            });
        }
    } catch (error) {
        console.error("[Web Search Validation] Error:", error);
        return NextResponse.json(
            { valid: false, error: "Failed to validate" },
            { status: 500 }
        );
    }
}
