/**
 * system-prompt-builder.ts
 *
 * Builds the system prompt for a chat request, handling:
 * - Character-specific prompts (with skill summaries)
 * - Default assistant prompts
 * - Context-window block injection
 * - Workflow context block
 * - Skills runtime hint
 * - Developer workspace hint
 */

import { getSystemPrompt } from "@/lib/ai/config";
import { buildCharacterSystemPrompt, buildCacheableCharacterPrompt, getCharacterAvatarUrl } from "@/lib/ai/character-prompt";
import { buildDefaultCacheableSystemPrompt } from "@/lib/ai/prompts/base-system-prompt";
import { getSkillsSummaryForPrompt } from "@/lib/skills/queries";
import type { CacheableSystemBlock } from "@/lib/ai/cache/types";
import { buildContextWindowPromptBlock } from "./message-splitter";
import type { ContextWindowStatus } from "@/lib/context-window/manager";

// Re-use hasStylyApiKey check
const hasStylyApiKey = () => !!process.env.STYLY_AI_API_KEY;

// ─── Helper to append to system prompt ───────────────────────────────────────

function appendBlock(
  systemPromptValue: string | CacheableSystemBlock[],
  block: string
): string | CacheableSystemBlock[] {
  if (typeof systemPromptValue === "string") {
    return systemPromptValue + block;
  }
  return [...systemPromptValue, { role: "system" as const, content: block }];
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface SystemPromptBuildArgs {
  characterId: string | null;
  userId: string;
  toolLoadingMode: "deferred" | "always";
  useCaching: boolean;
  sessionMetadata: Record<string, unknown>;
  contextWindowStatus: ContextWindowStatus;
  workflowPromptContext: string | null;
  devWorkspaceEnabled: boolean;
}

export interface SystemPromptBuildResult {
  systemPromptValue: string | CacheableSystemBlock[];
  characterAvatarUrl: string | null;
  characterAppearanceDescription: string | null;
  enabledTools: string[] | undefined;
  pluginContext: { agentId?: string; characterId?: string } | undefined;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildSystemPromptForRequest(
  args: SystemPromptBuildArgs
): Promise<SystemPromptBuildResult> {
  const {
    characterId,
    userId,
    toolLoadingMode,
    useCaching,
    sessionMetadata,
    contextWindowStatus,
    workflowPromptContext,
    devWorkspaceEnabled,
  } = args;

  let systemPromptValue: string | CacheableSystemBlock[];
  let characterAvatarUrl: string | null = null;
  let characterAppearanceDescription: string | null = null;
  let enabledTools: string[] | undefined;
  let pluginContext: { agentId?: string; characterId?: string } | undefined;

  if (characterId) {
    const { getCharacterFull } = await import("@/lib/characters/queries");
    const character = await getCharacterFull(characterId);
    if (character && character.userId === userId) {
      let hydratedSkillSummaries: Array<{ id: string; name: string; description: string }> = [];
      const metadata = character.metadata as { enabledTools?: string[]; skills?: unknown[] } | null;
      enabledTools = metadata?.enabledTools;

      try {
        const skillSummaries = await getSkillsSummaryForPrompt(character.id);
        if (skillSummaries.length > 0) {
          hydratedSkillSummaries = skillSummaries.map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
          }));
        }
      } catch (skillError) {
        console.warn("[CHAT API] Failed to hydrate skill summaries for prompt:", skillError);
      }

      pluginContext = { agentId: characterId, characterId };
      const channelType = (sessionMetadata?.channelType as string | undefined) ?? null;
      systemPromptValue = useCaching
        ? buildCacheableCharacterPrompt(character, { toolLoadingMode, channelType, enableCaching: true, skillSummaries: hydratedSkillSummaries })
        : buildCharacterSystemPrompt(character, { toolLoadingMode, channelType, skillSummaries: hydratedSkillSummaries });

      characterAvatarUrl = getCharacterAvatarUrl(character);
      characterAppearanceDescription = character.tagline || null;
      console.log(`[CHAT API] Using character: ${character.name} (${characterId}), avatar: ${characterAvatarUrl || "none"}, enabledTools: ${enabledTools?.join(", ") || "all"}`);
    } else {
      systemPromptValue = useCaching
        ? buildDefaultCacheableSystemPrompt({ includeToolDiscovery: hasStylyApiKey(), toolLoadingMode, enableCaching: true })
        : getSystemPrompt({ stylyApiEnabled: hasStylyApiKey(), toolLoadingMode });
      console.log(`[CHAT API] Character not found or unauthorized, using default prompt`);
    }
  } else {
    systemPromptValue = useCaching
      ? buildDefaultCacheableSystemPrompt({ includeToolDiscovery: hasStylyApiKey(), toolLoadingMode, enableCaching: true })
      : getSystemPrompt({ stylyApiEnabled: hasStylyApiKey(), toolLoadingMode });
  }

  // Append context-window block
  systemPromptValue = appendBlock(
    systemPromptValue,
    buildContextWindowPromptBlock(contextWindowStatus)
  );

  // Append workflow context if provided
  if (workflowPromptContext) {
    systemPromptValue = appendBlock(systemPromptValue, `\n\n[Workflow Context]\n${workflowPromptContext}`);
  }

  // Append runtime skills hint
  systemPromptValue = appendBlock(
    systemPromptValue,
    "\n\n[Skills Runtime]\n" +
      "Use getSkill for action=list|inspect|run (DB + plugin skills).\n" +
      "Use updateSkill for action=create|patch|replace|metadata|copy|archive.\n" +
      "Prefer tool-first skill discovery instead of relying on static prompt catalogs."
  );

  // Append workspace context when Developer Workspace is enabled
  if (devWorkspaceEnabled) {
    const wsInfo = sessionMetadata?.workspaceInfo as Record<string, unknown> | undefined;
    // Sanitize a workspace field to prevent prompt injection via branch names / paths
    const sanitizeWsField = (v: unknown): string =>
      String(v || "").replace(/[\r\n]/g, " ").replace(/^[#\[]/g, "");
    let workspaceBlock: string;
    if (wsInfo && wsInfo.status) {
      workspaceBlock =
        `\n\n## Active Workspace\n` +
        `You are working in a git worktree workspace:\n` +
        `- Branch: ${sanitizeWsField(wsInfo.branch) || "unknown"}\n` +
        `- Base: ${sanitizeWsField(wsInfo.baseBranch) || "unknown"}\n` +
        `- Path: ${sanitizeWsField(wsInfo.worktreePath) || "unknown"}\n` +
        `- Status: ${sanitizeWsField(wsInfo.status)}\n` +
        (wsInfo.prUrl ? `- PR: ${sanitizeWsField(wsInfo.prUrl)}\n` : "") +
        `\nFile tools (readFile, editFile, writeFile, localGrep) work in the worktree path. ` +
        `Use executeCommand for git operations (commit, push, gh pr create) and builds. ` +
        `When changes are ready, ask the user if they want to keep local, push, or create a PR. ` +
        `NEVER fabricate PR URLs — only use real URLs from gh CLI output. ` +
        `When done, use workspace({ action: "delete" }) to clean up.`;
    } else {
      workspaceBlock =
        `\n\n[Developer Workspace]\n` +
        `You have the "workspace" tool available. When the user asks you to work on code changes, ` +
        `offer to create an isolated workspace (git worktree) so their main branch stays clean. ` +
        `File tools will automatically work in the worktree once created.\n` +
        `Use: workspace({ action: "create", branch: "feature/...", repoPath: "/path/to/repo" })`;
    }
    systemPromptValue = appendBlock(systemPromptValue, workspaceBlock);
  }

  return {
    systemPromptValue,
    characterAvatarUrl,
    characterAppearanceDescription,
    enabledTools,
    pluginContext,
  };
}
