import { NextRequest, NextResponse } from "next/server";
import { getAllTemplates, searchTemplates } from "@/lib/characters/templates";
import { SKILLS_V2_TRACK_D } from "@/lib/flags";

export async function GET(req: NextRequest) {
  try {
    if (!SKILLS_V2_TRACK_D) {
      return NextResponse.json({ templates: [], disabled: true });
    }

    const category = req.nextUrl.searchParams.get("category") || undefined;
    const query = req.nextUrl.searchParams.get("q") || undefined;
    const templates = category || query ? searchTemplates({ category, query }) : getAllTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list templates" }, { status: 500 });
  }
}