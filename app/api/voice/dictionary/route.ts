import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getCustomDictionary, addDictionaryWords, removeDictionaryWord } from "@/lib/voice/voice-utils";

// GET — returns the user's dictionary words
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);
    const words = await getCustomDictionary();
    return NextResponse.json({ success: true, words });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dictionary";
    console.error("[Voice API] Dictionary GET failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — add words to dictionary. Body: { words: string[] }
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);
    const body = await req.json() as { words?: unknown };

    if (!Array.isArray(body.words) || body.words.length === 0) {
      return NextResponse.json({ error: "words must be a non-empty array of strings" }, { status: 400 });
    }

    const validWords = body.words.filter((w: unknown): w is string => typeof w === "string" && w.trim().length > 0);
    if (validWords.length === 0) {
      return NextResponse.json({ error: "No valid words provided" }, { status: 400 });
    }

    const updated = await addDictionaryWords(validWords);
    return NextResponse.json({ success: true, words: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add dictionary words";
    console.error("[Voice API] Dictionary POST failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — remove a word. Query param: ?word=SomeWord
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const word = searchParams.get("word");

    if (!word || word.trim().length === 0) {
      return NextResponse.json({ error: "word query parameter is required" }, { status: 400 });
    }

    const updated = await removeDictionaryWord(word);
    return NextResponse.json({ success: true, words: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove dictionary word";
    console.error("[Voice API] Dictionary DELETE failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
