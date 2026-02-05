/**
 * Admin API: Get Prompt Template Details
 * 
 * GET /api/admin/prompts/[key] - Get template with versions and metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import {
  listPromptVersions,
  getPromptVersionMetrics,
  getVersionAdoptionTimeline,
} from "@/lib/observability";
import { isLocalEnvironment } from "@/lib/utils/environment";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    // Skip auth for local environments (development and Electron production)
    if (!isLocalEnvironment()) {
      await requireAuth(req);
    }

    const { key } = await params;

    if (!key) {
      return NextResponse.json(
        { error: "Template key is required" },
        { status: 400 }
      );
    }

    // Get versions
    const versions = await listPromptVersions(key);

    if (versions.length === 0) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Get metrics for each version
    const metrics = await getPromptVersionMetrics(key);

    // Get adoption timeline
    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "30", 10);
    const timeline = await getVersionAdoptionTimeline(key, days);

    return NextResponse.json({
      templateKey: key,
      versions,
      metrics,
      timeline,
    });
  } catch (error) {
    console.error("[Admin API] Error getting prompt details:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get prompt details" },
      { status: 500 }
    );
  }
}

