import { beforeAll, afterAll, describe, it, expect } from "vitest";

import { POST as chatPost } from "@/app/api/chat/route";
import {
  createMessage,
  createSession,
  getMessages,
  getNonCompactedMessages,
  getOrCreateLocalUser,
  getSession,
} from "@/lib/db/queries";
import { nextOrderingIndex } from "@/lib/session/message-ordering";
import { executeCommandWithValidation } from "@/lib/command-execution/executor";
import { normalizeToolResultOutput } from "@/lib/ai/tool-result-utils";
import { convertDBMessagesToUIMessages } from "@/lib/messages/converter";
import { loadSettings, saveSettings, type AppSettings } from "@/lib/settings/settings-manager";
import { ContextWindowManager } from "@/lib/context-window";
import type { LLMProvider } from "@/components/model-bag/model-bag.types";

type DBMessageLike = {
  role: string;
  content: unknown;
  isCompacted?: boolean;
};

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && typeof part === "object" && (part as { type?: string }).type === "text")
    .map((part) => String((part as { text?: unknown }).text || ""))
    .join("\n");
}

function collectToolPairStats(messages: DBMessageLike[]): {
  callIds: Set<string>;
  resultIds: Set<string>;
  missingResults: string[];
  orphanResults: string[];
} {
  const callIds = new Set<string>();
  const resultIds = new Set<string>();

  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const rawPart of msg.content) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as { type?: string; toolCallId?: unknown };
      if (part.type === "tool-call" && typeof part.toolCallId === "string") {
        callIds.add(part.toolCallId);
      }
      if (part.type === "tool-result" && typeof part.toolCallId === "string") {
        resultIds.add(part.toolCallId);
      }
    }
  }

  const missingResults = [...callIds].filter((id) => !resultIds.has(id));
  const orphanResults = [...resultIds].filter((id) => !callIds.has(id));
  return { callIds, resultIds, missingResults, orphanResults };
}

function countCanonicalTruncationMarkers(messages: DBMessageLike[]): number {
  let count = 0;
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const rawPart of msg.content) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as { type?: string; result?: unknown };
      if (part.type !== "tool-result") continue;
      if (!part.result || typeof part.result !== "object" || Array.isArray(part.result)) continue;
      const result = part.result as Record<string, unknown>;
      if (result.truncated === true) {
        count += 1;
        continue;
      }
      if (typeof result.truncatedContentId === "string" && result.truncatedContentId.startsWith("trunc_")) {
        count += 1;
      }
    }
  }
  return count;
}

async function persistExecuteCommandToolRun(params: {
  sessionId: string;
  marker: string;
  payloadSize: number;
  idx: number;
}) {
  const script = `process.stdout.write('${params.marker}::' + 'X'.repeat(${params.payloadSize}))`;
  const args = ["-e", script];
  const input = {
    command: "node",
    args,
    cwd: process.cwd(),
  };

  const result = await executeCommandWithValidation(
    {
      command: "node",
      args,
      cwd: process.cwd(),
      characterId: "history-fidelity-integration",
      timeout: 20_000,
    },
    [process.cwd()]
  );

  expect(result.success).toBe(true);
  expect(result.stdout).toContain(params.marker);

  const normalized = normalizeToolResultOutput(
    "executeCommand",
    {
      status: result.success ? "success" : "error",
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      executionTime: result.executionTime,
      logId: result.logId,
      isTruncated: result.isTruncated,
      error: result.error,
    },
    input,
    { mode: "canonical" }
  );

  const normalizedOutput = normalized.output as Record<string, unknown>;
  expect(normalizedOutput.truncated).toBeUndefined();
  expect(normalizedOutput.truncatedContentId).toBeUndefined();

  await createMessage({
    sessionId: params.sessionId,
    role: "assistant",
    orderingIndex: await nextOrderingIndex(params.sessionId),
    content: [
      {
        type: "tool-call",
        toolCallId: `hist-tool-${params.idx}`,
        toolName: "executeCommand",
        args: input,
      },
      {
        type: "tool-result",
        toolCallId: `hist-tool-${params.idx}`,
        toolName: "executeCommand",
        result: normalized.output,
        status: normalized.status,
        state: normalized.status === "error" || normalized.status === "failed" ? "output-error" : "output-available",
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

describe.sequential("Chat Tool History Fidelity - Real Pipeline", () => {
  const integrationUserId = "integration-history-fidelity-user";
  const runHistoryFidelityIntegration =
    process.env.RUN_CHAT_HISTORY_FIDELITY_INTEGRATION === "true" &&
    typeof process.env.OPENROUTER_API_KEY === "string" &&
    process.env.OPENROUTER_API_KEY.trim().length > 0;
  const integrationIt = runHistoryFidelityIntegration ? it : it.skip;
  const forcedProvider: LLMProvider = "openrouter";
  const forcedModel =
    process.env.CHAT_HISTORY_INTEGRATION_MODEL ?? "anthropic/claude-sonnet-4.5";
  let originalSettings: AppSettings;

  beforeAll(() => {
    originalSettings = JSON.parse(JSON.stringify(loadSettings())) as AppSettings;
    saveSettings({
      ...originalSettings,
      llmProvider: forcedProvider,
      chatModel: forcedModel,
      utilityModel: forcedModel,
    });
  });

  afterAll(() => {
    if (originalSettings) {
      saveSettings(originalSettings);
    }
  });

  integrationIt(
    "executes 50 real tool runs, preserves canonical outputs losslessly, and recalls via /api/chat endpoint",
    async () => {
      const settings = loadSettings();
      const dbUser = await getOrCreateLocalUser(
        integrationUserId,
        `${integrationUserId}@integration.local`
      );

      const session = await createSession({
        title: "Integration - Tool History Fidelity",
        userId: dbUser.id,
        metadata: {
          sessionProvider: forcedProvider,
          sessionChatModel: forcedModel,
        },
      });

      await createMessage({
        sessionId: session.id,
        role: "user",
        orderingIndex: await nextOrderingIndex(session.id),
        content: [{ type: "text", text: "Bootstrap deterministic tool history for fidelity test." }],
      });

      const toolCount = 50;
      for (let i = 1; i <= toolCount; i += 1) {
        await persistExecuteCommandToolRun({
          sessionId: session.id,
          marker: `MARK_${i}`,
          payloadSize: 1200,
          idx: i,
        });
      }

      const preChatMessages = await getMessages(session.id);
      const preStats = collectToolPairStats(preChatMessages);
      expect(preStats.callIds.size).toBeGreaterThanOrEqual(toolCount);
      expect(preStats.resultIds.size).toBeGreaterThanOrEqual(toolCount);
      expect(preStats.missingResults).toEqual([]);
      expect(preStats.orphanResults).toEqual([]);
      expect(countCanonicalTruncationMarkers(preChatMessages)).toBe(0);

      const uiMessages = convertDBMessagesToUIMessages(preChatMessages as any);
      uiMessages.push({
        id: `recall-${Date.now()}`,
        role: "user",
        parts: [
          {
            type: "text",
            text: "Do not call any tools. Reply only with marker names for command 7 and command 50 in format A | B.",
          },
        ] as any,
      } as any);

      const request = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": session.id,
          "X-Internal-Auth": process.env.INTERNAL_API_SECRET as string,
        },
        body: JSON.stringify({
          sessionId: session.id,
          messages: uiMessages,
        }),
      });

      const response = await chatPost(request);
      expect(response.status).toBe(200);
      const responseBody = await response.text();
      expect(responseBody.length).toBeGreaterThan(0);

      const postChatMessages = await getMessages(session.id);
      const postStats = collectToolPairStats(postChatMessages);
      expect(postStats.missingResults).toEqual([]);
      expect(postStats.orphanResults).toEqual([]);
      expect(countCanonicalTruncationMarkers(postChatMessages)).toBe(0);

      const assistantMessages = postChatMessages.filter((msg) => msg.role === "assistant");
      const latestAssistant = assistantMessages[assistantMessages.length - 1];
      expect(latestAssistant).toBeTruthy();

      const latestText = extractTextFromContent(latestAssistant.content);
      expect(latestText).toContain("MARK_7");
      expect(latestText).toContain("MARK_50");

      if (Array.isArray(latestAssistant.content)) {
        const latestToolCalls = latestAssistant.content.filter(
          (part) => part && typeof part === "object" && (part as { type?: string }).type === "tool-call"
        );
        expect(latestToolCalls.length).toBe(0);
      }
    },
    1_200_000
  );

  integrationIt(
    "runs compaction on a large tool-result history and keeps call/result integrity in remaining history",
    async () => {
      const settings = loadSettings();
      const dbUser = await getOrCreateLocalUser(
        integrationUserId,
        `${integrationUserId}@integration.local`
      );

      const session = await createSession({
        title: "Integration - Tool History Compaction",
        userId: dbUser.id,
        metadata: {
          sessionProvider: forcedProvider,
          sessionChatModel: forcedModel,
        },
      });

      await createMessage({
        sessionId: session.id,
        role: "user",
        orderingIndex: await nextOrderingIndex(session.id),
        content: [{ type: "text", text: "Create a large tool history and compact it." }],
      });

      for (let i = 1; i <= 40; i += 1) {
        await persistExecuteCommandToolRun({
          sessionId: session.id,
          marker: `CMP_${i}`,
          payloadSize: 30000,
          idx: i,
        });
      }

      const preCheck = await ContextWindowManager.preFlightCheck(
        session.id,
        forcedModel,
        5000,
        forcedProvider
      );

      expect(preCheck.canProceed).toBe(true);
      expect(preCheck.compactionResult?.success).toBe(true);
      expect((preCheck.compactionResult?.messagesCompacted || 0)).toBeGreaterThan(0);

      const refreshedSession = await getSession(session.id);
      expect(refreshedSession?.summary).toBeTruthy();

      const remainingMessages = await getNonCompactedMessages(session.id);
      const remainingStats = collectToolPairStats(remainingMessages as any);
      expect(remainingStats.missingResults).toEqual([]);
      expect(remainingStats.orphanResults).toEqual([]);
      expect(countCanonicalTruncationMarkers(remainingMessages as any)).toBe(0);
    },
    1_200_000
  );
});
