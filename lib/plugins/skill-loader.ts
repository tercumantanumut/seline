/**
 * Plugin Skill Loader
 *
 * Resolves plugin skills for system prompt injection and skill content lookup.
 * Plugin skills are namespaced as `pluginName:skillName` to avoid collisions
 * with user-created skills.
 */

import { getInstalledPlugins } from "./registry";
import type { PluginSkillEntry } from "./types";

/**
 * Build a summary of available plugin skills for the system prompt.
 * Returns an empty string if no active plugins have skills.
 */
export async function getPluginSkillsForPrompt(userId: string): Promise<string> {
  const plugins = await getInstalledPlugins(userId, { status: "active" });
  const skills: PluginSkillEntry[] = [];

  for (const plugin of plugins) {
    if (plugin.components.skills?.length > 0) {
      skills.push(...plugin.components.skills);
    }
  }

  if (skills.length === 0) return "";

  const lines = skills.map(
    (s) => `- /${s.namespacedName}: ${s.description || s.name}`
  );

  return `\n\nAvailable plugin commands:\n${lines.join("\n")}`;
}

/**
 * Look up a plugin skill's content by its namespaced name.
 * Returns the full markdown content or null if not found.
 */
export async function getPluginSkillContent(
  userId: string,
  namespacedName: string
): Promise<string | null> {
  const plugins = await getInstalledPlugins(userId, { status: "active" });

  for (const plugin of plugins) {
    const skill = plugin.components.skills?.find(
      (s) => s.namespacedName === namespacedName
    );
    if (skill) return skill.content;
  }

  return null;
}

/**
 * Get all active plugin skill entries for a user.
 * Useful for building skill summaries with full metadata.
 */
export async function getActivePluginSkills(
  userId: string
): Promise<PluginSkillEntry[]> {
  const plugins = await getInstalledPlugins(userId, { status: "active" });
  const skills: PluginSkillEntry[] = [];

  for (const plugin of plugins) {
    if (plugin.components.skills?.length > 0) {
      skills.push(...plugin.components.skills);
    }
  }

  return skills;
}
