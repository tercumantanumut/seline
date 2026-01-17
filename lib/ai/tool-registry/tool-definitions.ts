/**
 * Tool Definitions
 *
 * Register all tools with the ToolRegistry along with their metadata.
 * This centralizes tool configuration and enables the Tool Search pattern.
 *
 * LOADING STRATEGY (optimized for token efficiency):
 * - alwaysLoad: true  → Core tools that must always be available:
 *   - searchTools, listAllTools: Required for discovering other tools
 *   - describeImage: Essential for virtual try-on workflows
 * - deferLoading: true → All other tools (discovered on-demand via searchTools)
 *
 * CRITICAL: searchTools and listAllTools MUST have alwaysLoad: true.
 * Without them, the AI cannot discover other tools and will output raw
 * function call syntax as plain text instead of executing tools.
 *
 * This saves ~2,500 tokens per request by deferring tool descriptions until needed.
 * Tools are discoverable via searchTools and loaded dynamically when the AI needs them.
 */

import { tool, jsonSchema } from "ai";
import { ToolRegistry } from "./registry";
import type { ToolMetadata } from "./types";
import { createToolSearchTool, createListToolsTool } from "./search-tool";
import {
  createImageEditTool,
  createDescribeImageTool,
  createFlux2GenerateTool,
  createWan22ImagenTool,
  createWan22VideoTool,
  createWan22PixelVideoTool,
  createVideoAssemblyTool,
  createDocsSearchTool,
  createRetrieveFullContentTool,
  // OpenRouter Image Tools
  createOpenRouterFlux2FlexGenerate,
  createOpenRouterFlux2FlexEdit,
  createOpenRouterFlux2FlexReference,
  createOpenRouterGpt5ImageMiniGenerate,
  createOpenRouterGpt5ImageMiniEdit,
  createOpenRouterGpt5ImageMiniReference,
  createOpenRouterGpt5ImageGenerate,
  createOpenRouterGpt5ImageEdit,
  createOpenRouterGpt5ImageReference,
  createOpenRouterGemini25FlashImageGenerate,
  createOpenRouterGemini25FlashImageEdit,
  createOpenRouterGemini25FlashImageReference,
  createOpenRouterGemini3ProImageGenerate,
  createOpenRouterGemini3ProImageEdit,
  createOpenRouterGemini3ProImageReference,
} from "../tools";
import { createWebSearchTool } from "../web-search";
import { createVectorSearchToolV2, createReadFileTool } from "../vector-search";
import { createFirecrawlCrawlTool } from "../firecrawl";
import { createWebBrowseTool, createWebQueryTool } from "../web-browse";
import { createLocalGrepTool } from "../ripgrep";
import { createExecuteCommandTool } from "../tools/execute-command-tool";
import { createZImageGenerateTool } from "../tools/zimage-generate-tool";
import { createFlux2Klein4BGenerateTool } from "../tools/flux2-klein-4b-generate-tool";
import { createFlux2Klein9BGenerateTool } from "../tools/flux2-klein-9b-generate-tool";

/**
 * Register all tools with the registry
 * Call this once during app initialization
 */
export function registerAllTools(): void {
  const registry = ToolRegistry.getInstance();

  // ============================================================
  // CORE UTILITY TOOLS - Always loaded (required for tool discovery)
  // ============================================================

  // Tool Search - MUST be alwaysLoad to enable tool discovery
  registry.register(
    "searchTools",
    {
      displayName: "Search Tools",
      category: "utility",
      keywords: [
        "search",
        "discover",
        "tools",
        "capabilities",
        "list",
        "exploration",
      ],
      shortDescription:
        "Search for available tools and discover capabilities like image generation or docs search",
      loading: { alwaysLoad: true }, // CRITICAL: Must always be available to discover other tools
      requiresSession: false,
    } satisfies ToolMetadata,
    () => createToolSearchTool()
  );

  // List All Tools - Deferred for token efficiency (discover via searchTools)
  registry.register(
    "listAllTools",
    {
      displayName: "List All Tools",
      category: "utility",
      keywords: ["list", "tools", "catalog", "capabilities", "inventory", "all tools", "exploration"],
      shortDescription:
        "List all available tools organized by category with availability status",
      loading: { deferLoading: true }, // Optimized: Discoverable via searchTools
      requiresSession: false,
    } satisfies ToolMetadata,
    () => createListToolsTool()
  );

  // Retrieve Full Content - allows AI to access full untruncated content
  // This tool is always loaded because truncation notices reference it directly
  registry.register(
    "retrieveFullContent",
    {
      displayName: "Retrieve Full Content",
      category: "utility",
      keywords: [
        "retrieve",
        "full",
        "content",
        "truncated",
        "expand",
        "complete",
        "text",
      ],
      shortDescription:
        "⚠️ NOT for file reading! Only retrieves truncated content with trunc_XXXXXXXX IDs. Use readFile for actual files.",
      loading: { deferLoading: true }, // Only visible when truncation occurs in session
      requiresSession: true, // Requires session to retrieve stored content
    } satisfies ToolMetadata,
    // Placeholder factory - real instance with sessionId is created in chat route
    () =>
      createRetrieveFullContentTool({
        sessionId: "UNSCOPED",
      })
  );

  // Agent Docs Search (configurable per-agent - knowledge feature)
  registry.register(
    "docsSearch",
    {
      displayName: "Search Agent Documents",
      category: "knowledge",
      keywords: [
        "docs",
        "documents",
        "knowledge",
        "pdf",
        "markdown",
        "html",
        "rag",
        "manual",
        "policy",
      ],
      shortDescription:
        "Search an agent's attached documents and knowledge base for relevant passages",
      loading: { deferLoading: true },
      // Requires an agent/user context to be meaningful, but can exist without a session
      requiresSession: false,
    } satisfies ToolMetadata,
    // NOTE: This factory creates a placeholder instance without user/agent context.
    // The chat route instantiates a fully scoped docsSearch tool with userId/characterId
    // for actual use. Here we only need a concrete tool instance so it appears in
    // the registry and can be discovered via searchTools/listAllTools.
    () =>
      createDocsSearchTool({
        userId: "UNSCOPED",
        characterId: null,
      })
  );

  // Vector Search Tool V2 (LLM-powered intelligent search over synced folders)
  registry.register(
    "vectorSearch",
    {
      displayName: "Vector Search (AI-Powered)",
      category: "knowledge",
      keywords: [
        "vector",
        "vectorSearch",
        "semantic",
        "search",
        "similarity",
        "embeddings",
        "folders",
        "files",
        "local",
        "rag",
        "lancedb",
        "code",
        "codebase",
        "intelligent",
        "exploration",
        "analysis",
        "structure",
        "file structure",
        "hierarchy",
        "tree",
        // Cross-category keywords for better discovery
        "grep",
        "find",
        "locate",
        "project",
        "source",
      ],
      shortDescription:
        "Intelligent semantic search across your codebase with AI-powered result synthesis",
      fullInstructions: `## Vector Search Tool (AI-Powered)

Intelligent code search across your indexed codebase folders. Uses a secondary AI to interpret your query and synthesize results with explanations.

### Capabilities
- **Semantic Understanding**: Searches by concept, not just keywords
- **Smart Synthesis**: AI analyzes and explains results with confidence scores
- **Contextual Refinement**: Learns from your search history in this session
- **Organized Findings**: Groups results by file with explanations

### When to Use
- Finding functionality: "show me authentication logic"
- Locating definitions: "where is getUserById implemented"
- Pattern discovery: "error handling patterns in API routes"
- Code exploration: "functions that interact with the database"

### Parameters
- **query** (required): Natural language description of what you're looking for
- **maxResults** (optional): Maximum results to return (1-50, default: 15)
- **minScore** (optional): Minimum relevance score 0-1 (default: 0.3)
- **folderIds** (optional): Limit search to specific synced folders

### Result Format
Returns organized findings with:
- Search strategy used and reasoning
- File locations with line ranges
- Code snippets and explanations
- Confidence scores
- Suggested refinements

### Tips
- Be specific but natural: "payment processing logic" not "payment"
- Use follow-up queries to refine results
- Check suggested refinements for better results
- Higher minScore = more precise, fewer results`,
      loading: { deferLoading: true },
      requiresSession: true,  // Needs session for LLM synthesis
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createVectorSearchToolV2({
        sessionId: sessionId || "UNSCOPED",
        userId: "UNSCOPED",
        characterId: null,
      })
  );

  // Read File Tool (read files from Knowledge Base documents or synced folders)
  registry.register(
    "readFile",
    {
      displayName: "Read File",
      category: "knowledge",
      keywords: [
        "read",
        "file",
        "content",
        "source",
        "code",
        "full",
        "context",
        "lines",
        "import",
        "export",
        "follow",
        "document",
        "knowledge",
        "pdf",
        "markdown",
        "analysis",
        "codebase",
      ],
      shortDescription:
        "Read full file content from Knowledge Base documents or synced folders",
      fullInstructions: `## Read File Tool

Read complete file content or specific line ranges from Knowledge Base documents or synced folders.

### Supported Sources
1. **Knowledge Base documents** - Uploaded PDFs, text, Markdown, HTML. Reference by filename or title.
2. **Synced folder files** - Files from indexed folders. Use paths from vectorSearch results.

### When to Use
- After docsSearch returns passages and you need full document context
- After vectorSearch returns snippets and you need full file context
- When a user mentions a specific document by name
- When following imports/exports between files
- To read a complete function, class, or module

### Parameters
- **filePath** (required): Document name or file path (tries Knowledge Base first, then synced folders)
- **startLine** (optional): Start line number (1-indexed)
- **endLine** (optional): End line number (1-indexed)

### Limits
- Max file size: 1MB
- Max lines: 5000 (use line ranges for larger files)

### Example Workflow
1. Use docsSearch to find relevant passages in Knowledge Base documents
2. Use readFile to get full document context
3. Or use vectorSearch to find code snippets, then readFile for complete files

### Example Usage
\`\`\`
readFile({ filePath: "company-policy.pdf" })
readFile({ filePath: "API Documentation" })
readFile({ filePath: "src/components/Button.tsx" })
readFile({ filePath: "lib/utils.ts", startLine: 50, endLine: 100 })
\`\`\``,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createReadFileTool({
        sessionId: sessionId || "UNSCOPED",
        userId: "UNSCOPED",
        characterId: null,
      })
  );

  // Local Grep Tool (ripgrep - fast exact/regex pattern search)
  registry.register(
    "localGrep",
    {
      displayName: "Local Grep (ripgrep)",
      category: "knowledge",
      keywords: [
        "grep",
        "localGrep",
        "local grep",
        "search",
        "pattern",
        "regex",
        "exact",
        "ripgrep",
        "find",
        "text",
        "code",
        "literal",
        "rg",
        "match",
        "string",
        "analysis",
        "exploration",
        "scan",
        "codebase",
        "file search",
        "code search",
      ],
      shortDescription:
        "Fast exact or regex pattern search across files using ripgrep",
      fullInstructions: `## Local Grep Tool (ripgrep)

Fast pattern search using ripgrep. Unlike vectorSearch (semantic), this finds EXACT text matches.

### When to Use
- **Exact string match**: Function names, variable names, imports
- **Regex patterns**: \`async.*await\`, \`TODO:.*\`, \`import.*from\`
- **Symbol tracing**: Find all usages of \`getUserById\`
- **Code patterns**: Find specific syntax patterns

### When to Use vectorSearch Instead
- Conceptual queries: "authentication logic"
- Intent-based: "error handling patterns"
- When you don't know exact wording

### Parameters
- **pattern** (required): Search pattern (exact text or regex)
- **paths** (optional): Paths to search. If omitted, uses agent's synced folders
- **regex** (optional): Treat as regex (default: false = literal)
- **caseInsensitive** (optional): Ignore case (default: true)
- **maxResults** (optional): Max results (default: 50)
- **fileTypes** (optional): Extensions to include, e.g., ["ts", "js"]
- **contextLines** (optional): Lines of context (default: 2)

### Examples
\`\`\`
localGrep({ pattern: "getUserById" })
localGrep({ pattern: "async.*await", regex: true, fileTypes: ["ts"] })
localGrep({ pattern: "TODO:", paths: ["/path/to/project"] })
\`\`\``,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createLocalGrepTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: null,
      })
  );

  // Execute Command Tool - Run shell commands safely within synced directories
  registry.register(
    "executeCommand",
    {
      displayName: "Execute Command",
      category: "utility",
      keywords: [
        "execute",
        "command",
        "shell",
        "terminal",
        "npm",
        "yarn",
        "pnpm",
        "git",
        "run",
        "script",
        "build",
        "test",
        "lint",
        "install",
        "cli",
      ],
      shortDescription:
        "Execute shell commands safely within synced directories",
      fullInstructions: `Execute shell commands within the user's synced/indexed directories.

**Security Restrictions:**
- Commands only run within synced folders (user-approved directories)
- Dangerous commands (rm, sudo, format, chmod, etc.) are blocked
- 30-second timeout by default (max 5 minutes)
- Output limited to prevent memory issues

**Common Use Cases:**
- Run tests: executeCommand({ command: "npm", args: ["test"] })
- Check git status: executeCommand({ command: "git", args: ["status"] })
- Install dependencies: executeCommand({ command: "npm", args: ["install"] })
- Build project: executeCommand({ command: "npm", args: ["run", "build"] })
- List files: executeCommand({ command: "ls", args: ["-la"] })

**Parameters:**
- command: The executable to run (npm, git, node, etc.)
- args: Array of command arguments
- cwd: Working directory (defaults to first synced folder)
- timeout: Max execution time in ms (default 30000)`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createExecuteCommandTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: null,
      })
  );

  // Describe Image Tool (ALWAYS LOADED - essential for virtual try-on workflows)
  // CRITICAL: This tool uses the configured vision model (Claude/OpenRouter) to analyze images.
  // ALWAYS use this before making assumptions about user photos, clothing, rooms, or any visual content.
  registry.register(
    "describeImage",
    {
      displayName: "Describe Image",
      category: "analysis",
      keywords: [
        "analyze", "describe", "vision", "understand", "see", "look",
        "person", "photo", "portrait", "selfie", "user photo",
        "room", "layout", "interior", "space",
        "product", "clothing", "outfit", "fashion", "style",
        "gender", "appearance", "body type", "skin tone",
        "identify", "recognize", "detect",
        "image", "virtual", "try-on", "try on", "tryon"
      ],
      shortDescription: "Analyze any image using vision AI - people, rooms, products, clothing. ALWAYS use before making assumptions about visual content.",
      fullInstructions: `## Describe Image Tool (Vision AI)

This tool uses the configured vision-capable AI model (Claude or OpenRouter) to analyze images and provide detailed descriptions.

### ⚠️ MANDATORY FIRST STEP - NEVER SKIP

**This tool MUST be called FIRST when:**
- User uploads a photo and requests virtual try-on
- User uploads a room image and requests furniture visualization
- You would otherwise guess visual details (gender, body type, room style, etc.) without looking

**Skipping describeImage leads to:**
- ❌ Wrong gender/body type assumptions
- ❌ Poor editImage results due to incorrect prompts
- ❌ Inaccurate room/product descriptions

### Analysis Types
- **person**: For photos of people - describes appearance, body type, style, clothing
- **room**: For interior spaces - describes layout, style, materials, lighting
- **product**: For items/clothing - describes type, color, material, style
- **general**: For any other image

### Parameters
- **imageUrl** (required): URL of the image to analyze
- **focusAreas** (optional): Specific aspects to focus on (e.g., "body type", "skin tone", "room layout")
- **analysisType** (optional): Type of analysis - "person", "room", "product", or "general"

### Workflow Integration
After calling describeImage, use the analysis in your editImage prompt:
\`\`\`
// Step 1: Analyze
const analysis = await describeImage({
  imageUrl: userPhotoUrl,
  analysisType: "person",
  focusAreas: ["body type", "skin tone", "current style"]
});

// Step 2: Use analysis in edit prompt
editImage({
  image_url: userPhotoUrl,
  second_image_url: referenceImageUrl,
  prompt: \`Dress person in shirt. Analysis shows: \${analysis}. Match their build.\`
});
\`\`\`

### CRITICAL: Never assume - always analyze first.`,
      loading: { alwaysLoad: true },  // Always available - essential for virtual try-on
      requiresSession: false,
      // No enableEnvVar - uses getVisionModel() which falls back to Claude (always available)
    } satisfies ToolMetadata,
    (context) => createDescribeImageTool(context.sessionId)
  );

  // Web Search Tool (configurable per-agent - lightweight web search)
  registry.register(
    "webSearch",
    {
      displayName: "Web Search",
      category: "search",
      keywords: [
        "search",
        "web",
        "internet",
        "lookup",
        "find",
        "google",
        "current",
        "news",
        "facts",
        "information",
        // Phrase keywords for better discovery
        "web search",
        "internet search",
        "search the web",
        "online search",
        "search online",
        "find online",
        "browse web",
        "surf web",
      ],
      shortDescription:
        "Search the web for URLs, then use webBrowse to read them",
      fullInstructions: `## Web Search Tool

Search the web to find relevant URLs. **After finding URLs, use \`webBrowse\` to read and analyze them.**

### Workflow
1. Use \`webSearch\` to find URLs for your topic
2. Use \`webBrowse\` with the discovered URLs to read and synthesize content
3. \`webBrowse\` returns a consolidated answer - no need for additional tool calls

### When to Use
- Finding URLs for a topic you want to research
- Quick fact-checking (when you just need the search snippet)
- Looking up current events or recent news
- **Maximum 2 webSearch calls per conversation**

### When NOT to Use
- ❌ For comprehensive research (use Deep Research instead)
- ❌ When you have a specific URL (use \`webBrowse\` directly)
- ❌ For reading/analyzing URL content (use \`webBrowse\` instead)
- ❌ If you've made 2+ webSearch calls already

### Parameters
- **query** (required): The search query
- **maxResults** (optional): 1-10 results, default 5
- **includeAnswer** (optional): Get AI-generated summary, default true

### Next Step After Search
After getting URLs from webSearch, use \`webBrowse\`:
\`\`\`
webBrowse({
  urls: ["https://found-url-1.com", "https://found-url-2.com"],
  query: "What specific information do you need?"
})
\`\`\`

### Example Usage
- "Latest news on AI regulation" → then webBrowse the article URLs
- "Current price of Bitcoin" → snippet may be enough, or webBrowse for details`,
      loading: { deferLoading: true },
      requiresSession: false,
      enableEnvVar: "TAVILY_API_KEY",
    } satisfies ToolMetadata,
    () => createWebSearchTool()
  );

  // ============================================================
  // DEFERRED TOOLS - AI Model Pipelines (require searchTools to discover)
  // ============================================================

  // Firecrawl Crawl Tool
  registry.register(
    "firecrawlCrawl",
    {
      displayName: "Crawl Website",
      category: "search",
      keywords: [
        "crawl",
        "spider",
        "website",
        "pages",
        "multiple",
        "firecrawl",
        "sitemap",
        "documentation",
      ],
      shortDescription: "Crawl multiple pages from a website starting from a URL",
      fullInstructions: `## Firecrawl Website Crawler

Crawl multiple pages from a website and extract content as markdown.

### When to Use
- Reading documentation sites
- Extracting content from multiple related pages
- Building knowledge from an entire section of a website

### Parameters
- **url** (required): Starting URL to crawl from
- **maxPages** (optional): Maximum pages to crawl (1-50, default: 10)
- **includePaths** (optional): URL patterns to include (e.g., ["/docs/*"])
- **excludePaths** (optional): URL patterns to exclude (e.g., ["/blog/*"])

### Notes
- Crawling is async and may take up to 60 seconds
- Results include markdown for each crawled page
- Use includePaths/excludePaths to focus on specific sections
- Uses the configured web scraping provider from Settings (Firecrawl or Local)

### Example Usage
"Crawl the documentation at https://docs.example.com/ with a limit of 20 pages"`,
      loading: { deferLoading: true },
      requiresSession: false,
      enableEnvVar: "FIRECRAWL_API_KEY",
    } satisfies ToolMetadata,
    (context) => createFirecrawlCrawlTool(context.sessionId)
  );

  // Web Browse Tool - Session-scoped web browsing with synthesis
  registry.register(
    "webBrowse",
    {
      displayName: "Web Browse",
      category: "search",
      keywords: [
        "browse",
        "web",
        "read",
        "fetch",
        "analyze",
        "webpage",
        "url",
        "content",
        "synthesize",
        // Phrase keywords for better discovery
        "web browse",
        "browse website",
        "read webpage",
        "fetch url",
        "scrape web",
        "extract web",
        "internet",
        "web content",
      ],
      shortDescription: "Fetch web pages and synthesize information in one operation",
      fullInstructions: `## Web Browse

Fetch one or more web pages and get a synthesized answer to your question.

### When to Use
- When you have specific URLs and need to extract information
- Reading and analyzing articles, documentation, or product pages
- When you need a consolidated answer from multiple sources
- For follow-up questions about web content (use webQuery instead)

### When NOT to Use
- For searching the web without URLs (use webSearch first to find URLs)
- When you need to crawl an entire site (use firecrawlCrawl)

### Parameters
- **urls** (required): 1-5 URLs to fetch and analyze
- **query** (required): What you want to know from the content

### How It Works
1. Fetches all requested URLs
2. Stores content in session cache (temporary, not permanent)
3. Uses AI to synthesize an answer from the content
4. Returns a consolidated response

### Tips
- Be specific with your query for better synthesis
- Content is cached for this conversation only
- Use webQuery for follow-up questions about the same content`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "FIRECRAWL_API_KEY",
    } satisfies ToolMetadata,
    () => createWebBrowseTool({ sessionId: "", userId: "", characterId: null })
  );

  // Web Query Tool - Query previously fetched content
  registry.register(
    "webQuery",
    {
      displayName: "Web Query",
      category: "search",
      keywords: [
        "query",
        "web",
        "cached",
        "session",
        "follow-up",
        "question",
        "content",
      ],
      shortDescription: "Query previously fetched web content from this conversation",
      fullInstructions: `## Web Query

Ask follow-up questions about web content already fetched in this conversation.

### When to Use
- After using webBrowse to fetch URLs
- For follow-up questions about the same content
- To extract different information from already-fetched pages

### When NOT to Use
- If you haven't fetched any URLs yet (use webBrowse first)
- For new URLs (use webBrowse instead)

### Parameters
- **query** (required): Your question about the cached content

### Tips
- Only works with content fetched in the current conversation
- Content expires after 2 hours
- More efficient than re-fetching the same URLs`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    () => createWebQueryTool({ sessionId: "", userId: "", characterId: null })
  );

  // ============================================================================
  // LOCAL COMFYUI IMAGE GENERATION TOOLS
  // These tools use the local ComfyUI backend for image generation
  // Enable via Settings > ComfyUI Settings
  // ============================================================================

  // Z-Image Turbo FP8 - Local Generation
  registry.register(
    "generateImageZImage",
    {
      displayName: "Generate Image (Z-Image Local)",
      category: "image-generation",
      keywords: [
        "generate", "create", "image", "local", "comfyui", "z-image", "turbo", "fp8",
        "text-to-image", "fast", "offline", "private", "local image", "generate locally",
      ],
      shortDescription: "Generate images locally using Z-Image Turbo FP8 via ComfyUI",
      fullInstructions: `## Z-Image Turbo FP8 (Local ComfyUI)

Generate high-quality images locally using the Z-Image Turbo FP8 model.


### Parameters
- **prompt** (required): Text description of the image
- **seed** (optional): For reproducibility (-1 = random)
- **width/height** (optional): Default 1024x1024
- **steps** (optional): Default 9 (optimized)
- **cfg** (optional): Default 1.0 (optimized)
- **lora_strength** (optional): Detailer LoRA strength (0-2, default 0.5)`,
      loading: { deferLoading: true },
      requiresSession: false,
      // Only available when local ComfyUI is enabled
      enableEnvVar: "COMFYUI_LOCAL_ENABLED",
    } satisfies ToolMetadata,
    () => createZImageGenerateTool()
  );

  // FLUX.2 Klein 4B - Local Generation
  registry.register(
    "generateImageFlux2Klein4B",
    {
      displayName: "Generate Image (FLUX.2 Klein 4B Local)",
      category: "image-generation",
      keywords: [
        "generate", "create", "image", "local", "comfyui", "flux", "flux2", "klein", "4b",
        "text-to-image", "fast", "offline", "private", "local image", "generate locally",
        "edit", "reference", "image-to-image",
      ],
      shortDescription: "Generate or edit images locally using FLUX.2 Klein 4B via ComfyUI",
      fullInstructions: `## FLUX.2 Klein 4B (Local ComfyUI)

Generate or edit high-quality images locally using the FLUX.2 Klein 4B model.
Supports dual modes:
- **Text-to-Image**: No reference_images → generates from prompt
- **Image Editing**: With reference_images → edits based on references

### Parameters
- **prompt** (required): Text description of the image or edit
- **seed** (optional): For reproducibility
- **width/height** (optional): Default 1024x1024 (must be divisible by 8)
- **steps** (optional): Default 20
- **guidance** (optional): CFG scale, default 4.0
- **reference_images** (optional): Array of base64 images for editing mode (max 10)

### Performance
- Text-to-image: ~7-8 seconds
- Image editing: ~10-14 seconds
- Requires ~12GB VRAM`,
      loading: { deferLoading: true },
      requiresSession: false,
      enableEnvVar: "FLUX2_KLEIN_4B_ENABLED",
    } satisfies ToolMetadata,
    () => createFlux2Klein4BGenerateTool()
  );

  // FLUX.2 Klein 9B - Local Generation (Higher Quality)
  registry.register(
    "generateImageFlux2Klein9B",
    {
      displayName: "Generate Image (FLUX.2 Klein 9B Local)",
      category: "image-generation",
      keywords: [
        "generate", "create", "image", "local", "comfyui", "flux", "flux2", "klein", "9b",
        "text-to-image", "high-quality", "detailed", "offline", "private", "local image",
        "edit", "reference", "image-to-image", "premium",
      ],
      shortDescription: "Generate or edit high-quality images locally using FLUX.2 Klein 9B via ComfyUI",
      fullInstructions: `## FLUX.2 Klein 9B (Local ComfyUI)

Generate or edit premium quality images locally using the FLUX.2 Klein 9B model.
Higher quality and more detailed output compared to 4B variant.
Supports dual modes:
- **Text-to-Image**: No reference_images → generates from prompt
- **Image Editing**: With reference_images → edits based on references

### Parameters
- **prompt** (required): Text description of the image or edit
- **seed** (optional): For reproducibility
- **width/height** (optional): Default 1024x1024 (must be divisible by 8)
- **steps** (optional): Default 20
- **guidance** (optional): CFG scale, default 4.0
- **reference_images** (optional): Array of base64 images for editing mode (max 10)

### Performance
- Text-to-image: ~10-12 seconds
- Image editing: ~14-18 seconds
- Requires ~16GB+ VRAM`,
      loading: { deferLoading: true },
      requiresSession: false,
      enableEnvVar: "FLUX2_KLEIN_9B_ENABLED",
    } satisfies ToolMetadata,
    () => createFlux2Klein9BGenerateTool()
  );

  // ============================================================================
  // LEGACY STYLY IO API TOOLS
  // These tools use the STYLY IO API and are disabled by default.
  // Set ENABLE_LEGACY_IMAGE_TOOLS=true to enable them.
  // ============================================================================
  if (process.env.ENABLE_LEGACY_IMAGE_TOOLS === "true") {
    // Image Editor Tool (Gemini) - General Image-to-Image editing and Virtual Try-On
    registry.register(
      "editImage",
      {
        displayName: "Image Editor (Gemini)",
        category: "image-editing",
        keywords: [
          // General image editing terms - HIGH PRIORITY for search
          "edit", "edit image", "image edit", "modify", "transform", "change", "adjust",
          "image editing", "photo editing", "edit photo", "photo edit",
          // Variations/remix terms
          "variations", "variation", "remix", "create variations", "generate variations",
          "image-to-image", "img2img", "i2i",
          // Style/transfer terms
          "style transfer", "apply style", "combine images", "blend",
          // Room/interior (original use case, still supported)
          "room", "interior", "material", "texture", "color", "wall", "floor",
          // Furniture visualization
          "furniture", "how would", "look in my room", "place", "visualize",
          "couch", "sofa", "chair", "table", "desk", "bed", "bookcase", "shelf",
          "IKEA", "decor", "staging", "virtual staging",
          // Virtual try-on - KEY USE CASE
          "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
          "shirt", "dress", "pants", "jacket", "suit", "formal wear", "attire",
          "how would I look", "wear", "wearing", "style me",
          // Technical
          "gemini", "flash",
        ],
        shortDescription: "Edit images, combine elements from two images, or create virtual try-on visualizations",
        fullInstructions: `## Image Editor (Gemini)

Edit existing images using text instructions with Gemini 2.5 Flash. Combines elements from two images for virtual try-on and furniture visualization.

### ⚠️ MANDATORY 3-STEP WORKFLOW FOR VIRTUAL TRY-ON

**You MUST complete ALL THREE steps in order:**

**Step 1: Call \`describeImage\` FIRST (MANDATORY - NEVER SKIP)**
\`\`\`
describeImage({
  imageUrl: "[user's photo URL]",
  analysisType: "person",
  focusAreas: ["body type", "skin tone", "current style"]
})
\`\`\`
Skipping this step causes: wrong gender assumptions, poor fitting, inaccurate results.

**Step 2: Fetch reference image**
- Use \`webSearch\` to find product pages, then \`webBrowse\` to read them
- Or use \`webBrowse\` directly if you have the URL
- Extract the reference image URL from the response

**Step 3: Call \`editImage\` with BOTH images**
\`\`\`
editImage({
  image_url: "[user's photo]",              // REQUIRED
  second_image_url: "[reference image]",    // REQUIRED for try-on
  prompt: "Dress person in [item]. [Use insights from describeImage]"
})
\`\`\`

### ❌ COMMON MISTAKES - AVOID THESE
- ❌ Calling editImage WITHOUT first calling describeImage
- ❌ Using text-only prompt without second_image_url for try-on
- ❌ Assuming gender/body type without image analysis
- ❌ Re-searching for items you already fetched

### Parameters
- **prompt** (required): Instructions for the edit, including insights from describeImage
- **image_url** (required): User's photo URL
- **second_image_url** (REQUIRED for try-on/visualization): Reference image URL
- **temperature** (optional): 0-2, controls creativity. Default: 1.0

### When to Use
- **Virtual Try-On**: Clothing/accessories on user's photo
- **Furniture Visualization**: Furniture in room photos
- **Image Variations**: Creating edits of any image
- **Style Transfer**: Applying styles from one image to another

### Two Modes
1. **Single Image Edit**: One image + describe changes
2. **Two Image Combine (REQUIRED for try-on)**: Both images to blend elements

### Finding Image URLs in Conversation
- Uploaded images: \`[Image URL: https://...]\` or \`[filename URL: https://...]\`
- Generated images: \`[Previous editImage result - Generated image URLs: https://...]\`

### Example Prompts for Try-On
- "Dress the person in this formal shirt, maintaining realistic proportions"
- "Show how this blazer would look on the person in the photo"
- "Apply this clothing item to the user's photo naturally"

### Example Prompts for Furniture/Room
- "Place this bookcase against the wall in the room"
- "Add this sofa to the living room scene"

### Example Prompts for Single Image Edit
- "Make the sky more dramatic with sunset colors"
- "Change the wall color to sage green"`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId }) => createImageEditTool(sessionId!)
    );

    // Flux2 Generate Tool
    registry.register(
      "generateImageFlux2",
      {
        displayName: "Generate Image (Flux2)",
        category: "image-generation",
        keywords: [
          "generate",
          "create",
          "image",
          "flux",
          "text-to-image",
          "art",
          "illustration",
          "reference",
        ],
        shortDescription: "Generate or edit images with Flux2 text-to-image model",
        fullInstructions: `## Flux2 Image Generation & Editing

Powerful dual-mode tool for text-to-image generation AND image editing.

### CRITICAL: Dual-Mode Operation

**Mode 1: Pure Generation (WITHOUT referenceImages)**
- Creates new images from text descriptions
- Use when: User asks to create/generate/make something new from scratch
- Do NOT include referenceImages parameter

**Mode 2: Image Editing (WITH referenceImages)**
- Modifies/transforms existing images based on the prompt
- Use when: User wants to edit, change, or modify a previously generated or uploaded image
- MUST include the image URL(s) in the referenceImages array

### Edit Detection Rules

**Use referenceImages when user says:**
- "edit", "modify", "change", "adjust", "update", "fix", "alter", "transform", "add to", "remove from"
- AND there is a previously generated image OR user uploaded an image

### Finding Image URLs in Conversation
- Generated images: Look for \`[Previous generateImageFlux2 result - Generated image URLs: https://...]\`
- Uploaded images: Look for \`[Image URL: https://...]\` or \`[uploaded image URL: https://...]\`

### Parameters
- **prompt** (required): Text description. For edits, focus on the CHANGE only (concise!)
- **referenceImages** (optional): Array of up to 10 image URLs for editing mode
- **width/height**: 256-2048 (divisible by 8). OMIT for default 1024x1024
- **guidance**: OMIT for default 4.0
- **steps**: OMIT for default 20
- **seed**: For reproducibility

### Edit Prompt Writing (CONCISE!)
When editing, write SHORT change-focused prompts:
- "Add the Istanbul sunset painting to the white wall"
- "Place the cat sitting on the yellow armchair"
- "Replace the cat with a woman in the same pose"

DO NOT describe the entire scene - reference images provide visual context.`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId, characterAvatarUrl, characterAppearanceDescription }) =>
        createFlux2GenerateTool(sessionId!, {
          characterAvatarUrl,
          characterAppearanceDescription,
        })
    );

    // WAN 2.2 Imagen Tool
    registry.register(
      "generateImageWan22",
      {
        displayName: "Generate Image (WAN 2.2)",
        category: "image-generation",
        keywords: [
          "generate",
          "create",
          "image",
          "wan",
          "anime",
          "artistic",
          "illustration",
          "portrait",
        ],
        shortDescription: "Generate anime-style or artistic images with WAN 2.2",
        fullInstructions: `## WAN 2.2 Image Generation

Generate anime-style or artistic images from text prompts.

### When to Use
- Creating anime-style or artistic images
- Generating character portraits or illustrations
- When you need a specific artistic style

### Parameters
- **positive** (required): Text prompt describing the image
- **negative** (optional): What to avoid. Default includes Chinese quality terms.
- **width**: 512, 768, 1024, or 1536. Default: 768
- **height**: 512, 768, 1024, 1344, or 1536. Default: 1344
- **seed**: For reproducibility`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId }) => createWan22ImagenTool(sessionId!)
    );

    // WAN 2.2 Video Tool
    registry.register(
      "generateVideoWan22",
      {
        displayName: "Generate Video (WAN 2.2)",
        category: "video-generation",
        keywords: [
          "video",
          "animate",
          "motion",
          "movement",
          "wan",
          "image-to-video",
        ],
        shortDescription: "Animate images into videos with WAN 2.2",
        fullInstructions: `## WAN 2.2 Video Generation

Animate still images into videos using PainterI2V motion synthesis.

### When to Use
- Animating a still image with specific motion
- Creating short video clips from generated images
- Adding camera movements or character animations to static images

### Parameters
- **image_url** OR **base64_image** (one required): The input image to animate
- **positive** (required): Motion prompt describing desired motion (e.g., "camera slowly pans left while character waves")
- **negative** (optional): What to avoid. Default: "static, blurry, distorted"
- **fps**: 10, 15, 21, 24, 30, or 60. Default: 21
- **duration**: 0.5, 1, 1.5, 2, 2.5, 3, or 5 seconds. Default: 2.0
- **motion_amplitude**: 0.1-1.1, controls motion intensity. Default: 1.0
- **seed**: For reproducibility

### Motion Prompt Tips
Be specific about actions, movements, and camera angles:
- "Wind blowing through hair, subtle breathing motion"
- "Camera slowly zooms in, eyes blink naturally"
- "Gentle head turn to the right, smile appears"`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId }) => createWan22VideoTool(sessionId!)
    );

    // WAN 2.2 Pixel Animation Tool
    registry.register(
      "generatePixelVideoWan22",
      {
        displayName: "Generate Pixel Animation (WAN 2.2)",
        category: "video-generation",
        keywords: [
          "pixel",
          "sprite",
          "animation",
          "character",
          "game",
          "retro",
          "wan",
          "video",
          "8-bit",
          "16-bit",
        ],
        shortDescription:
          "Generate pixel art character sprite animations with WAN 2.2",
        fullInstructions: `## WAN 2.2 Pixel Animation

Generate pixel art character sprite animations using WAN 2.2 with specialized LoRA for pixel art animation.

### When to Use
- Creating pixel art character sprite animations for games
- Generating retro-style character animations (walking, attacking, idle, etc.)
- Animating character sprites with visual effects (particles, glows, trails)
- Game development requiring sprite-based character animations

### Parameters
- **image_url** OR **base64_image** (one required): The character sprite base image to animate
- **positive** (required): Simple, natural description of the desired animation (1-2 sentences)
- **negative** (optional): Negative prompt for unwanted elements (e.g., "blurry, distorted, low quality")
- **fps**: 10, 15, 21, 24, 30, or 60. **Recommended: 21-24** for smooth pixel animations
- **duration**: 0.5, 1, 1.5, 2, 2.5, 3, or 5 seconds. Default: 2.0
- **seed**: For reproducibility
- **lora_name**: LoRA model name. Default: "wan2.2_animate_adapter_epoch_95.safetensors" (DO NOT CHANGE)
- **lora_strength**: LoRA strength 0.0-2.0. Default: 1.0 (DO NOT CHANGE)

### CRITICAL: Prompt Style

**USE SIMPLE, NATURAL DESCRIPTIONS.** The model works MUCH better with concise prompts (1-2 sentences) that describe the overall motion naturally.

**DO NOT** write technical phase-by-phase breakdowns or frame-by-frame specifications - this produces poor results.

### Good Prompt Examples

**Walking animation:**
"Pixel adventurer character performs a smooth walking animation cycle. The character strides forward with alternating leg movements, arm swings, backpack bounce, and small dust particle effects from the feet."

**Attack animation:**
"Pixel knight swings sword in a powerful horizontal slash. Arm extends, sword arcs through the air with a glowing trail effect, cape billows from the motion."

**Idle animation:**
"Pixel mage character stands in a gentle breathing idle pose. Robe sways slightly, magical particles float around the staff, eyes blink occasionally."

**Jump animation:**
"Pixel warrior performs an energetic jump. Legs push off the ground, arms raise for balance, cape flutters upward, lands with a small dust cloud."

### Bad Prompt Example

DO NOT write prompts like this:
"Phase 1 (0-20%): Wind-up - character pulls weapon back, slight crouch. Phase 2 (20-45%): Acceleration - weapon swings forward in arc. Phase 3 (45-70%): Strike contact - full extension. Phase 4 (70-85%): Follow-through - momentum carries forward. Phase 5 (85-100%): Recovery - return to stance..."

This overly technical approach produces poor quality results.

### Prompt Guidelines
- Keep prompts to 1-2 sentences describing the overall action
- Describe what the animation LOOKS LIKE, not technical frame data
- Mention key visual elements: main motion, secondary motion (hair, cape, accessories), effects (particles, trails)
- Use natural language: "walks smoothly", "swings powerfully", "bounces gently"
- Include style words if needed: "smooth", "energetic", "gentle", "powerful"
- Use fps=21 or fps=24 for smooth animations (NOT fps=10)
- Always include a negative prompt: "blurry, distorted, low quality, smeared"`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId }) => createWan22PixelVideoTool(sessionId!)
    );
  } // End LEGACY STYLY IO API TOOLS conditional

  // ============================================================================
  // OpenRouter Image Tools
  // These tools use OpenRouter API for image generation, editing, and referencing
  // ============================================================================

  // Flux.2 Flex - Generate
  registry.register(
    "generateImageFlux2Flex",
    {
      displayName: "Generate Image (Flux.2 Flex)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "flux", "text-to-image", "art", "illustration"],
      shortDescription: "Generate images from text using Flux.2 Flex via OpenRouter",
      fullInstructions: `## Flux.2 Flex Image Generation

Generate high-quality images from text descriptions using Black Forest Labs' Flux.2 Flex model via OpenRouter.

### When to Use
- Creating new images from text descriptions
- High-quality, versatile image generation
- When you need detailed, artistic images

### Parameters
- **prompt** (required): Detailed text description of the image to generate
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterFlux2FlexGenerate(sessionId!)
  );

  // Flux.2 Flex - Edit
  registry.register(
    "editImageFlux2Flex",
    {
      displayName: "Edit Image (Flux.2 Flex)",
      category: "image-editing",
      keywords: ["edit", "modify", "transform", "image", "flux", "image-to-image"],
      shortDescription: "Edit existing images using Flux.2 Flex via OpenRouter",
      fullInstructions: `## Flux.2 Flex Image Editing

Edit and transform existing images using Black Forest Labs' Flux.2 Flex model via OpenRouter.

### When to Use
- Modifying existing images
- Adding or removing elements
- Transforming image style or content

### Parameters
- **prompt** (required): Edit instructions describing what to change
- **source_image_url** (required): URL or base64 data URL of the image to edit
- **mask_url** (optional): Mask for inpainting (white = edit, black = preserve)
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterFlux2FlexEdit(sessionId!)
  );

  // Flux.2 Flex - Reference
  registry.register(
    "referenceImageFlux2Flex",
    {
      displayName: "Reference Image (Flux.2 Flex)",
      category: "image-generation",
      keywords: ["reference", "style", "transfer", "image", "flux", "guided"],
      shortDescription: "Generate images guided by a reference using Flux.2 Flex via OpenRouter",
      fullInstructions: `## Flux.2 Flex Reference-Guided Generation

Generate new images guided by a reference image for style transfer and content-guided generation.

### When to Use
- Style transfer from one image to generated content
- Creating variations based on a reference
- Maintaining consistency across generated images

### Parameters
- **prompt** (required): Generation instructions
- **reference_image_url** (required): URL or base64 data URL of the reference image
- **reference_strength** (optional): How strongly to follow the reference (0.0-1.0)
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterFlux2FlexReference(sessionId!)
  );

  // GPT-5 Image Mini - Generate
  registry.register(
    "generateImageGpt5Mini",
    {
      displayName: "Generate Image (GPT-5 Mini)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "gpt", "openai", "fast", "mini"],
      shortDescription: "Generate images quickly using GPT-5 Image Mini via OpenRouter",
      fullInstructions: `## GPT-5 Image Mini Generation

Fast, efficient image generation using OpenAI's GPT-5 Image Mini model via OpenRouter.

### When to Use
- Quick image generation
- When speed is more important than maximum quality
- Iterative design exploration

### Parameters
- **prompt** (required): Text description of the image to generate
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageMiniGenerate(sessionId!)
  );

  // GPT-5 Image Mini - Edit
  registry.register(
    "editImageGpt5Mini",
    {
      displayName: "Edit Image (GPT-5 Mini)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "image", "gpt", "openai", "fast", "mini",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "image editing", "photo editing", "transform",
      ],
      shortDescription: "Edit images quickly using GPT-5 Image Mini via OpenRouter",
      fullInstructions: `## GPT-5 Image Mini Editing

Quick image editing using OpenAI's GPT-5 Image Mini model via OpenRouter.

### Parameters
- **prompt** (required): Edit instructions
- **source_image_url** (required): URL or base64 data URL of the image to edit
- **mask_url** (optional): Mask for inpainting
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageMiniEdit(sessionId!)
  );

  // GPT-5 Image Mini - Reference
  registry.register(
    "referenceImageGpt5Mini",
    {
      displayName: "Reference Image (GPT-5 Mini)",
      category: "image-generation",
      keywords: [
        "reference", "style", "image", "gpt", "openai", "fast", "mini",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "style transfer", "guided generation",
      ],
      shortDescription: "Generate images with reference using GPT-5 Image Mini via OpenRouter",
      fullInstructions: `## GPT-5 Image Mini Reference-Guided Generation

Quick reference-guided image generation using OpenAI's GPT-5 Image Mini model.

### Parameters
- **prompt** (required): Generation instructions
- **reference_image_url** (required): URL or base64 data URL of the reference image
- **reference_strength** (optional): Reference influence (0.0-1.0)
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageMiniReference(sessionId!)
  );

  // GPT-5 Image - Generate
  registry.register(
    "generateImageGpt5",
    {
      displayName: "Generate Image (GPT-5)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "gpt", "openai", "premium", "quality"],
      shortDescription: "Generate premium quality images using GPT-5 Image via OpenRouter",
      fullInstructions: `## GPT-5 Image Generation

Premium quality image generation using OpenAI's GPT-5 Image model via OpenRouter.

### When to Use
- When you need the highest quality results
- Complex, detailed image generation
- Professional-grade outputs

### Parameters
- **prompt** (required): Detailed text description of the image to generate
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageGenerate(sessionId!)
  );

  // GPT-5 Image - Edit
  registry.register(
    "editImageGpt5",
    {
      displayName: "Edit Image (GPT-5)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "transform", "image", "gpt", "openai", "premium",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "image editing", "photo editing",
      ],
      shortDescription: "Premium image editing using GPT-5 Image via OpenRouter",
      fullInstructions: `## GPT-5 Image Editing

Premium image editing using OpenAI's GPT-5 Image model via OpenRouter.

### Parameters
- **prompt** (required): Edit instructions
- **source_image_url** (required): URL or base64 data URL of the image to edit
- **mask_url** (optional): Mask for inpainting
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageEdit(sessionId!)
  );

  // GPT-5 Image - Reference
  registry.register(
    "referenceImageGpt5",
    {
      displayName: "Reference Image (GPT-5)",
      category: "image-generation",
      keywords: [
        "reference", "style", "transfer", "image", "gpt", "openai", "premium",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "style transfer", "guided generation",
      ],
      shortDescription: "Premium reference-guided generation using GPT-5 Image via OpenRouter",
      fullInstructions: `## GPT-5 Image Reference-Guided Generation

Premium style transfer and reference-guided generation using OpenAI's GPT-5 Image model.

### Parameters
- **prompt** (required): Generation instructions
- **reference_image_url** (required): URL or base64 data URL of the reference image
- **reference_strength** (optional): Reference influence (0.0-1.0)
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageReference(sessionId!)
  );

  // Gemini 2.5 Flash Image - Generate
  registry.register(
    "generateImageGemini25Flash",
    {
      displayName: "Generate Image (Gemini 2.5 Flash)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "gemini", "google", "flash", "fast"],
      shortDescription: "Fast image generation using Gemini 2.5 Flash Image via OpenRouter",
      fullInstructions: `## Gemini 2.5 Flash Image Generation

Fast, high-quality image generation using Google's Gemini 2.5 Flash Image model via OpenRouter.

### When to Use
- Fast image generation with good quality
- When you need quick iterations
- Google's latest image model

### Parameters
- **prompt** (required): Text description of the image to generate
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini25FlashImageGenerate(sessionId!)
  );

  // Gemini 2.5 Flash Image - Edit
  registry.register(
    "editImageGemini25Flash",
    {
      displayName: "Edit Image (Gemini 2.5 Flash)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "image", "gemini", "google", "flash", "fast",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "image editing", "photo editing", "transform",
      ],
      shortDescription: "Fast image editing using Gemini 2.5 Flash Image via OpenRouter",
      fullInstructions: `## Gemini 2.5 Flash Image Editing

Fast image editing using Google's Gemini 2.5 Flash Image model via OpenRouter.

### Parameters
- **prompt** (required): Edit instructions
- **source_image_url** (required): URL or base64 data URL of the image to edit
- **mask_url** (optional): Mask for inpainting
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini25FlashImageEdit(sessionId!)
  );

  // Gemini 2.5 Flash Image - Reference
  registry.register(
    "referenceImageGemini25Flash",
    {
      displayName: "Reference Image (Gemini 2.5 Flash)",
      category: "image-generation",
      keywords: [
        "reference", "style", "image", "gemini", "google", "flash",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "style transfer", "guided generation",
      ],
      shortDescription: "Fast reference-guided generation using Gemini 2.5 Flash Image via OpenRouter",
      fullInstructions: `## Gemini 2.5 Flash Image Reference-Guided Generation

Fast reference-guided image generation using Google's Gemini 2.5 Flash Image model.

### Parameters
- **prompt** (required): Generation instructions
- **reference_image_url** (required): URL or base64 data URL of the reference image
- **reference_strength** (optional): Reference influence (0.0-1.0)
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini25FlashImageReference(sessionId!)
  );

  // Gemini 3 Pro Image - Generate
  registry.register(
    "generateImageGemini3Pro",
    {
      displayName: "Generate Image (Gemini 3 Pro)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "gemini", "google", "pro", "latest"],
      shortDescription: "Latest Gemini image generation using Gemini 3 Pro Image via OpenRouter",
      fullInstructions: `## Gemini 3 Pro Image Generation

Latest image generation using Google's Gemini 3 Pro Image model (preview) via OpenRouter.

### When to Use
- When you need Google's most advanced image model
- Complex, detailed image generation
- Testing latest capabilities

### Parameters
- **prompt** (required): Text description of the image to generate
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini3ProImageGenerate(sessionId!)
  );

  // Gemini 3 Pro Image - Edit
  registry.register(
    "editImageGemini3Pro",
    {
      displayName: "Edit Image (Gemini 3 Pro)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "image", "gemini", "google", "pro", "advanced",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "image editing", "photo editing", "transform",
      ],
      shortDescription: "Advanced image editing using Gemini 3 Pro Image via OpenRouter",
      fullInstructions: `## Gemini 3 Pro Image Editing

Advanced image editing using Google's Gemini 3 Pro Image model (preview) via OpenRouter.

### Parameters
- **prompt** (required): Edit instructions
- **source_image_url** (required): URL or base64 data URL of the image to edit
- **mask_url** (optional): Mask for inpainting
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini3ProImageEdit(sessionId!)
  );

  // Gemini 3 Pro Image - Reference
  registry.register(
    "referenceImageGemini3Pro",
    {
      displayName: "Reference Image (Gemini 3 Pro)",
      category: "image-generation",
      keywords: [
        "reference", "style", "transfer", "image", "gemini", "google", "pro",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "style transfer", "guided generation",
      ],
      shortDescription: "Advanced reference-guided generation using Gemini 3 Pro Image via OpenRouter",
      fullInstructions: `## Gemini 3 Pro Image Reference-Guided Generation

Advanced style transfer and reference-guided generation using Google's Gemini 3 Pro Image model.

### Parameters
- **prompt** (required): Generation instructions
- **reference_image_url** (required): URL or base64 data URL of the reference image
- **reference_strength** (optional): Reference influence (0.0-1.0)
- **aspect_ratio** (optional): "1:1", "16:9", "9:16", "4:3", "3:4"`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini3ProImageReference(sessionId!)
  );

  // Video Assembly Tool (NOT a legacy tool - uses FFmpeg, not STYLY IO API)
  registry.register(
    "assembleVideo",
    {
      displayName: "Assemble Video",
      category: "video-generation",
      keywords: [
        "assemble",
        "video",
        "compile",
        "montage",
        "slideshow",
        "combine",
        "edit",
        "production",
        "transitions",
        "remotion",
      ],
      shortDescription:
        "Assemble session images and videos into a cohesive video with transitions and effects",
      fullInstructions: `## Video Assembly Tool

Assemble images and videos generated during this chat session into a cohesive, professionally-edited video using Remotion.

### When to Use
- After generating multiple images or videos in a session
- User wants to create a montage, slideshow, or compilation
- Combining generated assets into a final video product

### Features
- AI-driven scene planning and sequencing
- Professional transitions (fade, crossfade, slide, wipe, zoom)
- Ken Burns effect on images
- AI-generated text overlays (titles, captions)
- Configurable duration and FPS

### Parameters
- **theme** (optional): Overall theme or concept for the video
- **style** (optional): Visual style ('cinematic', 'documentary', 'dynamic', 'calm')
- **targetDuration** (optional): Target duration in seconds. Default: 30
- **fps** (optional): 24, 30, or 60. Default: 30
- **width/height** (optional): Output dimensions. Default: 1920x1080
- **transitionDuration** (optional): Transition duration in seconds. Default: 0.5
- **defaultTransition** (optional): Transition type. Default: crossfade
- **includeTextOverlays** (optional): Include AI text overlays. Default: true
- **instructions** (optional): Additional AI guidance for video planning

### Example Usage
"Assemble all the images I generated into a 30-second cinematic video with smooth transitions"

### Notes
- The tool automatically analyzes all images and videos in the current session
- AI plans optimal scene sequencing based on content and theme
- Rendering may take some time for longer videos`,
      loading: { deferLoading: true }, // Deferred - discover via searchTools
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) => createVideoAssemblyTool(sessionId!)
  );

  // ============================================================
  // PRODUCT GALLERY TOOL - Display product images for selection
  // ============================================================

  // Show Product Images Tool (always loaded - essential for shopping & try-on UX)
  registry.register(
    "showProductImages",
    {
      displayName: "Product Gallery",
      category: "utility",
      keywords: [
        "product",
        "image",
        "gallery",
        "show",
        "display",
        "preview",
        "shopping",
        "try-on",
        "reference",
        "find",
        "recommend",
        "buy",
        "purchase",
        "floor tiles",
        "furniture",
        "clothing",
        "decor",
      ],
      shortDescription:
        "REQUIRED: Display products with images and purchase links for ALL shopping/product queries",
      fullInstructions: `## Product Gallery Tool - MANDATORY FOR ALL PRODUCT QUERIES

**⚠️ CRITICAL: This tool is REQUIRED whenever you find or recommend products.**

Display product images in a visual gallery with purchase links so users can see, compare, and buy products.

### When to Use - MANDATORY TRIGGERS
- **ALWAYS** when user asks to find/recommend/suggest products (e.g., "find me floor tiles", "recommend a sofa")
- **ALWAYS** after finding products via webSearch/webBrowse
- **ALWAYS** before virtual try-on (editImage)
- **NEVER** skip this tool when you have product information

### Why This is MANDATORY
- Users MUST see product images to make informed decisions
- Users MUST have purchase links to buy products
- Text-only product descriptions are insufficient
- Skipping this tool = poor user experience

### Parameters
- **query** (required): The search query used to find these products
- **products** (required): Array of products with:
  - **id**: Unique identifier
  - **name**: Product name
  - **imageUrl**: Product image URL (REQUIRED - extract from webBrowse)
  - **price**: Product price (include when available)
  - **sourceUrl**: Purchase link (REQUIRED - provide the product page URL)
  - **description**: Brief description (optional)

### Workflow for Product Shopping Queries
1. User asks for product recommendations (e.g., "find floor tiles for my kitchen")
2. Use \`webSearch\` to find product pages
3. Use \`webBrowse\` to extract product details, images, and prices
4. **IMMEDIATELY call \`showProductImages\`** with the products ← REQUIRED
5. Wait for user to review/select products
6. (Optional) Proceed with virtual try-on if requested

### Example - Shopping Query
User: "Find me floor tiles for my kitchen"
→ webSearch for floor tiles
→ webBrowse to get product details
→ showProductImages:
\`\`\`
showProductImages({
  query: "kitchen floor tiles",
  products: [
    {
      id: "1",
      name: "Marble Look Porcelain Tile 24x24",
      imageUrl: "https://example.com/tile1.jpg",
      price: "$4.99/sq ft",
      sourceUrl: "https://homedepot.com/p/marble-tile",
      description: "Durable porcelain tile with marble pattern"
    },
    {
      id: "2",
      name: "Ceramic Kitchen Floor Tile",
      imageUrl: "https://example.com/tile2.jpg",
      price: "$2.49/sq ft",
      sourceUrl: "https://lowes.com/p/ceramic-tile"
    }
  ]
})
\`\`\`

### Common Shopping Scenarios (ALL require showProductImages)
- "Find me floor tiles for my kitchen" → webSearch + webBrowse + **showProductImages**
- "Recommend a comfortable sofa" → webSearch + webBrowse + **showProductImages**
- "Show me summer dresses under $50" → webSearch + webBrowse + **showProductImages**
- "What furniture would fit my room?" → webSearch + webBrowse + **showProductImages**`,
      loading: { deferLoading: true }, // Deferred - discovered via searchTools when shopping
      requiresSession: false,
    } satisfies ToolMetadata,
    () =>
      tool({
        description:
          "REQUIRED for ALL product/shopping queries: Display products with images and purchase links. MUST be called after webSearch/webBrowse when user asks for product recommendations (e.g., 'find floor tiles', 'recommend furniture'). Always include imageUrl and sourceUrl for each product.",
        inputSchema: jsonSchema<{
          query: string;
          products: Array<{
            id: string;
            name: string;
            imageUrl: string;
            price?: string;
            sourceUrl?: string;
            description?: string;
          }>;
        }>({
          type: "object",
          title: "DisplayProductsInput",
          description: "Input schema for displaying product gallery",
          properties: {
            query: {
              type: "string",
              description: "The search query used to find these products",
            },
            products: {
              type: "array",
              description: "Array of products to display in the gallery",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier for the product",
                  },
                  name: {
                    type: "string",
                    description: "Product name",
                  },
                  imageUrl: {
                    type: "string",
                    description: "URL of the product image",
                  },
                  price: {
                    type: "string",
                    description: "Product price (e.g., '$129.90')",
                  },
                  sourceUrl: {
                    type: "string",
                    description: "URL to the product page",
                  },
                  description: {
                    type: "string",
                    description: "Brief product description",
                  },
                },
                required: ["id", "name", "imageUrl"],
              },
            },
          },
          required: ["query", "products"],
        }),
        execute: async ({ query, products }) => {
          // Simply return the data - the UI component handles display
          console.log(
            `[showProductImages] Displaying ${products.length} products for query: "${query}"`
          );
          return {
            status: "success" as const,
            query,
            products,
          };
        },
      })
  );

  console.log(
    `[ToolRegistry] Registered ${registry.getToolNames().length} tools`
  );
}

