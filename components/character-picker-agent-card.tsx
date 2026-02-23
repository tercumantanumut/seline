"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AnimatedCard } from "@/components/ui/animated-card";
import { AnimatedButton } from "@/components/ui/animated-button";
import { ToolBadge, getTopTools } from "@/components/ui/tool-badge";
import { useTranslations } from "next-intl";
import { getCharacterInitials } from "@/components/assistant-ui/character-context";
import { AgentOverflowMenu } from "@/components/character-picker-agent-overflow-menu";
import type { CharacterSummary } from "@/components/character-picker-types";

export function AgentCardInWorkflow({
  character,
  role,
  t,
  hasActiveSession,
  onContinueChat,
  onNewChat,
  onEditIdentity,
  onEditTools,
  onEditFolders,
  onEditMcp,
  onEditPlugins,
  onDuplicate,
  isDuplicating = false,
  addToWorkflowLabel,
  onAddToWorkflow,
  canAddToWorkflow,
  onDelete,
  onRemoveFromWorkflow,
  removeFromWorkflowLabel,
  router,
  dataAnimateCard,
}: {
  character: CharacterSummary;
  role?: "initiator" | "subagent";
  t: ReturnType<typeof useTranslations>;
  hasActiveSession: (charId: string, initialStatus?: boolean) => boolean;
  onContinueChat: (id: string) => void;
  onNewChat: (id: string) => void;
  onEditIdentity: (c: CharacterSummary) => void;
  onEditTools: (c: CharacterSummary) => void;
  onEditFolders: (c: CharacterSummary) => void;
  onEditMcp: (c: CharacterSummary) => void;
  onEditPlugins: (c: CharacterSummary) => void;
  onDuplicate: (characterId: string) => void;
  isDuplicating?: boolean;
  addToWorkflowLabel?: string;
  onAddToWorkflow?: (c: CharacterSummary) => void;
  canAddToWorkflow?: boolean;
  onDelete: (c: CharacterSummary) => void;
  onRemoveFromWorkflow?: () => void;
  removeFromWorkflowLabel?: string;
  router: ReturnType<typeof useRouter>;
  dataAnimateCard?: boolean;
}) {
  const initials = getCharacterInitials(character.name);
  const enabledTools = character.metadata?.enabledTools || [];
  const topTools = getTopTools(enabledTools, 3);
  const purpose = character.metadata?.purpose;
  const isSystemAgent = character.metadata?.isSystemAgent === true;
  const primaryImage = character.images?.find((img) => img.isPrimary);
  const avatarImage = character.images?.find((img) => img.imageType === "avatar");
  const imageUrl = avatarImage?.url || primaryImage?.url;

  return (
    <AnimatedCard
      data-animate-card={dataAnimateCard ? true : undefined}
      hoverLift
      className="group relative w-full border-0 bg-terminal-cream/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
    >
      <div className="p-4 pb-2">
        <AgentOverflowMenu
          character={character}
          onEditIdentity={onEditIdentity}
          onEditTools={onEditTools}
          onEditFolders={onEditFolders}
          onEditMcp={onEditMcp}
          onEditPlugins={onEditPlugins}
          onNavigateDashboard={() => router.push("/dashboard")}
          onDuplicate={onDuplicate}
          isDuplicating={isDuplicating}
          addToWorkflowLabel={addToWorkflowLabel}
          onAddToWorkflow={onAddToWorkflow}
          showAddToWorkflow={Boolean(onAddToWorkflow)}
          canAddToWorkflow={canAddToWorkflow}
          onDelete={onDelete}
          onRemoveFromWorkflow={onRemoveFromWorkflow}
          removeFromWorkflowLabel={removeFromWorkflowLabel}
        />

        <div className="flex min-h-9 items-center gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10 shadow-sm">
              {imageUrl ? <AvatarImage src={imageUrl} alt={character.name} /> : null}
              <AvatarFallback className="bg-terminal-green/10 font-mono text-xs text-terminal-green">
                {initials}
              </AvatarFallback>
            </Avatar>
            {hasActiveSession(character.id, character.hasActiveSession) && (
              <div className="absolute -right-1 -top-1 z-10">
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 shadow-md">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <div className="flex items-center gap-2">
              <p className="truncate font-mono text-sm font-medium text-terminal-dark">
                {character.displayName || character.name}
              </p>
              {isSystemAgent && (
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                  System
                </span>
              )}
              {role && (
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] font-mono ${
                    role === "initiator"
                      ? "border-terminal-green/30 bg-terminal-green/10 text-terminal-green"
                      : "border-terminal-border bg-terminal-muted/10 text-terminal-muted"
                  }`}
                >
                  {role === "initiator" ? t("workflows.initiator") : t("workflows.subagent")}
                </Badge>
              )}
            </div>
            {character.tagline && (
              <p className="line-clamp-1 font-mono text-xs text-terminal-muted">{character.tagline}</p>
            )}
          </div>
        </div>

        {purpose && (
          <p className="mt-1.5 line-clamp-1 pl-0.5 font-mono text-[11px] text-terminal-muted/80">
            {purpose}
          </p>
        )}

        {topTools.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1">
            {topTools.map((toolId) => (
              <ToolBadge key={toolId} toolId={toolId} size="xs" />
            ))}
            {enabledTools.length > 3 && (
              <span className="font-mono text-[10px] text-terminal-muted">+{enabledTools.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-start gap-1.5 px-4 pb-3 pt-0">
        <AnimatedButton
          size="sm"
          className="inline-flex h-7 gap-1.5 bg-terminal-dark px-3 font-mono text-xs text-terminal-cream hover:bg-terminal-dark/90"
          onClick={() => onContinueChat(character.id)}
        >
          <MessageCircle className="h-3 w-3" />
          {t("continue")}
        </AnimatedButton>
        <AnimatedButton
          size="sm"
          variant="outline"
          className="h-7 w-7 px-0 font-mono text-xs text-terminal-dark hover:bg-terminal-dark/5"
          onClick={() => onNewChat(character.id)}
        >
          <PlusCircle className="h-3 w-3" />
        </AnimatedButton>
      </div>
    </AnimatedCard>
  );
}
