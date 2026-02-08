import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/local-auth";
import {
  getOrCreateLocalUser,
  getOrCreateCharacterSession,
  createSession,
  listSessionsPaginated,
  getSessionWithMessages,
} from "@/lib/db/queries";
import { getCharacterFull } from "@/lib/characters/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import ChatInterface from "@/components/chat/chat-interface";
import { Shell } from "@/components/layout/shell";
import { type CharacterDisplayData } from "@/components/assistant-ui/character-context";
import { getCharacterInitials } from "@/lib/utils";
import { convertDBMessagesToUIMessages } from "@/lib/messages/converter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sessionId?: string; new?: string }>;
}

export default async function CharacterChatPage({ params, searchParams }: Props) {
  const { id: characterId } = await params;
  const { sessionId: sessionIdFromUrl, new: forceNew } = await searchParams;

  const t = await getTranslations("chat");
  const te = await getTranslations("errors");

  try {
    // 1. Auth & User
    // requireAuth usually throws or redirects if not authed, but let's be careful
    // In some setups it might return null or userId
    const reqHeaders = await headers();
    const userId = await requireAuth({ headers: reqHeaders } as any);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    // 2. Character Data
    const charData = await getCharacterFull(characterId);
    if (!charData) {
      return (
        <ErrorState
          title={te("notFound")}
          description={t("empty.description")}
          actions={{ goHome: t("actions.goHome"), createAgent: t("actions.createAgent") }}
        />
      );
    }

    // Check ownership
    if (charData.userId !== dbUser.id) {
      return (
        <ErrorState
          title={te("forbidden")}
          description={t("empty.description")}
          actions={{ goHome: t("actions.goHome"), createAgent: t("actions.createAgent") }}
        />
      );
    }

    // 3. Session Logic
    let activeSessionId: string;
    let initialMessages: any[] = [];

    if (forceNew === "true") {
      // Force create new session
      const session = await createSession({
        title: `Chat with ${charData.name}`,
        userId: dbUser.id,
        metadata: { characterId, characterName: charData.name },
      });
      activeSessionId = session.id;
      // Redirect to include sessionId and remove ?new=true
      redirect(`/chat/${characterId}?sessionId=${activeSessionId}`);
    } else if (sessionIdFromUrl) {
      // Use provided sessionId
      const sessionWithMsgs = await getSessionWithMessages(sessionIdFromUrl);

      // Validate session: exists, belongs to user, and is for this character
      if (
        !sessionWithMsgs ||
        sessionWithMsgs.session.userId !== dbUser.id ||
        (sessionWithMsgs.session.metadata as any)?.characterId !== characterId
      ) {
        // Invalid session for this context, fall back to find/create
        const { session } = await getOrCreateCharacterSession(dbUser.id, characterId, charData.name);
        redirect(`/chat/${characterId}?sessionId=${session.id}`);
      }

      activeSessionId = sessionWithMsgs.session.id;
      initialMessages = convertDBMessagesToUIMessages(sessionWithMsgs.messages);
    } else {
      // No sessionId, find recent or create one
      const { session } = await getOrCreateCharacterSession(dbUser.id, characterId, charData.name);
      redirect(`/chat/${characterId}?sessionId=${session.id}`);
    }

    // 4. Prepare Client Data
    const primaryImage = charData.images?.find((img) => img.isPrimary);
    const avatarImage = charData.images?.find((img) => img.imageType === "avatar");
    const anyImage = charData.images?.[0];

    const characterDisplay: CharacterDisplayData = {
      id: charData.id,
      name: charData.name,
      displayName: charData.displayName,
      tagline: charData.tagline,
      avatarUrl: avatarImage?.url || primaryImage?.url || anyImage?.url || null,
      primaryImageUrl: primaryImage?.url || anyImage?.url || null,
      initials: getCharacterInitials(charData.name),
      suggestedPrompts: [],
    };

    // Fetch initial session page for history sidebar
    const sessionPage = await listSessionsPaginated({
      userId: dbUser.id,
      characterId,
      limit: 20,
    });

    return (
      <ChatInterface
        character={charData as any}
        characterDisplay={characterDisplay}
        initialSessionId={activeSessionId}
        initialSessions={sessionPage.sessions as any}
        initialNextCursor={sessionPage.nextCursor}
        initialTotalSessionCount={sessionPage.totalCount}
        initialMessages={initialMessages}
      />
    );

  } catch (error: any) {
    if (error.digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // Let Next.js handle redirects
    }
    console.error("Chat initialization error:", error);
    return (
      <ErrorState
        title={te("generic")}
        description={t("empty.description")}
        actions={{ goHome: t("actions.goHome"), createAgent: t("actions.createAgent") }}
      />
    );
  }
}

function ErrorState({
  title,
  description,
  actions
}: {
  title: string;
  description: string;
  actions: { goHome: string; createAgent: string }
}) {
  return (
    <Shell>
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
          <div className="flex gap-4">
            <Button variant="outline" asChild>
              <Link href="/create-character">{actions.createAgent}</Link>
            </Button>
            <Button asChild>
              <Link href="/">{actions.goHome}</Link>
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
