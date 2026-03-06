import { Buffer } from "buffer";
import type { CatalogSkillSource } from "./types";

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
}

export async function fetchSkillFromGitHub(source: CatalogSkillSource): Promise<string> {
  if (source.type !== "github") {
    throw new Error("GitHub source required");
  }

  const ref = source.ref || "main";
  const url = `https://api.github.com/repos/${source.repo}/contents/${source.path}/SKILL.md?ref=${encodeURIComponent(ref)}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "seline-skills-catalog",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch skill from GitHub (${res.status})`);
  }

  const payload = (await res.json()) as GitHubContentResponse;
  if (!payload.content || payload.encoding !== "base64") {
    throw new Error("Unexpected GitHub response while fetching SKILL.md");
  }

  return Buffer.from(payload.content, "base64").toString("utf-8");
}
