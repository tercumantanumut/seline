/**
 * Tool Icon Configuration Map
 * 
 * Maps tool names to Phosphor Icons with specific weights and styling.
 * Uses Phosphor's 6 weight system for visual hierarchy:
 * - duotone: Premium, layered feel for knowledge/analysis tools
 * - bold: Write operations, primary actions
 * - fill: Terminal/execution, active states
 * - regular: Navigation, browsing, utility
 */

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  MagnifyingGlass,
  Globe,
  FileText,
  PencilSimple,
  Terminal,
  Image,
  PaintBrush,
  VideoCamera,
  Eye,
  Package,
  Calculator,
  Database,
  Fire,
  Calendar,
  Brain,
  Plug,
  Robot,
  FloppyDisk,
  ListBullets,
  Binoculars,
  GitDiff,
  Notebook,
  SpeakerHigh,
  Microphone,
  FileMagnifyingGlass,
  Code,
  Wrench,
  ShoppingCart,
  ImageSquare,
  Sparkle,
  Cpu,
  FilePlus,
  Pencil,
  Repeat,
  ArrowsClockwise,
  ChatCircleDots,
  FilmSlate,
  Waveform,
  Scissors,
  MusicNotes,
  ImagesSquare,
  Palette,
  MagicWand,
  Mountains,
  UserCircle,
  Cube,
} from "@phosphor-icons/react";

export type ToolIconWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

export type ToolIconConfig = {
  icon: PhosphorIcon;
  weight: ToolIconWeight;
  accentColor?: string; // Optional override for category color
};

/**
 * Tool Icon Map
 * 
 * Design principles:
 * - duotone: Knowledge, analysis, research tools (premium layered look)
 * - bold: Write/edit operations (emphasis on action)
 * - fill: Execution, terminal, active states (solid, definitive)
 * - regular: Read, browse, utility operations (clean, unobtrusive)
 */
export const TOOL_ICON_MAP: Record<string, ToolIconConfig> = {
  // Search & Discovery
  vectorSearch: { icon: Database, weight: "duotone" },
  webSearch: { icon: Globe, weight: "duotone" },
  webBrowse: { icon: Globe, weight: "regular" },
  webQuery: { icon: Globe, weight: "regular" },
  searchTools: { icon: Binoculars, weight: "duotone" },
  listAllTools: { icon: ListBullets, weight: "regular" },
  localGrep: { icon: MagnifyingGlass, weight: "bold" },
  
  // File Operations
  readFile: { icon: FileText, weight: "regular" },
  editFile: { icon: PencilSimple, weight: "bold" },
  writeFile: { icon: FloppyDisk, weight: "bold" },
  patchFile: { icon: GitDiff, weight: "duotone" },
  createFile: { icon: FilePlus, weight: "bold" },
  
  // Execution & Terminal
  executeCommand: { icon: Terminal, weight: "fill" },
  
  // Planning & Memory
  scheduleTask: { icon: Calendar, weight: "duotone" },
  memorize: { icon: Brain, weight: "duotone" },
  updatePlan: { icon: Notebook, weight: "duotone" },
  
  // Image Generation
  generateImage: { icon: Image, weight: "duotone" },
  generateImageFlux: { icon: Sparkle, weight: "duotone" },
  generateImageFluxPro: { icon: Sparkle, weight: "duotone" },
  generateImageFlux2Pro: { icon: Sparkle, weight: "duotone" },
  generateImageFlux2ProUltra: { icon: Sparkle, weight: "duotone" },
  generateImageRecraft: { icon: Palette, weight: "duotone" },
  generateImageIdeogram: { icon: MagicWand, weight: "duotone" },
  
  // Image Editing
  editImage: { icon: PaintBrush, weight: "bold" },
  editImageFlux2Flex: { icon: PaintBrush, weight: "duotone" },
  editImageRecraft: { icon: Pencil, weight: "bold" },
  editImageIdeogram: { icon: Pencil, weight: "bold" },
  upscaleImage: { icon: ArrowsClockwise, weight: "bold" },
  reimagineImage: { icon: Repeat, weight: "duotone" },
  
  // Image Analysis
  describeImage: { icon: Eye, weight: "duotone" },
  analyzeImage: { icon: Eye, weight: "duotone" },
  
  // Video Generation
  generateVideo: { icon: VideoCamera, weight: "duotone" },
  generateVideoLumaRay: { icon: FilmSlate, weight: "duotone" },
  generateVideoKling: { icon: FilmSlate, weight: "duotone" },
  generateVideoHaiper: { icon: FilmSlate, weight: "duotone" },
  generateVideoMinimax: { icon: FilmSlate, weight: "duotone" },
  generateVideoRunway: { icon: FilmSlate, weight: "duotone" },
  extendVideo: { icon: ArrowsClockwise, weight: "bold" },
  
  // Audio
  transcribe: { icon: Microphone, weight: "duotone" },
  speakAloud: { icon: SpeakerHigh, weight: "fill" },
  generateAudio: { icon: Waveform, weight: "duotone" },
  generateMusic: { icon: MusicNotes, weight: "duotone" },
  
  // E-commerce
  showProductImages: { icon: ShoppingCart, weight: "regular" },
  searchProducts: { icon: MagnifyingGlass, weight: "regular" },
  
  // 3D & Advanced
  generate3D: { icon: Cube, weight: "duotone" },
  generateComfyUI: { icon: Cpu, weight: "duotone" },
  
  // MCP & Integrations
  mcpTool: { icon: Plug, weight: "regular" },
  
  // Utility
  calculator: { icon: Calculator, weight: "regular" },
  firecrawlCrawl: { icon: Fire, weight: "duotone" },
  
  // Agent/AI
  agent: { icon: Robot, weight: "duotone" },
  chat: { icon: ChatCircleDots, weight: "regular" },
};

/**
 * Get icon configuration for a tool
 * Falls back to Package icon with regular weight if tool not found
 */
export function getToolIcon(toolName: string): ToolIconConfig {
  return TOOL_ICON_MAP[toolName] ?? { icon: Package, weight: "regular" };
}

/**
 * Category icon map for agent cards and tool categorization
 */
export const CATEGORY_ICON_MAP: Record<string, ToolIconConfig> = {
  "knowledge": { icon: Brain, weight: "duotone" },
  "search": { icon: MagnifyingGlass, weight: "duotone" },
  "image-generation": { icon: Image, weight: "duotone" },
  "image-editing": { icon: PaintBrush, weight: "duotone" },
  "video-generation": { icon: FilmSlate, weight: "duotone" },
  "analysis": { icon: Eye, weight: "duotone" },
  "utility": { icon: Wrench, weight: "regular" },
  "mcp": { icon: Plug, weight: "regular" },
  "custom-comfyui": { icon: Cpu, weight: "duotone" },
};

/**
 * Get category icon configuration
 * Falls back to Wrench icon with regular weight if category not found
 */
export function getCategoryIcon(category: string): ToolIconConfig {
  return CATEGORY_ICON_MAP[category] ?? { icon: Wrench, weight: "regular" };
}
