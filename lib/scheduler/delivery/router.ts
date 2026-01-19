/**
 * Delivery Router
 * 
 * Routes task results to the appropriate delivery handler.
 */

import type { DeliveryHandler, DeliveryPayload, DeliveryResult } from "./types";
import type { DeliveryMethod, DeliveryConfig } from "@/lib/db/sqlite-schedule-schema";
import { EmailDeliveryHandler } from "./email-handler";
import { SlackDeliveryHandler } from "./slack-handler";
import { WebhookDeliveryHandler } from "./webhook-handler";

export class DeliveryRouter {
  private handlers: Map<string, DeliveryHandler> = new Map();

  constructor() {
    // Register default handlers
    this.register(new EmailDeliveryHandler());
    this.register(new SlackDeliveryHandler());
    this.register(new WebhookDeliveryHandler());
  }

  /**
   * Register a delivery handler
   */
  register(handler: DeliveryHandler): void {
    this.handlers.set(handler.type, handler);
  }

  /**
   * Deliver task results via the configured method
   */
  async deliver(
    method: DeliveryMethod,
    config: DeliveryConfig,
    payload: DeliveryPayload
  ): Promise<DeliveryResult> {
    // "session" means no external delivery
    if (method === "session") {
      return { success: true };
    }

    const handler = this.handlers.get(method);
    if (!handler) {
      console.warn(`[DeliveryRouter] No handler for method "${method}"`);
      return { success: false, error: `Unknown delivery method: ${method}` };
    }

    try {
      await handler.deliver(payload, config as unknown as Record<string, unknown>);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[DeliveryRouter] ${method} delivery failed:`, errorMessage);
      // Don't fail the task, just report the delivery failure
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if a delivery method is supported
   */
  isSupported(method: string): boolean {
    return method === "session" || this.handlers.has(method);
  }
}

// Singleton instance
let routerInstance: DeliveryRouter | null = null;

export function getDeliveryRouter(): DeliveryRouter {
  if (!routerInstance) {
    routerInstance = new DeliveryRouter();
  }
  return routerInstance;
}

