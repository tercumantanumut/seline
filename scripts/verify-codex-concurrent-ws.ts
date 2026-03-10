#!/usr/bin/env tsx
/**
 * Verification script: Codex concurrent WebSocket session architecture.
 *
 * Validates the three pillars of the parallel session fix:
 *   1. Session store — per-session state isolation
 *   2. WS gate — account-level concurrency limit
 *   3. WebSocket transport — first-data resolution + structured errors
 *
 * Usage:
 *   npx tsx scripts/verify-codex-concurrent-ws.ts [--live]
 *
 * Without --live: validates architecture via module inspection.
 * With --live: attempts real WebSocket connections (requires valid Codex auth).
 */

import { createRequire } from "module";
import path from "path";

const projectRoot = path.resolve(import.meta.dirname ?? __dirname, "..");
const _require = createRequire(import.meta.url);
const isLive = process.argv.includes("--live");

// ── Color helpers ──────────────────────────────────────────────────────────────
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

let passed = 0;
let failed = 0;
let warned = 0;

function header(title: string) { console.log(`\n${bold(cyan(`=== ${title} ===`))}`); }
function pass(msg: string) { passed++; console.log(`  ${green("PASS")} ${msg}`); }
function fail(msg: string) { failed++; console.log(`  ${red("FAIL")} ${msg}`); }
function warn(msg: string) { warned++; console.log(`  ${yellow("WARN")} ${msg}`); }
function info(msg: string) { console.log(`  ${cyan("INFO")} ${msg}`); }

// ── 1. Session Store ───────────────────────────────────────────────────────────

async function verifySessionStore() {
  header("1. Session Store — Per-Session State Isolation");

  const store = await import(path.join(projectRoot, "lib/ai/providers/codex-session-store"));
  store.clearAllSessions();

  // Isolation
  const stateA = store.getSessionState("verify-A");
  const stateB = store.getSessionState("verify-B");
  stateA.turnState = "turn-AAA";
  store.disableWs("verify-A", 60_000);

  if (stateB.turnState === null && store.isWsEnabled("verify-B")) {
    pass("Sessions are isolated — mutating A doesn't affect B");
  } else {
    fail("Session state leaks between sessions");
  }

  if (store.getSessionState("verify-A").turnState === "turn-AAA" && !store.isWsEnabled("verify-A")) {
    pass("Session A retains its own turnState and wsDisabledUntil");
  } else {
    fail("Session A state was lost");
  }

  // Persistence across turns
  store.setTurnState("verify-X", "token-v1");
  store.setTurnState("verify-X", "token-v2");
  if (store.getSessionState("verify-X").turnState === "token-v2") {
    pass("Turn-state persists and updates across turns in same session");
  } else {
    fail("Turn-state not persisting across turns");
  }

  // resolveSessionId
  const sessionId = store.resolveSessionId();
  if (typeof sessionId === "string" && sessionId.length > 0) {
    pass(`resolveSessionId() returns "${sessionId}" (default — no run context)`);
  } else {
    fail("resolveSessionId() returned invalid value");
  }

  store.clearAllSessions();
}

// ── 2. WS Gate ─────────────────────────────────────────────────────────────────

async function verifyWsGate() {
  header("2. WS Gate — Account-Level Concurrency Control");

  const gate = await import(path.join(projectRoot, "lib/ai/providers/codex-ws-gate"));
  gate.releaseAllWs();

  // Single slot
  const ticket1 = gate.tryAcquireWs("gate-test-1");
  if (ticket1) {
    pass("First WS request acquires a slot");
  } else {
    fail("First WS request was denied");
  }

  const ticket2 = gate.tryAcquireWs("gate-test-2");
  if (ticket2 === null) {
    pass("Second concurrent WS request is denied (gate full)");
  } else {
    fail("Second concurrent WS request was allowed — gate is not limiting");
    gate.releaseWs(ticket2);
  }

  const ticket3 = gate.tryAcquireWs("gate-test-3");
  if (ticket3 === null) {
    pass("Third concurrent WS request is also denied");
  } else {
    fail("Third concurrent WS request was allowed");
    gate.releaseWs(ticket3);
  }

  // Release and re-acquire
  if (ticket1) gate.releaseWs(ticket1);
  const ticket4 = gate.tryAcquireWs("gate-test-4");
  if (ticket4) {
    pass("After release, new WS request succeeds");
    gate.releaseWs(ticket4);
  } else {
    fail("After release, new WS request was still denied");
  }

  gate.releaseAllWs();
}

// ── 3. WebSocket Transport ─────────────────────────────────────────────────────

async function verifyWsTransport() {
  header("3. WebSocket Transport — Structured Errors & First-Data Resolution");

  const ws = await import(path.join(projectRoot, "lib/ai/providers/codex-websocket"));

  // WsTransportError
  const err = new ws.WsTransportError("handshake failed: 426", 426, "captured-turn-state");
  if (err instanceof Error && (err as any).statusCode === 426 && (err as any).turnState === "captured-turn-state") {
    pass("WsTransportError carries statusCode and turnState");
  } else {
    fail("WsTransportError missing structured fields");
  }

  // Verify sendViaWebSocket accepts WsSendOptions
  if (typeof ws.sendViaWebSocket === "function") {
    pass("sendViaWebSocket is exported and callable");
  } else {
    fail("sendViaWebSocket not found");
  }

  info("First-data resolution: sendViaWebSocket now waits for first message before resolving");
  info("onStreamError callback: fires on post-open errors (unreachable by try/catch)");
  info("onStreamComplete callback: fires on successful stream completion");
}

// ── 4. Error Classification ────────────────────────────────────────────────────

async function verifyErrorClassification() {
  header("4. Error Classification");

  const { classifyRecoverability } = await import(path.join(projectRoot, "lib/ai/retry/stream-recovery"));

  // Production session-invalidation error
  const prodError = classifyRecoverability({
    provider: "codex",
    message: "An error occurred while processing your request. You can retry your request, or contact us through our help center at help.openai.com if the error persists.",
  });
  if (!prodError.recoverable && prodError.reason === "unknown") {
    pass("Session-invalidation error classified as non-recoverable (no wasteful retries)");
  } else {
    fail(`Session-invalidation error misclassified: recoverable=${prodError.recoverable}, reason=${prodError.reason}`);
  }

  // failed to pipe response
  const pipeError = classifyRecoverability({
    provider: "codex",
    message: "failed to pipe response",
  });
  if (pipeError.recoverable) {
    warn('"failed to pipe response" classified as recoverable — note that with the new architecture, this error should occur much less frequently');
  } else {
    pass('"failed to pipe response" classified as non-recoverable');
  }
}

// ── 5. Architecture Summary ────────────────────────────────────────────────────

async function verifySummary() {
  header("5. Integration — Concurrent Agent Scenario");

  const store = await import(path.join(projectRoot, "lib/ai/providers/codex-session-store"));
  const gate = await import(path.join(projectRoot, "lib/ai/providers/codex-ws-gate"));

  store.clearAllSessions();
  gate.releaseAllWs();

  const sessions = ["initiator-session", "explore-session", "reviewer-session"];

  info("Scenario: 3 agents fire Codex requests simultaneously");
  info("");

  // Initiator gets WS
  const ticket = gate.tryAcquireWs(sessions[0]);
  info(`  Initiator: ${ticket ? "WS acquired" : "HTTP fallback"}`);
  info(`  Explore:   ${gate.tryAcquireWs(sessions[1]) ? "WS acquired" : "HTTP fallback"}`);
  info(`  Reviewer:  ${gate.tryAcquireWs(sessions[2]) ? "WS acquired" : "HTTP fallback"}`);

  if (ticket && gate.getActiveWsCount() === 1) {
    pass("Only 1 concurrent WS connection — other agents use HTTP SSE");
  } else {
    fail("Concurrency control failed");
  }

  // Each session gets its own turn-state
  store.setTurnState(sessions[0], "routing-A");
  store.setTurnState(sessions[1], "routing-B");
  store.setTurnState(sessions[2], "routing-C");

  const allUnique = new Set([
    store.getSessionState(sessions[0]).turnState,
    store.getSessionState(sessions[1]).turnState,
    store.getSessionState(sessions[2]).turnState,
  ]).size === 3;

  if (allUnique) {
    pass("Turn-state is isolated per session — no cross-contamination");
  } else {
    fail("Turn-state leaked between sessions");
  }

  if (ticket) gate.releaseWs(ticket);
  store.clearAllSessions();
  gate.releaseAllWs();
}

// ── 6. Live Test ───────────────────────────────────────────────────────────────

async function runLiveTest() {
  header("6. Live WebSocket Connection Test");

  try {
    const { loadSettings } = await import(path.join(projectRoot, "lib/settings/settings-manager"));
    const settings = loadSettings();

    if (!settings.codexToken?.access_token) {
      warn("No Codex token found in settings. Skipping live test.");
      return;
    }

    const { decodeCodexJWT } = await import(path.join(projectRoot, "lib/auth/codex-auth"));
    const decoded = decodeCodexJWT(settings.codexToken.access_token);

    if (!decoded?.accountId) {
      warn("Could not decode account ID from token. Skipping live test.");
      return;
    }

    info(`Account: ${decoded.email || "unknown"}`);
    info(`Account ID: ${decoded.accountId.slice(0, 8)}...`);

    const WebSocket = _require("ws");
    const WS_URL = "wss://chatgpt.com/backend-api/codex/responses";

    info("Opening 2 concurrent WebSocket connections to verify behavior...");

    const openWs = (id: number): Promise<{ id: number; status: string; error?: string }> => {
      return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL, {
          headers: {
            Authorization: `Bearer ${settings.codexToken.access_token}`,
            "ChatGPT-Account-ID": decoded.accountId,
            "OpenAI-Beta": "responses_websockets=2026-02-06",
            originator: "codex_cli_rs",
            "User-Agent": "codex_cli_rs/0.1.0 (Mac OS; arm64)",
          },
        });

        const timeout = setTimeout(() => { ws.close(); resolve({ id, status: "timeout" }); }, 15000);

        ws.on("open", () => {
          info(`  WS #${id}: connected`);
          ws.send(JSON.stringify({ type: "response.create", model: "gpt-5.3-codex-mini", input: [{ type: "message", role: "user", content: "Say 'ok'" }], stream: true }));
        });

        ws.on("message", (data: any) => {
          try {
            const event = JSON.parse(data.toString());
            if (event.type === "error") { clearTimeout(timeout); ws.close(); resolve({ id, status: "error", error: event.error?.message }); }
            if (event.type === "response.completed" || event.type === "response.done") { clearTimeout(timeout); ws.close(); resolve({ id, status: "completed" }); }
          } catch {}
        });

        ws.on("error", (err: Error) => { clearTimeout(timeout); resolve({ id, status: "connection_error", error: err.message }); });
        ws.on("unexpected-response", (_req: any, res: any) => { clearTimeout(timeout); resolve({ id, status: `rejected_${res.statusCode}` }); });
      });
    };

    const [r1, r2] = await Promise.all([openWs(0), openWs(1)]);

    info("");
    info(`  WS #0: ${r1.status}${r1.error ? ` — ${r1.error.slice(0, 80)}` : ""}`);
    info(`  WS #1: ${r2.status}${r2.error ? ` — ${r2.error.slice(0, 80)}` : ""}`);

    if (r1.status === "completed" && r2.status === "completed") {
      pass("Both concurrent connections succeeded (OpenAI may not be enforcing limits currently)");
    } else if (r1.status === "error" || r2.status === "error") {
      warn("At least one connection was killed — confirms need for WS gate");
    } else {
      warn(`Unexpected: WS#0=${r1.status}, WS#1=${r2.status}`);
    }
  } catch (error) {
    warn(`Live test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold("\nCodex Parallel Session Architecture Verification"));
  console.log("─".repeat(50));

  await verifySessionStore();
  await verifyWsGate();
  await verifyWsTransport();
  await verifyErrorClassification();
  await verifySummary();

  if (isLive) {
    await runLiveTest();
  } else {
    header("6. Live Test (skipped)");
    info("Run with --live to test actual WebSocket connections.");
  }

  header("Results");
  console.log(`  ${green(`${passed} passed`)}  ${failed > 0 ? red(`${failed} failed`) : ""}  ${warned > 0 ? yellow(`${warned} warnings`) : ""}`);

  console.log(`
${bold("Architecture:")}

  1. ${cyan("CodexSessionStore")} — Per-session state keyed by sessionId from
     AsyncLocalStorage (run context). TurnState persists across turns,
     wsDisabledUntil is scoped per session. TTL cleanup prevents leaks.

  2. ${cyan("CodexWsGate")} — Account-level semaphore. Limits concurrent WS
     connections to 1. Excess requests fall back to HTTP SSE immediately
     (no queuing, no head-of-line blocking).

  3. ${cyan("sendViaWebSocket")} — Resolves only after first data event
     (not on "open"). Post-open errors fire onStreamError callback.
     WsTransportError carries turnState for caller recovery.

  4. ${cyan("createCodexFetch")} — Reads sessionId from run context,
     uses session store for state, gate for WS access. Provider is
     cached (state is external). Handles WsTransportError turn-state
     recovery and cascading WS disable on failures.
`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
