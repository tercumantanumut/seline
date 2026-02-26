"use client";

export const OPEN_CHANNELS_DIALOG_EVENT = "chat:open-channels-dialog";
export const OPEN_SYNC_FOLDERS_DIALOG_EVENT = "chat:open-sync-folders-dialog";

export interface ChatModalEventDetail {
  characterId?: string;
}

export function dispatchChatModalEvent(eventName: string, detail: ChatModalEventDetail): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<ChatModalEventDetail>(eventName, { detail }));
}
