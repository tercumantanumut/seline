/**
 * API Context Fetcher
 * 
 * Fetches data from custom APIs and formats for prompt injection.
 */

import type { ContextFetcher, APIContextConfig } from "./types";

export class APIContextFetcher implements ContextFetcher<Record<string, unknown>> {
  type = "api";

  async fetch(rawConfig: Record<string, unknown>, _userId: string): Promise<string> {
    const config = rawConfig as unknown as APIContextConfig;
    const { url, method = "GET", headers = {}, body, jsonPath } = config;

    if (!url) {
      throw new Error("API URL is required");
    }

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: method !== "GET" && body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract data using jsonPath if provided
    let extractedData = data;
    if (jsonPath) {
      extractedData = this.extractByPath(data, jsonPath);
    }

    // Format the data for prompt injection
    return this.formatData(extractedData);
  }

  private extractByPath(data: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private formatData(data: unknown): string {
    if (typeof data === "string") {
      return data;
    }

    if (Array.isArray(data)) {
      return data
        .map((item, i) => `${i + 1}. ${this.formatItem(item)}`)
        .join("\n");
    }

    if (typeof data === "object" && data !== null) {
      return JSON.stringify(data, null, 2);
    }

    return String(data);
  }

  private formatItem(item: unknown): string {
    if (typeof item === "string") {
      return item;
    }
    if (typeof item === "object" && item !== null) {
      // Try to create a readable summary
      const obj = item as Record<string, unknown>;
      const parts: string[] = [];
      
      // Common fields to display
      const displayFields = ["name", "title", "description", "id", "status"];
      for (const field of displayFields) {
        if (field in obj && obj[field]) {
          parts.push(`${field}: ${obj[field]}`);
        }
      }
      
      return parts.length > 0 ? parts.join(", ") : JSON.stringify(item);
    }
    return String(item);
  }
}

