/**
 * Admin API: List Prompt Templates
 * 
 * GET /api/admin/prompts - List all prompt templates
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { listPromptTemplates } from "@/lib/observability";
import { isLocalEnvironment } from "@/lib/utils/environment";

export async function GET(req: NextRequest) {
  try {
    // Skip auth for local environments (development and Electron production)
    if (!isLocalEnvironment()) {
      await requireAuth(req);
    }

    const templates = await listPromptTemplates();

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[Admin API] Error listing prompts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list prompts" },
      { status: 500 }
    );
  }
}

