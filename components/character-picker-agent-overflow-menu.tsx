"use client";

import {
  Wrench,
  Database,
  ChartBar,
  Trash,
  Plug as PhosphorPlug,
} from "@phosphor-icons/react";
import { Pencil } from "@phosphor-icons/react";
import { GitBranchPlus, MoreHorizontal, Copy, Puzzle, Unlink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";
import type { CharacterSummary } from "@/components/character-picker-types";

const DatabaseIcon = Database;
const Plug = PhosphorPlug;
const BarChart2 = ChartBar;
const Trash2 = Trash;

export type AgentOverflowMenuProps = {
  character: CharacterSummary;
  onEditIdentity: (c: CharacterSummary) => void;
  onEditTools: (c: CharacterSummary) => void;
  onEditFolders: (c: CharacterSummary) => void;
  onEditMcp: (c: CharacterSummary) => void;
  onEditPlugins: (c: CharacterSummary) => void;
  onNavigateDashboard: () => void;
  onDuplicate: (characterId: string) => void;
  addToWorkflowLabel?: string;
  onAddToWorkflow?: (c: CharacterSummary) => void;
  showAddToWorkflow?: boolean;
  canAddToWorkflow?: boolean;
  onDelete: (c: CharacterSummary) => void;
  onRemoveFromWorkflow?: () => void;
  removeFromWorkflowLabel?: string;
};

export function AgentOverflowMenu({
  character,
  onEditIdentity,
  onEditTools,
  onEditFolders,
  onEditMcp,
  onEditPlugins,
  onNavigateDashboard,
  onDuplicate,
  addToWorkflowLabel,
  onAddToWorkflow,
  showAddToWorkflow = true,
  canAddToWorkflow = true,
  onDelete,
  onRemoveFromWorkflow,
  removeFromWorkflowLabel,
}: AgentOverflowMenuProps) {
  const t = useTranslations("picker");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="absolute top-2 right-2 rounded-md p-1 opacity-40 transition-opacity hover:bg-terminal-dark/10 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green focus-visible:ring-offset-1 focus-visible:ring-offset-terminal-cream group-hover:opacity-100"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Agent options for ${character.displayName || character.name}`}
        >
          <MoreHorizontal className="w-4 h-4 text-terminal-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 font-mono text-sm"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => onEditIdentity(character)}>
          <Pencil className="w-3.5 h-3.5 mr-2" />
          {t("menu.editInfo")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEditTools(character)}>
          <Wrench className="w-3.5 h-3.5 mr-2" />
          {t("menu.manageTools")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEditFolders(character)}>
          <DatabaseIcon className="w-3.5 h-3.5 mr-2" />
          {t("menu.syncFolders")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEditMcp(character)}>
          <Plug className="w-3.5 h-3.5 mr-2" />
          {t("menu.mcpTools")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEditPlugins(character)}>
          <Puzzle className="w-3.5 h-3.5 mr-2" />
          {t("menu.plugins")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onNavigateDashboard}>
          <BarChart2 className="w-3.5 h-3.5 mr-2" />
          {t("menu.dashboard")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onDuplicate(character.id)}>
          <Copy className="w-3.5 h-3.5 mr-2" />
          {t("menu.duplicate")}
        </DropdownMenuItem>
        {showAddToWorkflow && (
          <DropdownMenuItem onSelect={() => onAddToWorkflow?.(character)} disabled={!canAddToWorkflow}>
            <GitBranchPlus className="w-3.5 h-3.5 mr-2" />
            {addToWorkflowLabel}
          </DropdownMenuItem>
        )}
        {onRemoveFromWorkflow && removeFromWorkflowLabel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onRemoveFromWorkflow}
              className="text-red-600 focus:text-red-600"
            >
              <Unlink className="w-3.5 h-3.5 mr-2" />
              {removeFromWorkflowLabel}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(character)}
          className="text-red-600 focus:text-red-600"
        >
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          {t("menu.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
