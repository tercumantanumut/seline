#!/usr/bin/env tsx
import { getSessionWithMessages, updateSession } from "@/lib/db/queries";
import { db } from "@/lib/db/sqlite-client";
import { sessions } from "@/lib/db/sqlite-schema";
import { desc, eq } from "drizzle-orm";
import { getSessionProvider } from "@/lib/ai/session-model-resolver";
import { TokenTracker } from "@/lib/context-window/token-tracker";
import { getScopedFallbackMinConfidence, isScopedFallbackEnabled } from "@/lib/context-window/scoped-counting-contract";

type ParsedArgs = {
  dryRun: boolean;
  write: boolean;
  provider: "claudecode" | "all";
  sessionId?: string;
  limit: number;
};

type SessionDelta = {
  sessionId: string;
  provider?: string;
  oldTokens: number;
  newTokens: number;
  delta: number;
  oldStatus: string;
  newStatus: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    dryRun: true,
    write: false,
    provider: "claudecode",
    limit: 50,
  };

  for (const raw of argv) {
    if (raw === "--write") {
      out.write = true;
      out.dryRun = false;
      continue;
    }
    if (raw === "--dry-run") {
      out.dryRun = true;
      out.write = false;
      continue;
    }
    if (raw.startsWith("--provider=")) {
      const value = raw.split("=", 2)[1];
      if (value === "claudecode" || value === "all") out.provider = value;
      continue;
    }
    if (raw.startsWith("--session=")) {
      out.sessionId = raw.split("=", 2)[1];
      continue;
    }
    if (raw.startsWith("--limit=")) {
      const parsed = Number(raw.split("=", 2)[1]);
      if (Number.isFinite(parsed) && parsed > 0) out.limit = Math.floor(parsed);
      continue;
    }
  }

  return out;
}

function classify(tokens: number, maxTokens = 200_000): string {
  const warning = Math.floor(maxTokens * 0.75);
  const critical = Math.floor(maxTokens * 0.85);
  const hard = Math.floor(maxTokens * 0.95);
  if (tokens >= hard) return "exceeded";
  if (tokens >= critical) return "critical";
  if (tokens >= warning) return "warning";
  return "safe";
}

async function listTargetSessions(args: ParsedArgs): Promise<Array<{ id: string; summary: string | null; metadata: unknown }>> {
  if (args.sessionId) {
    const row = await db.select({ id: sessions.id, summary: sessions.summary, metadata: sessions.metadata })
      .from(sessions)
      .where(eq(sessions.id, args.sessionId))
      .limit(1);
    return row;
  }

  return db.select({ id: sessions.id, summary: sessions.summary, metadata: sessions.metadata })
    .from(sessions)
    .orderBy(desc(sessions.updatedAt))
    .limit(args.limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fallbackEnabled = isScopedFallbackEnabled();
  const fallbackMinConfidence = getScopedFallbackMinConfidence();

  console.log("=== Scoped Context Recompute ===");
  console.log(`mode=${args.write ? "write" : "dry-run"}`);
  console.log(`providerFilter=${args.provider}`);
  console.log(`fallbackEnabled=${fallbackEnabled}`);
  console.log(`fallbackMinConfidence=${fallbackMinConfidence}`);

  const targets = await listTargetSessions(args);
  const deltas: SessionDelta[] = [];

  for (const target of targets) {
    const sessionWithMessages = await getSessionWithMessages(target.id);
    if (!sessionWithMessages) continue;

    const sessionMetadata = (sessionWithMessages.session.metadata ?? null) as Record<string, unknown> | null;
    const provider = getSessionProvider(sessionMetadata ?? {});
    if (args.provider !== "all" && provider !== "claudecode") continue;

    const oldUsage = await TokenTracker.calculateUsage(
      sessionWithMessages.session.id,
      sessionWithMessages.messages,
      5000,
      sessionWithMessages.session.summary,
      {
        provider,
        sessionMetadata,
        scopedMode: "legacy",
        fallbackEnabled,
        fallbackMinConfidence,
      }
    );

    const newUsage = await TokenTracker.calculateUsage(
      sessionWithMessages.session.id,
      sessionWithMessages.messages,
      5000,
      sessionWithMessages.session.summary,
      {
        provider,
        sessionMetadata,
        scopedMode: "scoped",
        fallbackEnabled,
        fallbackMinConfidence,
      }
    );

    const delta = newUsage.totalTokens - oldUsage.totalTokens;
    const row: SessionDelta = {
      sessionId: sessionWithMessages.session.id,
      provider,
      oldTokens: oldUsage.totalTokens,
      newTokens: newUsage.totalTokens,
      delta,
      oldStatus: classify(oldUsage.totalTokens),
      newStatus: classify(newUsage.totalTokens),
    };

    deltas.push(row);

    console.log(
      `${row.sessionId} provider=${row.provider} old=${row.oldTokens} new=${row.newTokens} delta=${row.delta} oldStatus=${row.oldStatus} newStatus=${row.newStatus}`
    );

    if (args.write) {
      const metadata = (sessionWithMessages.session.metadata ?? {}) as Record<string, unknown>;
      await updateSession(sessionWithMessages.session.id, {
        metadata: {
          ...metadata,
          scopedContextAudit: {
            oldTokens: row.oldTokens,
            newTokens: row.newTokens,
            delta: row.delta,
            oldStatus: row.oldStatus,
            newStatus: row.newStatus,
            computedAt: new Date().toISOString(),
          },
        },
      });
    }
  }

  const totalOld = deltas.reduce((sum, d) => sum + d.oldTokens, 0);
  const totalNew = deltas.reduce((sum, d) => sum + d.newTokens, 0);
  const totalDelta = totalNew - totalOld;
  const statusFlips = deltas.filter((d) => d.oldStatus !== d.newStatus).length;

  console.log("=== Aggregate ===");
  console.log(`sessions=${deltas.length}`);
  console.log(`totalOld=${totalOld}`);
  console.log(`totalNew=${totalNew}`);
  console.log(`totalDelta=${totalDelta}`);
  console.log(`statusFlips=${statusFlips}`);

  if (!args.write) {
    console.log("Dry-run only. Use --write to persist scopedContextAudit snapshots in session metadata.");
  }
}

main().catch((error) => {
  console.error("Scoped context recompute failed", error);
  process.exit(1);
});
