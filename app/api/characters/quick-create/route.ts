import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { expandAgentConcept } from "@/lib/ai/quick-create";
import { z } from "zod";

export const maxDuration = 60;

const inputSchema = z.object({
    concept: z.string().min(3),
});

/**
 * POST /api/characters/quick-create
 * 
 * Expands a minimal agent concept into a full profile (name, tagline, purpose)
 */
export async function POST(req: Request) {
    try {
        await requireAuth(req);

        const body = await req.json();
        const parseResult = inputSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json(
                { error: "Invalid input", details: parseResult.error.flatten() },
                { status: 400 }
            );
        }

        const { concept } = parseResult.data;
        const expanded = await expandAgentConcept(concept);

        return NextResponse.json({
            success: true,
            agent: expanded,
        });
    } catch (error) {
        console.error("Agent expansion error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to expand agent" },
            { status: 500 }
        );
    }
}
