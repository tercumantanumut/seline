import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/web-search/validate
 * Validates a Tavily API key by making a test search request
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { apiKey } = body;

        if (!apiKey || typeof apiKey !== "string") {
            return NextResponse.json(
                { valid: false, error: "API key is required" },
                { status: 400 }
            );
        }

        // Test the API key with a simple search
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
        console.error("[Tavily Validation] Error:", error);
        return NextResponse.json(
            { valid: false, error: "Failed to validate API key" },
            { status: 500 }
        );
    }
}
