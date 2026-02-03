export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length === 0) {
    return new AbortController().signal;
  }

  if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal }).any === "function") {
    return (AbortSignal as typeof AbortSignal & { any: (signals: AbortSignal[]) => AbortSignal }).any(activeSignals);
  }

  const controller = new AbortController();

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }

    signal.addEventListener(
      "abort",
      () => {
        if (!controller.signal.aborted) {
          controller.abort(signal.reason);
        }
      },
      { once: true }
    );
  }

  return controller.signal;
}
