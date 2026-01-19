/**
 * Schedule Presets API
 * GET /api/schedules/presets
 *
 * Returns available schedule presets/templates.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getAllPresets, getPresetsByCategory, getPresetById } from "@/lib/scheduler/presets";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const id = searchParams.get("id");

    // Get specific preset by ID
    if (id) {
      const preset = getPresetById(id);
      if (!preset) {
        return NextResponse.json({ error: "Preset not found" }, { status: 404 });
      }
      return NextResponse.json({ preset });
    }

    // Get presets by category
    if (category) {
      const validCategories = ["productivity", "development", "communication", "analytics"];
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: "Invalid category" },
          { status: 400 }
        );
      }
      const presets = getPresetsByCategory(category as "productivity" | "development" | "communication" | "analytics");
      return NextResponse.json({ presets });
    }

    // Get all presets
    const presets = getAllPresets();
    return NextResponse.json({ presets });
  } catch (error) {
    console.error("[API] Get presets error:", error);
    return NextResponse.json(
      { error: "Failed to get presets" },
      { status: 500 }
    );
  }
}

