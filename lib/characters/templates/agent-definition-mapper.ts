/**
 * Agent Definition Mapper
 *
 * Converts Seline AgentTemplate objects to the Claude Agent SDK's AgentDefinition
 * format so they can be passed to the SDK's `agents` option in query() calls.
 *
 * This enables SDK-native multi-agent delegation via the Task tool: when the SDK
 * spawns a subagent, it will use the system prompt and tool restrictions defined
 * in the Seline system agent templates.
 *
 * Usage:
 * ```ts
 * import { systemAgentsToSdkAgents } from "@/lib/characters/templates/agent-definition-mapper";
 * import { queryWithSdkOptions } from "@/lib/ai/providers/claudecode-provider";
 *
 * const result = await queryWithSdkOptions({
 *   prompt: "Explore the repository and summarise the architecture",
 *   sdkOptions: { agents: systemAgentsToSdkAgents(), maxTurns: 5 },
 * });
 * ```
 */

import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { AgentTemplate } from "./types";
import { SYSTEM_AGENT_TEMPLATES } from "./system-agents";

// ---------------------------------------------------------------------------
// Tool name mapping
// ---------------------------------------------------------------------------

/**
 * Maps Seline-native tool names to the nearest Claude Agent SDK built-in tool
 * names (PascalCase, as expected by AgentDefinition.tools).
 *
 * Seline has its own tool registry with camelCase names. SDK built-in tools
 * use PascalCase and come from the Claude Code CLI tool set.
 *
 * Custom Seline tools (vectorSearch, memorize, runSkill, scheduleTask, etc.)
 * have no direct SDK equivalent and are omitted; the SDK will fall back to its
 * own tool-use rules for those capabilities.
 */
const SELINE_TO_SDK_TOOL: Readonly<Record<string, string>> = {
  readFile: "Read",
  editFile: "Edit",
  writeFile: "Write",
  patchFile: "Edit",
  executeCommand: "Bash",
  localGrep: "Grep",
  webSearch: "WebSearch",
  webFetch: "WebFetch",
};

/**
 * Maps an array of Seline tool names to their SDK equivalents.
 * Returns `undefined` if none of the tools have a known SDK mapping
 * (the SDK will then inherit all tools from the parent context).
 */
export function mapSelineToolsToSdk(selineTools: string[]): string[] | undefined {
  const seen = new Set<string>();
  const sdkTools: string[] = [];

  for (const tool of selineTools) {
    const sdkName = SELINE_TO_SDK_TOOL[tool];
    if (sdkName && !seen.has(sdkName)) {
      seen.add(sdkName);
      sdkTools.push(sdkName);
    }
  }

  return sdkTools.length > 0 ? sdkTools : undefined;
}

// ---------------------------------------------------------------------------
// Converter
// ---------------------------------------------------------------------------

/**
 * Converts a single Seline AgentTemplate to a Claude Agent SDK AgentDefinition.
 *
 * The AgentDefinition can be included in the `agents` option when calling the
 * SDK's query() function, enabling that agent to be spawned by the Task tool.
 *
 * - `description` — shown to the parent model when deciding which agent to use
 * - `prompt` — the agent's system prompt (maps to AgentTemplate.purpose)
 * - `tools` — SDK-mapped subset of the agent's enabled tools (may be undefined)
 * - `model` — always "inherit" so the agent uses the caller's model
 */
export function templateToAgentDefinition(template: AgentTemplate): AgentDefinition {
  return {
    description: template.tagline,
    prompt: template.purpose,
    model: "inherit",
    ...(template.enabledTools.length > 0
      ? { tools: mapSelineToolsToSdk(template.enabledTools) }
      : {}),
  };
}

/**
 * Returns all system agent templates as a `Record<agentId, AgentDefinition>`
 * compatible with the SDK's `agents` option.
 *
 * The record keys are the system agent IDs (e.g. "system-explore", "system-plan").
 * These become the agent names that the Task tool can reference.
 */
export function systemAgentsToSdkAgents(): Record<string, AgentDefinition> {
  const result: Record<string, AgentDefinition> = {};
  for (const template of SYSTEM_AGENT_TEMPLATES) {
    result[template.id] = templateToAgentDefinition(template);
  }
  return result;
}

/**
 * Returns a subset of system agents as SDK AgentDefinitions, filtered by their IDs.
 * Useful when you only want to expose specific agents to the SDK for a given task.
 *
 * @example
 * ```ts
 * const agents = systemAgentsToSdkAgentsById(["system-explore", "system-plan"]);
 * ```
 */
export function systemAgentsToSdkAgentsById(
  ids: string[]
): Record<string, AgentDefinition> {
  const idSet = new Set(ids);
  const result: Record<string, AgentDefinition> = {};
  for (const template of SYSTEM_AGENT_TEMPLATES) {
    if (idSet.has(template.id)) {
      result[template.id] = templateToAgentDefinition(template);
    }
  }
  return result;
}
