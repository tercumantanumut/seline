/**
 * POST /api/chat/tool-result
 *
 * Accepts the user's answer to an interactive tool question
 * (AskUserQuestion / AskFollowupQuestion) and resolves the pending
 * PreToolUse hook gate so the Claude Code SDK agent can continue.
 */

import { resolveInteractiveWait } from "@/lib/interactive-tool-bridge";
import { requireAuth } from "@/lib/auth/local-auth";
import { getSession } from "@/lib/db/queries-sessions";

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId?: string; toolUseId?: string; answers?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, toolUseId, answers } = body;
  if (
    !sessionId ||
    !toolUseId ||
    !answers ||
    typeof answers !== "object" ||
    Array.isArray(answers) ||
    !Object.values(answers).every((v) => typeof v === "string")
  ) {
    return Response.json(
      { error: "Missing required fields: sessionId, toolUseId, answers (Record<string, string>)" },
      { status: 400 },
    );
  }

  // Verify the authenticated user owns this session
  const session = await getSession(sessionId);
  if (!session || session.userId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveInteractiveWait(sessionId, toolUseId, answers);
  if (resolved) {
    console.log(
      `[tool-result] Resolved interactive wait: session=${sessionId} tool=${toolUseId}`,
    );
  } else {
    console.warn(
      `[tool-result] No pending wait found: session=${sessionId} tool=${toolUseId}`,
    );
  }

  return Response.json({ resolved });
}
