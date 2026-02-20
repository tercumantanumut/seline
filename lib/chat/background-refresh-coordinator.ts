export type BackgroundRefreshMode = "incremental" | "full";

export interface BackgroundRefreshRequest {
  sessionId: string;
  mode: BackgroundRefreshMode;
  reason: "progress" | "started" | "completed" | "resume" | "visibility" | "poll" | "hydrate";
  runId?: string;
  eventTimestamp?: string;
  immediate?: boolean;
}

interface CoordinatorOptions {
  getActiveSessionId: () => string | null;
  applyRefresh: (sessionId: string, mode: BackgroundRefreshMode) => Promise<void>;
  coalesceMs?: number;
  minIncrementalIntervalMs?: number;
}

interface PendingRequest {
  sessionId: string;
  mode: BackgroundRefreshMode;
  immediate: boolean;
}

function toTimestamp(value?: string): number {
  if (!value) {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export class BackgroundRefreshCoordinator {
  private readonly getActiveSessionId: CoordinatorOptions["getActiveSessionId"];
  private readonly applyRefresh: CoordinatorOptions["applyRefresh"];
  private readonly coalesceMs: number;
  private readonly minIncrementalIntervalMs: number;

  private pending: PendingRequest | null = null;
  private inFlight = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastIncrementalAt = 0;
  private lastProgressEventAtByRun = new Map<string, number>();

  constructor({
    getActiveSessionId,
    applyRefresh,
    coalesceMs = 120,
    minIncrementalIntervalMs = 700,
  }: CoordinatorOptions) {
    this.getActiveSessionId = getActiveSessionId;
    this.applyRefresh = applyRefresh;
    this.coalesceMs = coalesceMs;
    this.minIncrementalIntervalMs = minIncrementalIntervalMs;
  }

  enqueue(request: BackgroundRefreshRequest): void {
    if (this.disposed) {
      return;
    }

    const activeSessionId = this.getActiveSessionId();
    if (!request.sessionId || !activeSessionId || request.sessionId !== activeSessionId) {
      return;
    }

    if (request.reason === "progress" && request.runId) {
      const eventTimestamp = toTimestamp(request.eventTimestamp);
      if (Number.isFinite(eventTimestamp)) {
        const latestEventTimestamp = this.lastProgressEventAtByRun.get(request.runId);
        if (typeof latestEventTimestamp === "number" && eventTimestamp < latestEventTimestamp) {
          return;
        }
        this.lastProgressEventAtByRun.set(request.runId, eventTimestamp);
      }
    }

    const pending = this.pending;
    const nextMode = pending
      ? pending.mode === "full" || request.mode === "full"
        ? "full"
        : "incremental"
      : request.mode;

    this.pending = {
      sessionId: request.sessionId,
      mode: nextMode,
      immediate: Boolean(pending?.immediate || request.immediate || request.mode === "full"),
    };

    this.scheduleFlush();
  }

  dispose(): void {
    this.disposed = true;
    this.pending = null;
    this.inFlight = false;
    this.lastProgressEventAtByRun.clear();

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private scheduleFlush(): void {
    if (this.inFlight || this.flushTimer || !this.pending) {
      return;
    }

    const now = Date.now();
    const delayFromCadence =
      this.pending.mode === "incremental"
        ? Math.max(0, this.lastIncrementalAt + this.minIncrementalIntervalMs - now)
        : 0;

    const delay = this.pending.immediate ? delayFromCadence : Math.max(this.coalesceMs, delayFromCadence);

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  private async flush(): Promise<void> {
    if (this.disposed || this.inFlight || !this.pending) {
      return;
    }

    const request = this.pending;
    this.pending = null;

    const activeSessionId = this.getActiveSessionId();
    if (!activeSessionId || activeSessionId !== request.sessionId) {
      this.scheduleFlush();
      return;
    }

    this.inFlight = true;
    try {
      await this.applyRefresh(request.sessionId, request.mode);
      if (request.mode === "incremental") {
        this.lastIncrementalAt = Date.now();
      }
    } finally {
      this.inFlight = false;
      if (!this.disposed) {
        this.scheduleFlush();
      }
    }
  }
}
