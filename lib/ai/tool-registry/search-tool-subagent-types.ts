/**
 * Types for subagent discovery in searchTools
 */

/**
 * Parsed subagent information from workflow directory
 */
export interface SubagentInfo {
  agentId: string;
  agentName: string;
  purpose: string;
}

/**
 * Subagent search result (parallel to ToolSearchResult)
 */
export interface SubagentSearchResult {
  type: "subagent";
  agentId: string;
  agentName: string;
  purpose: string;
  relevance: number;
}

/**
 * Unified search result that can be either a tool or a subagent
 */
export type UnifiedSearchResult = 
  | { type: "tool"; result: import("./types").ToolSearchResult }
  | { type: "subagent"; result: SubagentSearchResult };

/**
 * Parse subagent directory entries from workflow context
 * Format: "- AgentName (id: agent-id): Purpose description"
 */
export function parseSubagentDirectory(directory: string[]): SubagentInfo[] {
  const subagents: SubagentInfo[] = [];
  
  for (const entry of directory) {
    if (!entry || entry === "- none") continue;
    
    // Match format: "- Name (id: agent-id): Purpose"
    const match = entry.match(/^-\s*(.+?)\s*\(id:\s*(.+?)\)\s*:\s*(.+)$/);
    if (match) {
      const [, agentName, agentId, purpose] = match;
      subagents.push({
        agentId: agentId.trim(),
        agentName: agentName.trim(),
        purpose: purpose.trim(),
      });
    }
  }
  
  return subagents;
}

/**
 * Search subagents by query
 */
export function searchSubagents(
  query: string,
  subagents: SubagentInfo[]
): SubagentSearchResult[] {
  if (!subagents.length) return [];
  
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(Boolean);
  
  const results: SubagentSearchResult[] = [];
  
  for (const subagent of subagents) {
    let score = 0;
    const searchText = `${subagent.agentName} ${subagent.purpose}`.toLowerCase();
    
    // Exact name match
    if (subagent.agentName.toLowerCase() === queryLower) {
      score += 3;
    }
    
    // Word matches in name or purpose
    for (const word of queryWords) {
      if (subagent.agentName.toLowerCase().includes(word)) {
        score += 1.5;
      }
      if (subagent.purpose.toLowerCase().includes(word)) {
        score += 1;
      }
    }
    
    // Full query match in purpose
    if (subagent.purpose.toLowerCase().includes(queryLower)) {
      score += 0.5;
    }
    
    if (score > 0) {
      results.push({
        type: "subagent",
        agentId: subagent.agentId,
        agentName: subagent.agentName,
        purpose: subagent.purpose,
        relevance: score,
      });
    }
  }
  
  // Sort by relevance
  results.sort((a, b) => b.relevance - a.relevance);
  
  return results;
}
