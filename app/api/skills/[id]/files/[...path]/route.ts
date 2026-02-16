import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getSkillFile } from "@/lib/skills/queries";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  try {
    const userId = await requireAuth(request);

    const { id: skillId, path: pathSegments } = await params;
    const relativePath = pathSegments.join("/");

    const file = await getSkillFile(skillId, relativePath, userId);

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Return file content as download
    const headers = new Headers();
    headers.set("Content-Type", file.mimeType || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${relativePath.split("/").pop()}"`);
    headers.set("Content-Length", String(file.size));

    // Convert Buffer to Uint8Array for NextResponse
    const buffer = file.content instanceof Buffer 
      ? file.content 
      : Buffer.from(file.content as ArrayBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[SkillFileDownload] Error:", error);
    
    // Handle auth errors with 401
    if (error instanceof Error && 
        (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download file" },
      { status: 500 }
    );
  }
}
