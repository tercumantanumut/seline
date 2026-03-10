/**
 * Codex WebSocket Connection Gate — account-level concurrency control.
 *
 * OpenAI's Codex backend invalidates sessions when it detects multiple
 * concurrent WebSocket connections from the same account. In Selene,
 * this happens naturally: an initiator agent + 2 sub-agents can fire
 * 3 concurrent requests, each opening its own WS connection.
 *
 * This gate enforces a process-wide limit on concurrent WS connections:
 *   - If the gate has capacity, the caller gets a ticket and may use WS.
 *   - If the gate is full, the caller is told to use HTTP instead.
 *
 * No queuing — callers that can't get a WS slot fall back to HTTP SSE
 * immediately rather than blocking. This prevents head-of-line blocking
 * where a slow WS connection starves all other agents.
 */

// ── Configuration ───────────────────────────────────────────────────────────

/**
 * Maximum concurrent WebSocket connections to the Codex backend.
 * Set to 1 because OpenAI appears to kill sessions on >1 concurrent WS.
 */
const MAX_CONCURRENT_WS = 1;

// ── Types ───────────────────────────────────────────────────────────────────

export interface WsTicket {
  /** Unique ID for this ticket (for logging/diagnostics). */
  id: number;
  /** Session that acquired this ticket. */
  sessionId: string;
  /** When the ticket was acquired. */
  acquiredAt: number;
}

// ── State ───────────────────────────────────────────────────────────────────

let nextTicketId = 1;
const activeTickets = new Map<number, WsTicket>();

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Try to acquire a WS connection slot.
 * Returns a ticket if a slot is available, null otherwise.
 * Callers that get null should fall back to HTTP SSE.
 */
export function tryAcquireWs(sessionId: string): WsTicket | null {
  if (activeTickets.size >= MAX_CONCURRENT_WS) {
    const holders = [...activeTickets.values()]
      .map(t => `${t.sessionId}(${Date.now() - t.acquiredAt}ms)`)
      .join(", ");
    console.debug(
      `[Codex WS Gate] Denied WS for session ${sessionId} — ` +
      `${activeTickets.size}/${MAX_CONCURRENT_WS} slots in use by: ${holders}`
    );
    return null;
  }

  const ticket: WsTicket = {
    id: nextTicketId++,
    sessionId,
    acquiredAt: Date.now(),
  };
  activeTickets.set(ticket.id, ticket);
  console.debug(
    `[Codex WS Gate] Acquired WS slot #${ticket.id} for session ${sessionId} ` +
    `(${activeTickets.size}/${MAX_CONCURRENT_WS})`
  );
  return ticket;
}

/**
 * Release a WS connection slot.
 * Must be called when the WS connection closes (success or failure).
 */
export function releaseWs(ticket: WsTicket): void {
  const existed = activeTickets.delete(ticket.id);
  if (existed) {
    const duration = Date.now() - ticket.acquiredAt;
    console.debug(
      `[Codex WS Gate] Released WS slot #${ticket.id} for session ${ticket.sessionId} ` +
      `after ${duration}ms (${activeTickets.size}/${MAX_CONCURRENT_WS})`
    );
  }
}

/**
 * Get the number of active WS connections (for diagnostics).
 */
export function getActiveWsCount(): number {
  return activeTickets.size;
}

/**
 * Get details of all active WS tickets (for diagnostics).
 */
export function getActiveWsTickets(): WsTicket[] {
  return [...activeTickets.values()];
}

/**
 * Force-release all tickets (for testing / emergency recovery).
 */
export function releaseAllWs(): void {
  activeTickets.clear();
}
