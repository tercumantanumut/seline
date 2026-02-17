import { describe, expect, it } from "vitest";

import {
  resolveChunkingOverrides,
  resolveFolderSyncBehavior,
  shouldRunForTrigger,
} from "@/lib/vectordb/sync-mode-resolver";

describe("sync-mode-resolver", () => {
  it("preserves default auto behavior when settings are omitted", () => {
    const behavior = resolveFolderSyncBehavior({
      indexingMode: "auto",
    }, true);

    expect(behavior.syncMode).toBe("auto");
    expect(behavior.shouldCreateEmbeddings).toBe(true);
    expect(behavior.allowsWatcherEvents).toBe(true);
    expect(behavior.allowsScheduledRuns).toBe(true);
    expect(behavior.allowsAutomaticAddSync).toBe(true);
  });

  it("manual mode disables automatic and scheduled triggers", () => {
    const behavior = resolveFolderSyncBehavior({
      indexingMode: "full",
      syncMode: "manual",
      syncCadenceMinutes: 10,
    }, true);

    expect(behavior.shouldCreateEmbeddings).toBe(true);
    expect(shouldRunForTrigger(behavior, "manual")).toBe(true);
    expect(shouldRunForTrigger(behavior, "auto")).toBe(false);
    expect(shouldRunForTrigger(behavior, "scheduled")).toBe(false);
    expect(shouldRunForTrigger(behavior, "triggered")).toBe(false);
  });

  it("scheduled mode only permits cadence runs", () => {
    const behavior = resolveFolderSyncBehavior({
      indexingMode: "files-only",
      syncMode: "scheduled",
      syncCadenceMinutes: 2,
    }, false);

    expect(behavior.syncCadenceMinutes).toBe(5);
    expect(behavior.shouldCreateEmbeddings).toBe(false);
    expect(shouldRunForTrigger(behavior, "scheduled")).toBe(true);
    expect(shouldRunForTrigger(behavior, "triggered")).toBe(false);
    expect(shouldRunForTrigger(behavior, "auto")).toBe(false);
  });

  it("triggered mode only permits watcher events", () => {
    const behavior = resolveFolderSyncBehavior({
      indexingMode: "auto",
      syncMode: "triggered",
    }, true);

    expect(shouldRunForTrigger(behavior, "triggered")).toBe(true);
    expect(shouldRunForTrigger(behavior, "scheduled")).toBe(false);
    expect(shouldRunForTrigger(behavior, "auto")).toBe(false);
  });

  it("resolves chunking presets and custom overrides", () => {
    const small = resolveFolderSyncBehavior({ indexingMode: "auto", chunkPreset: "small" }, true);
    const custom = resolveFolderSyncBehavior({
      indexingMode: "auto",
      chunkPreset: "custom",
      chunkSizeOverride: 1200,
      chunkOverlapOverride: 300,
    }, true);

    expect(resolveChunkingOverrides(small)).toEqual({
      chunkSize: 900,
      chunkOverlap: 180,
      useOverrides: true,
    });
    expect(resolveChunkingOverrides(custom)).toEqual({
      chunkSize: 1200,
      chunkOverlap: 300,
      useOverrides: true,
    });
  });
});
