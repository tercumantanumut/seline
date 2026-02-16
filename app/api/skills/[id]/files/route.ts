import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getSkillFiles } from "@/lib/skills/queries";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);

    const { id: skillId } = await params;
    const files = await getSkillFiles(skillId, userId);

    return NextResponse.json({ files });
  } catch (error) {
    console.error("[SkillFiles] Error:", error);
    
    // Handle auth errors with 401
    if (error instanceof Error && 
        (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load files" },
      { status: 500 }
    );
  }
}
