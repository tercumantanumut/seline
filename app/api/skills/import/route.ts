import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { parseSkillPackage, parseSingleSkillMd } from "@/lib/skills/import-parser";
import { importSkillPackage } from "@/lib/skills/queries";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute timeout for large files

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);
  console.log(`[SkillImport:${requestId}] 🚀 Request started at ${new Date().toISOString()}`);
  
  try {
    console.log(`[SkillImport:${requestId}] 🔐 Checking auth...`);
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);
    console.log(`[SkillImport:${requestId}] ✅ Auth successful - userId: ${dbUser.id}`);

    console.log(`[SkillImport:${requestId}] 📦 Parsing form data...`);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const characterId = formData.get("characterId") as string | null;
    console.log(`[SkillImport:${requestId}] ✅ Form data parsed - file: ${file?.name}, size: ${file?.size} bytes`);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!characterId) {
      return NextResponse.json({ error: "No characterId provided" }, { status: 400 });
    }

    // Validate file type
    const isZip = file.name.endsWith(".zip");
    const isMd = file.name.endsWith(".md");
    
    if (!isZip && !isMd) {
      return NextResponse.json(
        { error: "Only .zip packages or .md files are supported" },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 400 }
      );
    }

    // Parse the package or single file
    console.log(`[SkillImport:${requestId}] 📖 Reading file buffer...`);
    const buffer = Buffer.from(await file.arrayBuffer());
    console.log(`[SkillImport:${requestId}] ✅ Buffer created - ${buffer.length} bytes`);
    
    console.log(`[SkillImport:${requestId}] 🔍 Parsing ${isMd ? 'markdown' : 'zip'} file...`);
    const parsedSkill = isMd 
      ? await parseSingleSkillMd(buffer, file.name)
      : await parseSkillPackage(buffer);
    console.log(`[SkillImport:${requestId}] ✅ Parsing complete - ${parsedSkill.files.length} files, ${parsedSkill.scripts.length} scripts`);

    // Import into database
    console.log(`[SkillImport:${requestId}] 💾 Importing to database...`);
    const skill = await importSkillPackage({
      userId: dbUser.id,
      characterId,
      parsedSkill,
    });
    console.log(`[SkillImport:${requestId}] ✅ Import complete - skillId: ${skill.id}`);

    const response = {
      success: true,
      skillId: skill.id,
      skillName: skill.name,
      filesImported: parsedSkill.files.length,
      scriptsFound: parsedSkill.scripts.length,
    };
    console.log(`[SkillImport:${requestId}] 🎉 Sending success response:`, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error(`[SkillImport:${requestId}] ❌ Error:`, error);
    
    // Handle auth errors with 401
    if (error instanceof Error && 
        (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
