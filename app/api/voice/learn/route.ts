import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { autoLearnDictionaryFromEdit } from "@/lib/voice/voice-utils";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);

    const body = (await req.json()) as {
      originalText?: string;
      editedText?: string;
    };

    if (
      typeof body.originalText !== "string" ||
      typeof body.editedText !== "string"
    ) {
      return NextResponse.json(
        { error: "originalText and editedText are required" },
        { status: 400 }
      );
    }

    const MAX_LEARN_TEXT_LENGTH = 50_000;
    if (
      body.originalText.length > MAX_LEARN_TEXT_LENGTH ||
      body.editedText.length > MAX_LEARN_TEXT_LENGTH
    ) {
      return NextResponse.json(
        { error: `Text fields must not exceed ${MAX_LEARN_TEXT_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (!body.originalText.trim() || !body.editedText.trim()) {
      return NextResponse.json({ success: true, learned: [] });
    }

    const learned = await autoLearnDictionaryFromEdit(
      body.originalText,
      body.editedText
    );

    return NextResponse.json({ success: true, learned });
  } catch (error) {
    console.error("[Voice API] Learn failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process correction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
