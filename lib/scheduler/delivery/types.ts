/**
 * Delivery Handler Types
 * 
 * Types for delivering scheduled task results to external channels.
 */

export interface DeliveryPayload {
  taskId: string;
  taskName: string;
  runId: string;
  status: "succeeded" | "failed";
  summary?: string;
  sessionId?: string;
  sessionUrl?: string;
  error?: string;
  durationMs?: number;
  metadata: Record<string, unknown>;
}

export interface DeliveryHandler {
  type: string;
  deliver(payload: DeliveryPayload, config: Record<string, unknown>): Promise<void>;
}

export interface DeliveryResult {
  success: boolean;
  error?: string;
}

