/**
 * Agent Plugin Assignment Tests
 *
 * Covers agent-scoped plugin skill loading and hook isolation behavior.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllHooks,
  getRegisteredHooks,
  registerPluginHooks,
} from "@/lib/plugins/hooks-engine";
import type { InstalledPlugin } from "@/lib/plugins/types";

const getInstalledPluginsMock = vi.fn();
const getEnabledPluginsForAgentMock = vi.fn();

vi.mock("@/lib/plugins/registry", () => ({
  getInstalledPlugins: getInstalledPluginsMock,
  getEnabledPluginsForAgent: getEnabledPluginsForAgentMock,
}));

const {
  getPluginSkillsForPrompt,
  getPluginSkillContent,
  getActivePluginSkills,
} = await import("@/lib/plugins/skill-loader");

function makePlugin(input: {
  id: string;
  name: string;
  skillName?: string;
  namespacedName?: string;
  hookMatcher?: string;
}): InstalledPlugin {
  const skillName = input.skillName || "default-skill";
  const namespacedName = input.namespacedName || `${input.name}:${skillName}`;

  return {
    id: input.id,
    name: input.name,
    description: `${input.name} description`,
    version: "1.0.0",
    scope: "user",
    status: "active",
    manifest: {
      name: input.name,
      description: `${input.name} description`,
      version: "1.0.0",
    },
    components: {
      skills: [
        {
          name: skillName,
          namespacedName,
          description: `${skillName} description`,
          content: `# ${skillName}`,
          relativePath: `commands/${skillName}.md`,
        },
      ],
      agents: [],
      hooks: input.hookMatcher
        ? {
            hooks: {
              PreToolUse: [
                {
                  matcher: input.hookMatcher,
                  hooks: [{ type: "command", command: "echo ok" }],
                },
              ],
            },
          }
        : null,
      mcpServers: null,
      lspServers: null,
    },
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("Agent plugin assignment - skill loading", () => {
  beforeEach(() => {
    getInstalledPluginsMock.mockReset();
    getEnabledPluginsForAgentMock.mockReset();
  });

  it("loads only agent-enabled plugin skills when agent context exists", async () => {
    const globalPlugin = makePlugin({
      id: "p-global",
      name: "global-plugin",
      skillName: "global",
      namespacedName: "global-plugin:global",
    });
    const agentPlugin = makePlugin({
      id: "p-agent",
      name: "agent-plugin",
      skillName: "agent",
      namespacedName: "agent-plugin:agent",
    });

    getInstalledPluginsMock.mockResolvedValue([globalPlugin]);
    getEnabledPluginsForAgentMock.mockResolvedValue([agentPlugin]);

    const summary = await getPluginSkillsForPrompt("user-1", {
      agentId: "char-1",
      characterId: "char-1",
    });

    expect(getEnabledPluginsForAgentMock).toHaveBeenCalledWith(
      "user-1",
      "char-1",
      "char-1"
    );
    expect(summary).toContain("/agent-plugin:agent");
    expect(summary).not.toContain("/global-plugin:global");
  });

  it("resolves skill content from agent-enabled plugins", async () => {
    const agentPlugin = makePlugin({
      id: "p-agent",
      name: "agent-plugin",
      skillName: "agent",
      namespacedName: "agent-plugin:agent",
    });

    getEnabledPluginsForAgentMock.mockResolvedValue([agentPlugin]);

    const content = await getPluginSkillContent(
      "user-1",
      "agent-plugin:agent",
      { agentId: "char-1", characterId: "char-1" }
    );

    expect(content).toBe("# agent");
  });

  it("falls back to all active plugins when no agent context exists", async () => {
    const globalPlugin = makePlugin({
      id: "p-global",
      name: "global-plugin",
      skillName: "global",
      namespacedName: "global-plugin:global",
    });

    getInstalledPluginsMock.mockResolvedValue([globalPlugin]);

    const skills = await getActivePluginSkills("user-1");

    expect(getInstalledPluginsMock).toHaveBeenCalledWith("user-1", { status: "active" });
    expect(getEnabledPluginsForAgentMock).not.toHaveBeenCalled();
    expect(skills).toHaveLength(1);
    expect(skills[0].namespacedName).toBe("global-plugin:global");
  });
});

describe("Agent plugin assignment - hook scoping", () => {
  beforeEach(() => {
    clearAllHooks();
  });

  it("clears previous hook registrations when loading a different agent plugin set", () => {
    const agentAPlugin = makePlugin({
      id: "p-a",
      name: "agent-a-plugin",
      hookMatcher: "editFile",
    });
    const agentBPlugin = makePlugin({
      id: "p-b",
      name: "agent-b-plugin",
      hookMatcher: "writeFile",
    });

    clearAllHooks();
    if (agentAPlugin.components.hooks) {
      registerPluginHooks(agentAPlugin.name, agentAPlugin.components.hooks);
    }

    let preHooks = getRegisteredHooks("PreToolUse");
    expect(preHooks).toHaveLength(1);
    expect(preHooks[0].pluginName).toBe("agent-a-plugin");

    clearAllHooks();
    if (agentBPlugin.components.hooks) {
      registerPluginHooks(agentBPlugin.name, agentBPlugin.components.hooks);
    }

    preHooks = getRegisteredHooks("PreToolUse");
    expect(preHooks).toHaveLength(1);
    expect(preHooks[0].pluginName).toBe("agent-b-plugin");
  });
});
