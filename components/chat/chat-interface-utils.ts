import type { UIMessage } from "ai";
import type { SessionInfo } from "@/components/chat/chat-sidebar/types";

export const sortSessionsByUpdatedAt = (sessions: SessionInfo[]) =>
    [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

export const getSessionSignature = (session: SessionInfo) =>
    [
        session.id,
        session.updatedAt,
        session.title ?? "",
        session.metadata?.channelType ?? "",
        session.metadata?.channelPeerId ?? "",
        session.metadata?.channelPeerName ?? "",
    ].join("|");

export const areSessionsEquivalent = (prev: SessionInfo[], next: SessionInfo[]) => {
    if (prev.length !== next.length) {
        return false;
    }
    for (let index = 0; index < prev.length; index += 1) {
        if (getSessionSignature(prev[index]) !== getSessionSignature(next[index])) {
            return false;
        }
    }
    return true;
};

export const isTextPart = (part: UIMessage["parts"][number] | undefined | null): part is { type: "text"; text: string } => {
    return Boolean(
        part &&
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    );
};

export const getMessageSignature = (message: UIMessage) => {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const partTypes = parts.map((part) => (part?.type ? String(part.type) : "text")).join(",");
    const textDigest = parts
        .filter(isTextPart)
        .map((part) => {
            const text = part.text || "";
            return `${text.length}:${text.slice(0, 80)}`;
        })
        .join("|");
    return `${message.id || ""}:${message.role}:${partTypes}:${textDigest}`;
};

export const getMessagesSignature = (messages: UIMessage[]) => {
    if (!messages.length) {
        return "0";
    }
    const lastMessage = messages[messages.length - 1];
    return `${messages.length}:${getMessageSignature(lastMessage)}`;
};
