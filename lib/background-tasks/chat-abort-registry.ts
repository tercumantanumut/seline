const globalForChatAbort = globalThis as typeof globalThis & {
  chatAbortControllers?: Map<string, AbortController>;
};

function getAbortMap(): Map<string, AbortController> {
  if (!globalForChatAbort.chatAbortControllers) {
    globalForChatAbort.chatAbortControllers = new Map();
  }
  return globalForChatAbort.chatAbortControllers;
}

export function registerChatAbortController(runId: string, controller: AbortController): void {
  getAbortMap().set(runId, controller);
}

export function removeChatAbortController(runId: string): void {
  getAbortMap().delete(runId);
}

export function abortChatRun(runId: string, reason?: string): boolean {
  const controller = getAbortMap().get(runId);
  if (!controller) {
    return false;
  }
  controller.abort(reason);
  return true;
}
