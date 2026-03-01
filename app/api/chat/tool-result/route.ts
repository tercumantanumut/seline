/**
 * POST /api/chat/tool-result
 *
 * Accepts the user's answer to an interactive tool question
 * (AskUserQuestion / AskFollowupQuestion) and resolves the pending
 * PreToolUse hook gate so the Claude Code SDK agent can continue.
 */

import { resolveInteractiveWait } from "@/lib/interactive-tool-bridge";
import { requireAuth } from "@/lib/auth/local-auth";

export async function POST(req: Request) {
  try {
    await requireAuth(req);
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
  if (!sessionId || !toolUseId || !answers || typeof answers !== "object") {
    return Response.json(
      { error: "Missing required fields: sessionId, toolUseId, answers" },
      { status: 400 },
    );
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
