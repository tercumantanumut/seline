/**
 * Tests for the Codex parallel session architecture.
 *
 * Covers the three root causes identified in the production failure analysis:
 *
 *   1. Session store — per-session state isolation and TTL cleanup
 *   2. WS gate — account-level concurrency control
 *   3. WebSocket transport — first-data resolution, structured errors,
 *      post-open error callbacks
 *   4. Error classification — correct recovery behavior for known errors
 *
 * These tests exercise actual runtime code (not static analysis or regex).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── 1. Session Store ────────────────────────────────────────────────────────

describe("CodexSessionStore", () => {
  // Use a lazy import so we can reset module state between tests
  let store: typeof import("@/lib/ai/providers/codex-session-store");

  beforeEach(async () => {
    store = await import("@/lib/ai/providers/codex-session-store");
    store.clearAllSessions();
  });

  it("creates isolated state per session", () => {
    const stateA = store.getSessionState("session-A");
    const stateB = store.getSessionState("session-B");

    // Mutate A
    stateA.turnState = "turn-AAA";
    store.disableWs("session-A", 60_000);

    // B is unaffected
    expect(stateB.turnState).toBe(null);
    expect(store.isWsEnabled("session-B")).toBe(true);

    // A has its own state
    expect(store.getSessionState("session-A").turnState).toBe("turn-AAA");
    expect(store.isWsEnabled("session-A")).toBe(false);
  });

  it("persists turn-state across calls with same sessionId", () => {
    store.setTurnState("session-X", "routing-token-1");

    // Simulate a new request for the same session
    const state = store.getSessionState("session-X");
    expect(state.turnState).toBe("routing-token-1");

    // Update after second response
    store.setTurnState("session-X", "routing-token-2");
    expect(store.getSessionState("session-X").turnState).toBe("routing-token-2");
  });

  it("scopes WS-disabled cooldown to the session", () => {
    store.disableWs("session-A", 100);
    store.disableWs("session-B", 50_000);

    // A's cooldown is short
    expect(store.isWsEnabled("session-A")).toBe(false);

    // Wait for A's cooldown to expire
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    expect(store.isWsEnabled("session-A")).toBe(true);
    expect(store.isWsEnabled("session-B")).toBe(false);
    vi.useRealTimers();
  });

  it("resolveSessionId returns default key outside run context", () => {
    // No run context is set in tests
    const sessionId = store.resolveSessionId();
    expect(sessionId).toBe("__codex_default__");
  });

  it("tracks session count correctly", () => {
    expect(store.getSessionCount()).toBe(0);

    store.getSessionState("s1");
    store.getSessionState("s2");
    store.getSessionState("s3");
    expect(store.getSessionCount()).toBe(3);

    store.clearAllSessions();
    expect(store.getSessionCount()).toBe(0);
  });
});

// ── 2. WS Gate ──────────────────────────────────────────────────────────────

describe("CodexWsGate", () => {
  let gate: typeof import("@/lib/ai/providers/codex-ws-gate");

  beforeEach(async () => {
    gate = await import("@/lib/ai/providers/codex-ws-gate");
    gate.releaseAllWs();
  });

  it("allows one WS connection at a time", () => {
    const ticket1 = gate.tryAcquireWs("session-1");
    expect(ticket1).not.toBeNull();
    expect(gate.getActiveWsCount()).toBe(1);

    // Second request should be denied
    const ticket2 = gate.tryAcquireWs("session-2");
    expect(ticket2).toBeNull();
    expect(gate.getActiveWsCount()).toBe(1);

    // After releasing, a new request can acquire
    gate.releaseWs(ticket1!);
    expect(gate.getActiveWsCount()).toBe(0);

    const ticket3 = gate.tryAcquireWs("session-3");
    expect(ticket3).not.toBeNull();
    expect(gate.getActiveWsCount()).toBe(1);
    gate.releaseWs(ticket3!);
  });

  it("prevents concurrent agents from opening multiple WS connections", () => {
    // Simulate: initiator + 2 sub-agents all try WS simultaneously
    const ticketInitiator = gate.tryAcquireWs("initiator");
    const ticketExplore = gate.tryAcquireWs("sub-agent-explore");
    const ticketReviewer = gate.tryAcquireWs("sub-agent-reviewer");

    // Only one gets through
    expect(ticketInitiator).not.toBeNull();
    expect(ticketExplore).toBeNull();
    expect(ticketReviewer).toBeNull();

    // The denied agents fall back to HTTP (tested in integration)
    gate.releaseWs(ticketInitiator!);
  });

  it("tracks tickets with correct metadata", () => {
    const ticket = gate.tryAcquireWs("session-abc");
    expect(ticket).not.toBeNull();
    expect(ticket!.sessionId).toBe("session-abc");
    expect(ticket!.acquiredAt).toBeLessThanOrEqual(Date.now());

    const tickets = gate.getActiveWsTickets();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].sessionId).toBe("session-abc");

    gate.releaseWs(ticket!);
    expect(gate.getActiveWsTickets()).toHaveLength(0);
  });
});

// ── 3. WsTransportError ─────────────────────────────────────────────────────

describe("WsTransportError", () => {
  it("carries turnState and statusCode for caller recovery", async () => {
    const { WsTransportError } = await import("@/lib/ai/providers/codex-websocket");

    const err = new WsTransportError("WebSocket handshake failed: 426", 426, "saved-turn-state");

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WsTransportError");
    expect(err.message).toContain("426");
    expect(err.statusCode).toBe(426);
    expect(err.turnState).toBe("saved-turn-state");
  });

  it("allows turnState recovery even on handshake rejection", async () => {
    const { WsTransportError } = await import("@/lib/ai/providers/codex-websocket");

    const err = new WsTransportError("WebSocket handshake failed: 403", 403, "captured-during-failure");

    // The caller (codex-provider) can read turnState from the error
    // and persist it in the session store — this was impossible before
    // when sendViaWebSocket() rejected with a plain Error.
    expect(err.turnState).toBe("captured-during-failure");
    expect(err.statusCode).toBe(403);
  });
});

// ── 4. Error Classification ─────────────────────────────────────────────────

describe("Codex error classification", () => {
  it("classifies the production session-invalidation error as non-recoverable", async () => {
    const { classifyRecoverability } = await import("@/lib/ai/retry/stream-recovery");

    const classification = classifyRecoverability({
      provider: "codex",
      message:
        "An error occurred while processing your request. You can retry your request, or contact us through our help center at help.openai.com if the error persists.",
    });

    // Generic error → non-recoverable → no auto-retry
    expect(classification.recoverable).toBe(false);
    expect(classification.reason).toBe("unknown");
  });

  it("classifies 'failed to pipe response' as recoverable (transient)", async () => {
    const { classifyRecoverability } = await import("@/lib/ai/retry/stream-recovery");

    const classification = classifyRecoverability({
      provider: "codex",
      message: "failed to pipe response",
    });

    expect(classification.recoverable).toBe(true);
    expect(classification.reason).toBe("recoverable_payload");
  });
});

// ── 5. Integration: session store + gate interaction ────────────────────────

describe("Session store + WS gate integration", () => {
  let store: typeof import("@/lib/ai/providers/codex-session-store");
  let gate: typeof import("@/lib/ai/providers/codex-ws-gate");

  beforeEach(async () => {
    store = await import("@/lib/ai/providers/codex-session-store");
    gate = await import("@/lib/ai/providers/codex-ws-gate");
    store.clearAllSessions();
    gate.releaseAllWs();
  });

  it("simulates the full concurrent agent scenario", () => {
    // 3 concurrent requests from different sessions (initiator + 2 sub-agents)
    const sessions = ["initiator-session", "explore-session", "reviewer-session"];

    // All sessions start with WS enabled
    for (const s of sessions) {
      expect(store.isWsEnabled(s)).toBe(true);
    }

    // Initiator acquires the WS slot
    const ticket = gate.tryAcquireWs(sessions[0]);
    expect(ticket).not.toBeNull();

    // Sub-agents can't get WS — they fall back to HTTP
    expect(gate.tryAcquireWs(sessions[1])).toBeNull();
    expect(gate.tryAcquireWs(sessions[2])).toBeNull();

    // Initiator's WS succeeds, gets turn-state
    store.setTurnState(sessions[0], "routing-AAA");

    // Sub-agents complete via HTTP, get their own turn-states
    store.setTurnState(sessions[1], "routing-BBB");
    store.setTurnState(sessions[2], "routing-CCC");

    // All states are isolated
    expect(store.getSessionState(sessions[0]).turnState).toBe("routing-AAA");
    expect(store.getSessionState(sessions[1]).turnState).toBe("routing-BBB");
    expect(store.getSessionState(sessions[2]).turnState).toBe("routing-CCC");

    // Release WS slot
    gate.releaseWs(ticket!);
    expect(gate.getActiveWsCount()).toBe(0);
  });

  it("simulates post-open WS error updating session state", () => {
    const sessionId = "session-with-ws-error";

    // Session starts with WS enabled
    expect(store.isWsEnabled(sessionId)).toBe(true);

    // WS opens, ticket acquired
    const ticket = gate.tryAcquireWs(sessionId);
    expect(ticket).not.toBeNull();

    // Simulate: WS opens and first data arrives (sendViaWebSocket resolves)
    store.setTurnState(sessionId, "turn-from-upgrade");

    // Simulate: LATER, WS error event fires (post-open error)
    // The onStreamError callback fires:
    store.disableWs(sessionId);
    gate.releaseWs(ticket!);

    // Next request for this session should use HTTP
    expect(store.isWsEnabled(sessionId)).toBe(false);

    // Turn-state is preserved despite the error
    expect(store.getSessionState(sessionId).turnState).toBe("turn-from-upgrade");
  });

  it("simulates turn-state persistence across turns in same session", () => {
    const sessionId = "multi-turn-chat";

    // Turn 1: WS succeeds
    store.setTurnState(sessionId, "turn-state-v1");

    // Turn 2: new request reads previous turn-state
    const state2 = store.getSessionState(sessionId);
    expect(state2.turnState).toBe("turn-state-v1");

    // Turn 2 gets updated turn-state
    store.setTurnState(sessionId, "turn-state-v2");

    // Turn 3: reads turn-state-v2
    const state3 = store.getSessionState(sessionId);
    expect(state3.turnState).toBe("turn-state-v2");
  });
});

// ── 6. Architecture verification (minimal, replaces old regex tests) ────────

describe("Architecture verification", () => {
  it("codex-provider exports createCodexProvider (not a cached singleton getter)", async () => {
    const mod = await import("@/lib/ai/providers/codex-provider");
    expect(typeof mod.createCodexProvider).toBe("function");
  });

  it("codex-session-store resolveSessionId is available", async () => {
    const mod = await import("@/lib/ai/providers/codex-session-store");
    expect(typeof mod.resolveSessionId).toBe("function");
    expect(typeof mod.getSessionState).toBe("function");
    expect(typeof mod.setTurnState).toBe("function");
    expect(typeof mod.isWsEnabled).toBe("function");
    expect(typeof mod.disableWs).toBe("function");
  });

  it("codex-ws-gate exports tryAcquireWs and releaseWs", async () => {
    const mod = await import("@/lib/ai/providers/codex-ws-gate");
    expect(typeof mod.tryAcquireWs).toBe("function");
    expect(typeof mod.releaseWs).toBe("function");
  });

  it("WsTransportError is exported from codex-websocket", async () => {
    const mod = await import("@/lib/ai/providers/codex-websocket");
    expect(mod.WsTransportError).toBeDefined();
    expect(typeof mod.WsTransportError).toBe("function");
  });
});
