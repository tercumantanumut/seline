export type ToolDependency =
  | "syncedFolders"
  | "embeddings"
  | "vectorDbEnabled"
  | "webScraper"
  | "openrouterKey"
  | "comfyuiEnabled"
  | "flux2Klein4bEnabled"
  | "flux2Klein9bEnabled"
  | "localGrepEnabled"
  | "devWorkspaceEnabled";

export type CharacterToolCatalogItem = {
  id: string;
  category: string;
  dependencies?: ToolDependency[];
  displayName?: string;
  description?: string;
};

export type RegistryToolCatalogItem = {
  id: string;
  category: string;
  displayName: string;
  description: string;
};

/**
 * Shared base catalog for character picker and creation wizard capabilities.
 */
export const CHARACTER_TOOL_CATALOG: CharacterToolCatalogItem[] = [
  { id: "docsSearch", category: "knowledge" },
  { id: "vectorSearch", category: "knowledge", dependencies: ["syncedFolders", "embeddings", "vectorDbEnabled"] },
  { id: "readFile", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "editFile", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "writeFile", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "patchFile", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "localGrep", category: "knowledge", dependencies: ["syncedFolders", "localGrepEnabled"] },
  { id: "webSearch", category: "search" },
  { id: "firecrawlCrawl", category: "search", dependencies: ["webScraper"] },
  { id: "assembleVideo", category: "video-generation" },
  { id: "describeImage", category: "analysis" },
  { id: "showProductImages", category: "utility" },
  { id: "executeCommand", category: "utility", dependencies: ["syncedFolders"] },
  { id: "scheduleTask", category: "utility" },
  { id: "runSkill", category: "utility" },
  { id: "updateSkill", category: "utility" },
  { id: "memorize", category: "utility" },
  { id: "calculator", category: "utility" },
  { id: "updatePlan", category: "utility" },
  { id: "sendMessageToChannel", category: "utility" },
  { id: "delegateToSubagent", category: "utility" },
  { id: "workspace", category: "utility", dependencies: ["devWorkspaceEnabled"] },
  { id: "chromiumWorkspace", category: "browser" },
  { id: "generateImageFlux2Flex", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "editImageFlux2Flex", category: "image-editing", dependencies: ["openrouterKey"] },
  { id: "referenceImageFlux2Flex", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "generateImageGpt5Mini", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "editImageGpt5Mini", category: "image-editing", dependencies: ["openrouterKey"] },
  { id: "referenceImageGpt5Mini", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "generateImageGpt5", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "editImageGpt5", category: "image-editing", dependencies: ["openrouterKey"] },
  { id: "referenceImageGpt5", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "generateImageGemini25Flash", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "editImageGemini25Flash", category: "image-editing", dependencies: ["openrouterKey"] },
  { id: "referenceImageGemini25Flash", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "generateImageGemini3Pro", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "editImageGemini3Pro", category: "image-editing", dependencies: ["openrouterKey"] },
  { id: "referenceImageGemini3Pro", category: "image-generation", dependencies: ["openrouterKey"] },
  { id: "generateImageZImage", category: "image-generation", dependencies: ["comfyuiEnabled"] },
  { id: "generateImageFlux2Klein4B", category: "image-generation", dependencies: ["flux2Klein4bEnabled"] },
  { id: "editImageFlux2Klein4B", category: "image-editing", dependencies: ["flux2Klein4bEnabled"] },
  { id: "referenceImageFlux2Klein4B", category: "image-generation", dependencies: ["flux2Klein4bEnabled"] },
  { id: "generateImageFlux2Klein9B", category: "image-generation", dependencies: ["flux2Klein9bEnabled"] },
  { id: "editImageFlux2Klein9B", category: "image-editing", dependencies: ["flux2Klein9bEnabled"] },
  { id: "referenceImageFlux2Klein9B", category: "image-generation", dependencies: ["flux2Klein9bEnabled"] },
];

export function mergeCharacterToolCatalog(
  baseTools: CharacterToolCatalogItem[],
  registryTools: RegistryToolCatalogItem[],
  options?: { excludeMcp?: boolean }
): CharacterToolCatalogItem[] {
  const merged = new Map<string, CharacterToolCatalogItem>();
  for (const tool of baseTools) merged.set(tool.id, tool);

  for (const tool of registryTools) {
    if (options?.excludeMcp && (tool.category === "mcp" || tool.id.startsWith("mcp_"))) {
      continue;
    }

    const existing = merged.get(tool.id);
    if (!existing) {
      merged.set(tool.id, {
        id: tool.id,
        category: tool.category,
        displayName: tool.displayName,
        description: tool.description,
      });
      continue;
    }

    merged.set(tool.id, {
      ...existing,
      category: existing.category || tool.category,
      displayName:
        existing.displayName && existing.displayName !== existing.id
          ? existing.displayName
          : tool.displayName,
      description:
        existing.description && existing.description.length > 0
          ? existing.description
          : tool.description,
    });
  }

  return Array.from(merged.values());
}
