import { generateText } from "ai";
import { resolveSessionUtilityModel, getSessionProviderTemperature } from "@/lib/ai/session-model-resolver";
import { getSession, updateSession } from "@/lib/db/queries";

const MAX_PROMPT_SNIPPET = 400;
const MAX_TITLE_LENGTH = 80;

function buildPrompt(firstMessage: string): string {
  const snippet = firstMessage.trim().slice(0, MAX_PROMPT_SNIPPET);
  return [
    "You are naming a chat session.",
    "Generate a concise, descriptive 3-5 word title for the conversation that starts with the message below.",
    "Do not include quotes or punctuation at the ends. Respond with the title only.",
    "",
    `Message: ${snippet}`,
  ].join("\n");
}

function sanitizeTitle(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const firstLine = raw
    .replace(/["“”]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return null;
  }

  const title = firstLine.replace(/\.$/, "");
  return title ? title.slice(0, MAX_TITLE_LENGTH) : null;
}

export async function generateSessionTitle(sessionId: string, firstMessageContent: string): Promise<void> {
  if (!firstMessageContent?.trim()) {
    return;
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      return;
    }

    const sessionMetadata = (session.metadata as Record<string, unknown> | null) ?? null;
    const { text } = await generateText({
      model: resolveSessionUtilityModel(sessionMetadata),
      prompt: buildPrompt(firstMessageContent),
      temperature: getSessionProviderTemperature(sessionMetadata, 0.4),
      maxOutputTokens: 60,
    });

    const title = sanitizeTitle(text);
    if (!title) {
      return;
    }

    await updateSession(sessionId, { title });
  } catch (error) {
    console.error(`[Title Generator] Failed to auto-name session ${sessionId}:`, error);
  }
}
