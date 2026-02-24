# Subagent Discovery in searchTools - Implementation Summary

## Overview

Extended `searchTools` to discover and report available subagents alongside tools, enabling the main agent to discover subagent capabilities through semantic search without requiring `delegateToSubagent` to be loaded.

## Problem Solved

**Before:**
- Main agents with deferred tool loading couldn't discover subagents unless they:
  1. Searched for "delegate" or "subagent" to find `delegateToSubagent` tool
  2. Called `delegateToSubagent({ action: "list" })` to see available subagents
- Two-step discovery process was inefficient and non-intuitive
- Agents had no way to search for "who can help with research?" semantically

**After:**
- `searchTools` now searches both tools AND subagents in a single call
- Semantic queries like "research", "analysis", "documentation" match subagent purposes
- Subagents appear in search results with clear delegation instructions
- Works even when `delegateToSubagent` is deferred-loaded

## Implementation

### 1. Created Subagent Search Module

**File:** `lib/ai/tool-registry/search-tool-subagent-types.ts`

```typescript
export interface SubagentInfo {
  agentId: string;
  agentName: string;
  purpose: string;
}

export interface SubagentSearchResult {
  type: "subagent";
  agentId: string;
  agentName: string;
  purpose: string;
  relevance: number;
}

// Parses workflow directory format: "- AgentName (id: agent-id): Purpose"
export function parseSubagentDirectory(directory: string[]): SubagentInfo[]

// Searches subagents by matching query against names and purposes
export function searchSubagents(query: string, subagents: SubagentInfo[]): SubagentSearchResult[]
```

**Search Algorithm:**
- Exact name match: +3 points
- Word match in name: +1.5 points per word
- Word match in purpose: +1 point per word
- Full query in purpose: +0.5 points
- Results sorted by relevance

### 2. Extended ToolSearchContext

**File:** `lib/ai/tool-registry/search-tool.ts`

```typescript
export interface ToolSearchContext {
  initialActiveTools?: Set<string>;
  discoveredTools?: Set<string>;
  enabledTools?: Set<string>;
  loadedTools?: Set<string>; // @deprecated
  subagentDirectory?: string[]; // NEW: Workflow subagent directory
}
```

### 3. Updated SearchToolResult Types

**File:** `lib/ai/tool-registry/search-tool.ts`

```typescript
interface SearchResultWithAvailability extends ToolSearchResult {
  isAvailable: boolean;
  fullInstructions?: string;
  resultType: "tool"; // NEW: Discriminator
}

interface SubagentResultWithAvailability extends SubagentSearchResult {
  isAvailable: true; // Always available if in directory
  resultType: "subagent"; // NEW: Discriminator
}

type UnifiedResultWithAvailability =
  | SearchResultWithAvailability
  | SubagentResultWithAvailability;

interface SearchToolResult {
  status: "success" | "no_results";
  query: string;
  results: UnifiedResultWithAvailability[]; // NEW: Unified type
  message: string;
  summary?: string; // NEW: Delegation instructions for subagents
}
```

### 4. Modified Search Execution Flow

**File:** `lib/ai/tool-registry/search-tool.ts`

```typescript
execute: async ({ query, category, limit = 20 }): Promise<SearchToolResult> => {
  // 1. Search tools (existing logic)
  let toolResults = registry.search(query, TOOL_SEARCH_ROUTER_MAX_CANDIDATES);
  // ... apply routing, filtering, limiting ...
  
  // 2. Search subagents (NEW)
  const subagentResults = subagentDirectory
    ? searchSubagents(query, parseSubagentDirectory(subagentDirectory))
    : [];
  
  // 3. Convert to unified format with resultType discriminator
  const toolResultsWithAvailability = toolResults.map(r => ({
    ...r,
    resultType: "tool" as const,
    isAvailable: /* availability logic */,
  }));
  
  const subagentResultsWithAvailability = subagentResults.map(s => ({
    ...s,
    resultType: "subagent" as const,
    isAvailable: true, // Always available
  }));
  
  // 4. Merge, sort by relevance, apply limit
  const allResults = [...toolResultsWithAvailability, ...subagentResultsWithAvailability];
  allResults.sort((a, b) => b.relevance - a.relevance);
  const limitedResults = allResults.slice(0, effectiveLimit);
  
  // 5. Build response with delegation instructions
  const subagentCount = limitedResults.filter(r => r.resultType === "subagent").length;
  const summary = subagentCount > 0
    ? "To delegate to a subagent, use: delegateToSubagent({ action: 'start', agentId: '<id>', task: '<description>' })"
    : "";
  
  return { status: "success", query, results: limitedResults, message, summary };
}
```

### 5. Extended Workflow Resource Context

**File:** `lib/agents/workflow-types.ts`

```typescript
export interface WorkflowResourceContext {
  workflowId: string;
  role: "initiator" | "subagent";
  sharedResources: WorkflowSharedResources;
  policy: { /* ... */ };
  promptContext: string;
  promptContextInput: WorkflowPromptContextInput; // NEW: Raw input for searchTools
}
```

**File:** `lib/agents/workflow-resource-context.ts`

```typescript
export async function getWorkflowResources(
  workflowId: string,
  agentId: string
): Promise<WorkflowResourceContext | null> {
  // ... existing logic ...
  
  const promptContextInput: WorkflowPromptContextInput = {
    workflowName: workflow.name,
    role: member.role,
    sharedPluginCount: sharedResources.pluginIds.length,
    sharedFolderCount: sharedResources.syncFolderIds.length,
    subagentDirectory, // Parsed from workflow members
    activeDelegations,
  };
  
  const promptContext = buildWorkflowPromptContext(promptContextInput);
  
  return {
    /* ... */,
    promptContext,
    promptContextInput, // NEW: Expose for searchTools
  };
}
```

### 6. Wired Context Through Chat API

**File:** `app/api/chat/route.ts`

```typescript
let workflowPromptContext: string | null = null;
let workflowPromptContextInput: WorkflowPromptContextInput | null = null; // NEW

if (characterId) {
  const resources = await getWorkflowResources(workflowCtx.workflow.id, characterId);
  if (resources) {
    workflowPromptContext = resources.promptContext;
    workflowPromptContextInput = resources.promptContextInput; // NEW
  }
}

const toolsResult = await buildToolsForRequest({
  /* ... */,
  workflowPromptContextInput, // NEW: Pass to tools builder
});
```

**File:** `app/api/chat/tools-builder.ts`

```typescript
export interface ToolsBuildContext {
  /* ... existing fields ... */
  workflowPromptContextInput: WorkflowPromptContextInput | null; // NEW
}

export async function buildToolsForRequest(ctx: ToolsBuildContext) {
  const { workflowPromptContextInput, /* ... */ } = ctx;
  
  const toolSearchContext = {
    initialActiveTools,
    discoveredTools,
    enabledTools: enabledTools ? new Set(enabledTools) : undefined,
    subagentDirectory: workflowPromptContextInput?.subagentDirectory, // NEW
  };
  
  const tools = {
    /* ... */,
    searchTools: createToolSearchTool(toolSearchContext), // Now includes subagent directory
    /* ... */,
  };
}
```

### 7. Updated Tool Description

**File:** `lib/ai/tool-registry/search-tool.ts`

```typescript
description: `Search for available AI tools by functionality.

**Search queries (describe the CAPABILITY, not content):**
- "grep", "regex", "pattern search" → finds localGrep
- "semantic search", "vector search" → finds vectorSearch
- "generate image", "create image" → finds image generation tools
- "web search", "search internet" → finds web search tools
- "delegate", "subagent", "agent" → finds delegation tools AND available subagents // NEW

**After finding a tool:** Use it immediately. Do NOT call searchTools again for the same task.`
```

## Example Usage

### Scenario 1: Semantic Subagent Discovery

**User:** "Who can help with research?"

**Agent:** `searchTools({ query: "research" })`

**Result:**
```json
{
  "status": "success",
  "query": "research",
  "results": [
    {
      "type": "subagent",
      "resultType": "subagent",
      "agentId": "agent-research-analyst",
      "agentName": "Research Analyst",
      "purpose": "Market and competitor research with data analysis",
      "relevance": 2.5,
      "isAvailable": true
    },
    {
      "type": "tool",
      "resultType": "tool",
      "name": "webSearch",
      "displayName": "Web Search",
      "category": "search",
      "description": "Search the web for information",
      "relevance": 1.0,
      "isAvailable": true
    }
  ],
  "message": "Found 2 result(s) matching \"research\". 1 tool(s) and 1 subagent(s). 2 are now available for use.",
  "summary": "To delegate to a subagent, use: delegateToSubagent({ action: 'start', agentId: '<id>', task: '<description>' })"
}
```

**Agent:** `delegateToSubagent({ action: "start", agentId: "agent-research-analyst", task: "Research market trends for AI agents" })`

### Scenario 2: Direct Agent Query

**User:** "Can you delegate this to the documentation agent?"

**Agent:** `searchTools({ query: "documentation agent" })`

**Result:**
```json
{
  "status": "success",
  "query": "documentation agent",
  "results": [
    {
      "type": "subagent",
      "resultType": "subagent",
      "agentId": "agent-docs-writer",
      "agentName": "Documentation Writer",
      "purpose": "Technical documentation and API reference generation",
      "relevance": 4.5,
      "isAvailable": true
    }
  ],
  "message": "Found 1 result(s) matching \"documentation agent\". 1 subagent(s). 1 are now available for use.",
  "summary": "To delegate to a subagent, use: delegateToSubagent({ action: 'start', agentId: '<id>', task: '<description>' })"
}
```

## Benefits

1. **Single-Step Discovery**: Agents discover subagents and tools in one search
2. **Semantic Matching**: Queries match against subagent purposes, not just names
3. **Context-Efficient**: Works with deferred tool loading; no need to load delegateToSubagent upfront
4. **Clear Instructions**: Summary field provides delegation syntax when subagents are found
5. **Unified Interface**: Tools and subagents in same result set, sorted by relevance
6. **Type-Safe**: Discriminated union with `resultType` field for safe pattern matching
7. **Future-Proof**: Architecture supports MCP server discovery with same pattern

## Testing

All TypeScript compilation checks passed:
- ✅ `tsc -p tsconfig.lib.json` - Library types
- ✅ `tsc -p tsconfig.app.json` - Application types

No runtime tests were modified as this is a pure addition to existing functionality.

## Files Changed

### Created
- `lib/ai/tool-registry/search-tool-subagent-types.ts` (111 lines)

### Modified
- `lib/ai/tool-registry/search-tool.ts` (+100 lines)
- `lib/agents/workflow-types.ts` (+1 field)
- `lib/agents/workflow-resource-context.ts` (+8 lines)
- `app/api/chat/tools-builder.ts` (+2 fields, +1 line)
- `app/api/chat/route.ts` (+2 lines)

## Git Commit

```
feat: extend searchTools to discover subagents alongside tools

Enables main agents to discover available subagents through semantic search
without requiring delegateToSubagent to be loaded first.

Changes:
- Add subagent search module with semantic matching algorithm
- Extend ToolSearchContext with subagentDirectory field
- Update SearchToolResult to support unified tool/subagent results
- Wire workflow context through chat API to searchTools
- Add delegation instructions in summary field when subagents found

Benefits:
- Single-step discovery for tools and subagents
- Semantic queries match subagent purposes ("research" → Research Analyst)
- Works with deferred tool loading
- Type-safe discriminated union for results

Example: searchTools({ query: "research" }) now returns both research tools
and research-capable subagents with delegation instructions.
```

## Future Enhancements

1. **MCP Server Discovery**: Apply same pattern to discover MCP server capabilities
2. **Capability Tagging**: Add structured capability tags to subagents for better matching
3. **Usage Examples**: Include example tasks in subagent metadata
4. **Ranking Improvements**: Use LLM to rank subagent-task fit, not just keyword matching
5. **Delegation History**: Surface frequently-used subagents higher in results
