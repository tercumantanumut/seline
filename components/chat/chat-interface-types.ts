import type { UIMessage } from "ai";
import type { SessionChannelType, SessionInfo } from "@/components/chat/chat-sidebar/types";
import type { CharacterDisplayData } from "@/components/assistant-ui/character-context";

export interface CharacterFullData {
    id: string;
    name: string;
    displayName?: string | null;
    tagline?: string | null;
    status: string;
    voice?: {
        exampleGreeting?: string | null;
    } | null;
    images?: Array<{
        url: string;
        isPrimary: boolean;
        imageType: string;
    }>;
}

export interface DBMessage {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: unknown;
    createdAt: Date | string;
}

export interface ChatInterfaceProps {
    character: CharacterFullData;
    initialSessionId: string;
    initialSessions: SessionInfo[];
    initialNextCursor: string | null;
    initialTotalSessionCount: number;
    initialMessages: UIMessage[];
    characterDisplay: CharacterDisplayData;
}

// Combined state to ensure sessionId and messages always update atomically
export interface SessionState {
    sessionId: string;
    messages: UIMessage[];
}

export interface ActiveRunState {
    runId: string;
    taskName?: string;
    startedAt: string;
}

export interface DeepResearchStateSnapshot {
    runId: string;
    query: string;
    phase: string;
    phaseMessage: string;
    progress: { completed: number; total: number; currentQuery: string } | null;
    findings: Array<unknown>;
    finalReport: unknown | null;
    error: string | null;
    updatedAt: string;
}

export interface ActiveRunLookupResponse {
    hasActiveRun: boolean;
    runId?: string | null;
    pipelineName?: string;
    latestDeepResearchRunId?: string | null;
    latestDeepResearchStatus?: string | null;
    latestDeepResearchState?: DeepResearchStateSnapshot | null;
}

export type ChannelFilter = "all" | SessionChannelType;
export type DateRangeFilter = "all" | "today" | "week" | "month";
