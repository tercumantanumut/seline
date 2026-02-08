import { getSessionWithMessages } from "@/lib/db/queries";

type ExportFormat = "markdown" | "json" | "text";

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return JSON.stringify(part);
      })
      .join("\n");
  }
  if (content && typeof content === "object") {
    return JSON.stringify(content, null, 2);
  }
  return "";
}

export async function exportSession(
  sessionId: string,
  format: ExportFormat
): Promise<{ content: string; filename: string } | null> {
  const result = await getSessionWithMessages(sessionId);
  if (!result) {
    return null;
  }

  const { session, messages } = result;
  const title = sanitizeFilename(session.title || "chat");
  const shortId = session.id.slice(0, 8);
  const basename = `${title || "chat"}-${shortId}`;

  if (format === "json") {
    return {
      content: JSON.stringify({ session, messages }, null, 2),
      filename: `${basename}.json`,
    };
  }

  const rendered = messages.map((message) => {
    const role = message.role === "user" ? "You" : message.role === "assistant" ? "Assistant" : message.role;
    const body = stringifyMessageContent(message.content);
    if (format === "markdown") {
      return `### ${role}\n${body}`.trim();
    }
    return `[${role}]\n${body}`.trim();
  }).filter(Boolean);

  return {
    content: rendered.join(format === "markdown" ? "\n\n---\n\n" : "\n\n"),
    filename: `${basename}.${format === "markdown" ? "md" : "txt"}`,
  };
}

