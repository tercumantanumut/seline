"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Loader2, User, MessageCircle, PlusCircle, Check, X, ChevronDown, ChevronRight, Search as LucideSearch, Sparkles as LucideSparkles, Crown, UserPlus, GitBranchPlus, Unlink } from "lucide-react";
import { 
  Wrench,
  Database,
  MagnifyingGlass,
  Pencil,
  Trash,
  ChartBar,
  Sparkle,
  Plug as PhosphorPlug
} from "@phosphor-icons/react";
import { getCategoryIcon } from "@/components/ui/tool-icon-map";

// Aliases for consistency
const Search = LucideSearch;
const DatabaseIcon = Database;
const Plug = PhosphorPlug;
const BarChart2 = ChartBar;
const Trash2 = Trash;
const Sparkles = LucideSparkles;
import Link from "next/link";
import { getCharacterInitials } from "@/components/assistant-ui/character-context";
import { AnimatedCard } from "@/components/ui/animated-card";
import { AnimatedButton } from "@/components/ui/animated-button";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToolBadge, getTopTools } from "@/components/ui/tool-badge";
import { animate, stagger } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_EASINGS, ZLUTTY_DURATIONS } from "@/lib/animations/utils";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FolderSyncManager } from "@/components/vector-search/folder-sync-manager";
import { ToolDependencyBadge } from "@/components/ui/tool-dependency-badge";
import { MCPToolsPage } from "@/components/character-creation/terminal-pages/mcp-tools-page";
import { useSessionSync } from "@/lib/hooks/use-session-sync";
import { useSessionSyncStore } from "@/lib/stores/session-sync-store";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import {
  resilientFetch,
  resilientPatch,
  resilientDelete,
  resilientPost,
} from "@/lib/utils/resilient-fetch";

/** Category icons (labels come from translations) */
const CATEGORY_ICONS: Record<string, string> = {
  knowledge: "\u{1F4DA}",
  search: "\u{1F50D}",
  "image-generation": "\u{1F3A8}",
  "image-editing": "\u270F\uFE0F",
  "video-generation": "\u{1F3AC}",
  analysis: "\u{1F52C}",
  utility: "\u{1F6E0}\uFE0F",
  "custom-comfyui": "CUI",
};

/** Available tools that can be enabled/disabled */
type ToolDependency =
  | "syncedFolders"
  | "embeddings"
  | "vectorDbEnabled"
  | "tavilyKey"
  | "webScraper"
  | "openrouterKey"
  | "comfyuiEnabled"
  | "flux2Klein4bEnabled"
  | "flux2Klein9bEnabled"
  | "localGrepEnabled";

type ToolDefinition = {
  id: string;
  category: string;
  dependencies?: ToolDependency[];
  displayName?: string;
  description?: string;
};

const BASE_TOOLS: ToolDefinition[] = [
  { id: "docsSearch", category: "knowledge" },
  { id: "vectorSearch", category: "knowledge", dependencies: ["syncedFolders", "embeddings", "vectorDbEnabled"] },
  { id: "readFile", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "editFile", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "writeFile", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "patchFile", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "localGrep", category: "knowledge", dependencies: ["syncedFolders", "localGrepEnabled"] },
  { id: "webSearch", category: "search", dependencies: ["tavilyKey"] },
  { id: "webBrowse", category: "search", dependencies: ["webScraper"] },
  { id: "webQuery", category: "search", dependencies: ["webScraper"] },
  { id: "firecrawlCrawl", category: "search", dependencies: ["webScraper"] },
  { id: "assembleVideo", category: "video-generation" },
  { id: "describeImage", category: "analysis" },
  { id: "showProductImages", category: "utility" },
  { id: "executeCommand", category: "utility", dependencies: ["syncedFolders"] },
  { id: "scheduleTask", category: "utility" },
  { id: "createSkill", category: "utility" },
  { id: "listSkills", category: "utility" },
  { id: "runSkill", category: "utility" },
  { id: "updateSkill", category: "utility" },
  { id: "copySkill", category: "utility" },
  { id: "memorize", category: "utility" },
  { id: "calculator", category: "utility" },
  { id: "updatePlan", category: "utility" },
  { id: "sendMessageToChannel", category: "utility" },
  { id: "delegateToSubagent", category: "utility" },
  // OpenRouter Image Tools
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
  // Local ComfyUI Image Tools
  { id: "generateImageZImage", category: "image-generation", dependencies: ["comfyuiEnabled"] },
  { id: "generateImageFlux2Klein4B", category: "image-generation", dependencies: ["flux2Klein4bEnabled"] },
  { id: "editImageFlux2Klein4B", category: "image-editing", dependencies: ["flux2Klein4bEnabled"] },
  { id: "referenceImageFlux2Klein4B", category: "image-generation", dependencies: ["flux2Klein4bEnabled"] },
  { id: "generateImageFlux2Klein9B", category: "image-generation", dependencies: ["flux2Klein9bEnabled"] },
  { id: "editImageFlux2Klein9B", category: "image-editing", dependencies: ["flux2Klein9bEnabled"] },
  { id: "referenceImageFlux2Klein9B", category: "image-generation", dependencies: ["flux2Klein9bEnabled"] },
];

interface CharacterSummary {
  id: string;
  name: string;
  displayName?: string | null;
  tagline?: string | null;
  status: string;
  isDefault?: boolean;
  metadata?: {
    enabledTools?: string[];
    enabledPlugins?: string[];
    purpose?: string;
  };
  images?: Array<{
    url: string;
    isPrimary: boolean;
    imageType: string;
  }>;
  // Active session tracking
  hasActiveSession?: boolean;
  activeSessionId?: string | null;
  stats?: {
    skillCount: number;
    runCount: number;
    successRate: number | null;
    lastActive: string | null;
  };
}

interface WorkflowMember {
  agentId: string;
  role: "initiator" | "subagent";
}

interface WorkflowGroup {
  id: string;
  name: string;
  status: string;
  initiatorId: string;
  metadata: {
    sharedResources?: {
      syncFolderIds?: string[];
      pluginIds?: string[];
      mcpServerNames?: string[];
      hookEvents?: string[];
    };
  };
  members: WorkflowMember[];
  agents: CharacterSummary[];
}

function AgentCardInWorkflow({
  character,
  role,
  isLast,
  t,
  hasActiveSession,
  onContinueChat,
  onNewChat,
  onEditIdentity,
  onEditTools,
  onEditFolders,
  onEditMcp,
  onEditPlugins,
  onDelete,
  router,
}: {
  character: CharacterSummary;
  role: "initiator" | "subagent";
  isLast: boolean;
  t: ReturnType<typeof useTranslations>;
  hasActiveSession: (charId: string, initialStatus?: boolean) => boolean;
  onContinueChat: (id: string) => void;
  onNewChat: (id: string) => void;
  onEditIdentity: (c: CharacterSummary) => void;
  onEditTools: (c: CharacterSummary) => void;
  onEditFolders: (c: CharacterSummary) => void;
  onEditMcp: (c: CharacterSummary) => void;
  onEditPlugins: (c: CharacterSummary) => void;
  onDelete: (c: CharacterSummary) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const initials = getCharacterInitials(character.name);
  const enabledTools = character.metadata?.enabledTools || [];
  const topTools = getTopTools(enabledTools, 3);
  const purpose = character.metadata?.purpose;
  const primaryImage = character.images?.find((img) => img.isPrimary);
  const avatarImage = character.images?.find((img) => img.imageType === "avatar");
  const imageUrl = avatarImage?.url || primaryImage?.url;

  return (
    <AnimatedCard
      hoverLift
      className={`bg-terminal-cream ${role === "initiator" ? "border-l-4 border-l-terminal-green" : ""}`}
    >
      <div className="p-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="w-10 h-10 shadow-sm">
              {imageUrl ? <AvatarImage src={imageUrl} alt={character.name} /> : null}
              <AvatarFallback className="bg-terminal-green/10 text-terminal-green font-mono text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            {hasActiveSession(character.id, character.hasActiveSession) && (
              <div className="absolute -top-1 -right-1 z-10">
                <div className="flex items-center justify-center bg-green-500 rounded-full w-4 h-4 shadow-md">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium font-mono text-terminal-dark truncate">
                {character.displayName || character.name}
              </p>
              <Badge
                variant="outline"
                className={`text-[10px] font-mono shrink-0 ${
                  role === "initiator"
                    ? "bg-terminal-green/10 text-terminal-green border-terminal-green/30"
                    : "bg-terminal-muted/10 text-terminal-muted border-terminal-border"
                }`}
              >
                {role === "initiator" ? t("workflows.initiator") : t("workflows.subagent")}
              </Badge>
            </div>
            {character.tagline && (
              <p className="text-xs text-terminal-muted font-mono line-clamp-1">
                {character.tagline}
              </p>
            )}
          </div>
        </div>

        {purpose && (
          <p className="text-[11px] text-terminal-muted/80 font-mono line-clamp-1 mt-1.5 pl-0.5">
            {purpose}
          </p>
        )}

        {topTools.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            {topTools.map((toolId) => (
              <ToolBadge key={toolId} toolId={toolId} size="xs" />
            ))}
            {enabledTools.length > 3 && (
              <span className="text-[10px] font-mono text-terminal-muted">
                +{enabledTools.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Compact action row */}
      <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onEditIdentity(character)}
          className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted hover:text-terminal-green transition-colors"
        >
          <Pencil className="w-2.5 h-2.5" />
          <span>{t("edit")}</span>
        </button>
        <button
          onClick={() => onEditTools(character)}
          className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted hover:text-terminal-green transition-colors"
        >
          <Wrench className="w-2.5 h-2.5" />
          <span>{enabledTools.length > 0 ? `${enabledTools.length}` : t("configureTools")}</span>
        </button>
        <button
          onClick={() => onEditFolders(character)}
          className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted hover:text-terminal-green transition-colors"
        >
          <Database className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={() => onDelete(character)}
          className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted hover:text-red-500 transition-colors ml-auto"
        >
          <Trash className="w-2.5 h-2.5" />
        </button>
      </div>

      <div className="px-4 pb-3 pt-0 flex gap-1.5">
        <AnimatedButton
          size="sm"
          className="flex-1 gap-1.5 bg-terminal-dark hover:bg-terminal-dark/90 text-terminal-cream font-mono text-xs h-7"
          onClick={() => onContinueChat(character.id)}
        >
          <MessageCircle className="w-3 h-3" />
          {t("continue")}
        </AnimatedButton>
        <AnimatedButton
          size="sm"
          variant="outline"
          className="gap-1 text-terminal-dark hover:bg-terminal-dark/5 font-mono text-xs h-7"
          onClick={() => onNewChat(character.id)}
        >
          <PlusCircle className="w-3 h-3" />
        </AnimatedButton>
      </div>
    </AnimatedCard>
  );
}

export function CharacterPicker() {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const hasAnimated = useRef(false);

  // Tool editor state
  const [toolEditorOpen, setToolEditorOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterSummary | null>(null);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [toolSearchQuery, setToolSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>(BASE_TOOLS);

  // Identity editor state
  const [identityEditorOpen, setIdentityEditorOpen] = useState(false);
  const [identityForm, setIdentityForm] = useState({
    name: "",
    displayName: "",
    tagline: "",
    purpose: "",
    systemPromptOverride: "",
  });
  const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<CharacterSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Workflow state
  const [workflowGroups, setWorkflowGroups] = useState<WorkflowGroup[]>([]);
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set());
  const [workflowAgentIds, setWorkflowAgentIds] = useState<Set<string>>(new Set());
  const [workflowDrafts, setWorkflowDrafts] = useState<Record<string, { addAgentId?: string; initiatorId?: string }>>({});
  const [workflowCreatorOpen, setWorkflowCreatorOpen] = useState(false);
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowInitiatorId, setNewWorkflowInitiatorId] = useState("");
  const [newWorkflowSubagentIds, setNewWorkflowSubagentIds] = useState<Set<string>>(new Set());
  const [workflowMutationBusy, setWorkflowMutationBusy] = useState<string | null>(null);

  // Session sync
  useSessionSync({ enablePolling: true, pollingInterval: 10000 });
  const sessionsById = useSessionSyncStore(useShallow(state => state.sessionsById));
  const sessionsByCharacter = useSessionSyncStore(useShallow(state => state.sessionsByCharacter));
  const activeRuns = useSessionSyncStore(useShallow(state => state.activeRuns));

  const hasActiveSession = useCallback((charId: string, initialStatus?: boolean) => {
    // Check store first
    const sessionIds = sessionsByCharacter.get(charId);
    if (sessionIds && sessionIds.size > 0) {
      for (const sid of sessionIds) {
        if (activeRuns.has(sid)) return true;
        const s = sessionsById.get(sid);
        if (s?.hasActiveRun) return true;
      }
      // If we have sessions in store but none active, return false (store is authoritative)
      return false;
    }
    // Fallback to initial status if store doesn't have info yet
    return !!initialStatus;
  }, [sessionsByCharacter, sessionsById, activeRuns]);

  const t = useTranslations("picker");
  const tc = useTranslations("common");
  const tDeps = useTranslations("picker.toolEditor.dependencyWarnings");

  const baseTools = useMemo(() => {
    return BASE_TOOLS.map((tool) => ({
      ...tool,
      displayName: t.has(`tools.${tool.id}.name`) ? t(`tools.${tool.id}.name`) : tool.id,
      description: t.has(`tools.${tool.id}.description`) ? t(`tools.${tool.id}.description`) : "",
    }));
  }, [t]);

  useEffect(() => {
    setAvailableTools(baseTools);
  }, [baseTools]);

  const [dependencyStatus, setDependencyStatus] = useState<{
    syncedFolders: boolean;
    embeddings: boolean;
    vectorDbEnabled: boolean;
    tavilyKey: boolean;
    webScraper: boolean;
    openrouterKey: boolean;
    comfyuiEnabled: boolean;
    flux2Klein4bEnabled: boolean;
    flux2Klein9bEnabled: boolean;
    localGrepEnabled: boolean;
  }>({
    syncedFolders: false,
    embeddings: false,
    vectorDbEnabled: false,
    tavilyKey: false,
    webScraper: false,
    openrouterKey: false,
    comfyuiEnabled: false,
    flux2Klein4bEnabled: false,
    flux2Klein9bEnabled: false,
    localGrepEnabled: true,
  });

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    return availableTools.reduce((acc, tool) => {
      if (!acc[tool.category]) acc[tool.category] = [];
      acc[tool.category].push(tool);
      return acc;
    }, {} as Record<string, ToolDefinition[]>);
  }, [availableTools]);

  // Filter tools based on search query
  const filteredToolsByCategory = useMemo(() => {
    if (!toolSearchQuery.trim()) return toolsByCategory;
    const query = toolSearchQuery.toLowerCase();
    const filtered: Record<string, ToolDefinition[]> = {};
    for (const [category, tools] of Object.entries(toolsByCategory)) {
      const matchingTools = tools.filter((tool) => {
        const name = (tool.displayName || tool.id).toLowerCase();
        const desc = (tool.description || "").toLowerCase();
        return name.includes(query) || desc.includes(query) || tool.id.toLowerCase().includes(query);
      });
      if (matchingTools.length > 0) {
        filtered[category] = matchingTools;
      }
    }
    return filtered;
  }, [toolsByCategory, toolSearchQuery]);

  useEffect(() => {
    if (!toolEditorOpen) return;
    let cancelled = false;

    const loadTools = async () => {
      try {
        const { data, error } = await resilientFetch<{
          tools?: Array<{ id: string; displayName: string; description: string; category: string }>;
        }>("/api/tools?includeDisabled=true&includeAlwaysLoad=true");
        if (error || !data) throw new Error(error || "Failed to load tools");
        if (cancelled) return;

        const merged = new Map<string, ToolDefinition>();
        baseTools.forEach((tool) => merged.set(tool.id, tool));

        (data.tools || []).forEach((tool) => {
          const existing = merged.get(tool.id);
          if (existing) {
            merged.set(tool.id, {
              ...existing,
              category: existing.category || tool.category,
              displayName: existing.displayName && existing.displayName !== existing.id
                ? existing.displayName
                : tool.displayName,
              description: existing.description && existing.description.length > 0
                ? existing.description
                : tool.description,
            });
          } else {
            merged.set(tool.id, {
              id: tool.id,
              category: tool.category,
              displayName: tool.displayName,
              description: tool.description,
            });
          }
        });

        const mergedList = Array.from(merged.values()).sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return (a.displayName || a.id).localeCompare(b.displayName || b.id);
        });
        setAvailableTools(mergedList);
      } catch (error) {
        console.error("Failed to load tools", error);
      }
    };

    loadTools();

    return () => {
      cancelled = true;
    };
  }, [toolEditorOpen, baseTools]);

  // Toggle category collapse
  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const areDependenciesMet = (tool: ToolDefinition): boolean => {
    if (!tool.dependencies || tool.dependencies.length === 0) return true;
    return tool.dependencies.every((dep) => dependencyStatus[dep]);
  };

  const getDependencyWarning = (tool: ToolDefinition): string | null => {
    if (!tool.dependencies || tool.dependencies.length === 0) return null;
    const unmet = tool.dependencies.filter((dep) => !dependencyStatus[dep]);
    if (unmet.length === 0) return null;
    if (unmet.length === 2 && unmet.includes("syncedFolders") && unmet.includes("embeddings")) {
      return tDeps("both");
    }
    return unmet.map((dep) => tDeps(dep)).join(" + ");
  };

  // Select/deselect all tools in a category
  const toggleAllInCategory = (category: string, select: boolean) => {
    const categoryTools = toolsByCategory[category] || [];
    const categoryToolIds = categoryTools.map((t) => t.id);
    const selectableToolIds = categoryTools.filter(areDependenciesMet).map((t) => t.id);
    setSelectedTools((prev) => {
      if (select) {
        return [...new Set([...prev, ...selectableToolIds])];
      } else {
        return prev.filter((id) => !categoryToolIds.includes(id));
      }
    });
  };

  // Get count of selected tools in a category
  const getSelectedCountInCategory = (category: string) => {
    const categoryTools = toolsByCategory[category] || [];
    return categoryTools.filter((t) => selectedTools.includes(t.id)).length;
  };

  // Folder manager state
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [folderManagerCharacter, setFolderManagerCharacter] = useState<CharacterSummary | null>(null);
  const [vectorDBEnabled, setVectorDBEnabled] = useState(false);

  // MCP tools editor state
  const [mcpToolEditorOpen, setMcpToolEditorOpen] = useState(false);
  const [mcpToolPreferences, setMcpToolPreferences] = useState<Record<string, { enabled: boolean; loadingMode: "always" | "deferred" }>>({});
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [mcpTools, setMcpTools] = useState<string[]>([]);

  // Plugin assignment editor state
  const [pluginEditorOpen, setPluginEditorOpen] = useState(false);
  const [agentPlugins, setAgentPlugins] = useState<Array<{
    id: string;
    name: string;
    description: string;
    version: string;
    enabledForAgent: boolean;
  }>>([]);
  const [loadingAgentPlugins, setLoadingAgentPlugins] = useState(false);
  const [savingPluginId, setSavingPluginId] = useState<string | null>(null);

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch settings to check if Vector Search is enabled
  useEffect(() => {
    resilientFetch<{ vectorDBEnabled?: boolean }>("/api/settings").then(({ data }) => {
      if (data) setVectorDBEnabled(data.vectorDBEnabled === true);
    });
  }, []);

  useEffect(() => {
    if (!toolEditorOpen) return;
    let cancelled = false;

    const loadDependencyStatus = async () => {
      let foldersCount = 0;
      if (editingCharacter?.id) {
        const { data } = await resilientFetch<{ folders?: unknown[] }>(
          `/api/vector-sync?characterId=${editingCharacter.id}`
        );
        if (data) foldersCount = data.folders?.length ?? 0;
      }

      try {
        const { data: settingsData, error } = await resilientFetch<Record<string, unknown>>("/api/settings");
        if (!settingsData || error) throw new Error(error || "Failed to load settings");
        const webScraperReady = settingsData.webScraperProvider === "local"
          || (typeof settingsData.firecrawlApiKey === "string" && settingsData.firecrawlApiKey.trim().length > 0);
        const hasEmbeddingModel = typeof settingsData.embeddingModel === "string"
          && settingsData.embeddingModel.trim().length > 0;
        const hasOpenRouterKey = typeof settingsData.openrouterApiKey === "string"
          && settingsData.openrouterApiKey.trim().length > 0;
        const embeddingsReady = hasEmbeddingModel || settingsData.embeddingProvider === "local" || hasOpenRouterKey;

        if (cancelled) return;
        setDependencyStatus({
          syncedFolders: foldersCount > 0,
          embeddings: embeddingsReady,
          vectorDbEnabled: settingsData.vectorDBEnabled === true,
          tavilyKey: typeof settingsData.tavilyApiKey === "string" && settingsData.tavilyApiKey.trim().length > 0,
          webScraper: webScraperReady,
          openrouterKey: typeof settingsData.openrouterApiKey === "string" && settingsData.openrouterApiKey.trim().length > 0,
          comfyuiEnabled: settingsData.comfyuiEnabled === true,
          flux2Klein4bEnabled: settingsData.flux2Klein4bEnabled === true,
          flux2Klein9bEnabled: settingsData.flux2Klein9bEnabled === true,
          localGrepEnabled: settingsData.localGrepEnabled !== false,
        });
      } catch (error) {
        if (cancelled) return;
        setDependencyStatus({
          syncedFolders: foldersCount > 0,
          embeddings: false,
          vectorDbEnabled: false,
          tavilyKey: false,
          webScraper: false,
          openrouterKey: false,
          comfyuiEnabled: false,
          flux2Klein4bEnabled: false,
          flux2Klein9bEnabled: false,
          localGrepEnabled: true,
        });
      }
    };

    loadDependencyStatus();

    return () => {
      cancelled = true;
    };
  }, [toolEditorOpen, editingCharacter]);

  // Filter characters based on search query
  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const query = searchQuery.toLowerCase();
    return characters.filter((char) => {
      const name = (char.displayName || char.name).toLowerCase();
      const tagline = (char.tagline || "").toLowerCase();
      const purpose = (char.metadata?.purpose || "").toLowerCase();
      const tools = (char.metadata?.enabledTools || []).join(" ").toLowerCase();
      return name.includes(query) || tagline.includes(query) || purpose.includes(query) || tools.includes(query);
    });
  }, [characters, searchQuery]);

  // Standalone characters (not in any workflow)
  const allStandaloneCharacters = useMemo(() => {
    return characters.filter((c) => !workflowAgentIds.has(c.id));
  }, [characters, workflowAgentIds]);

  // Standalone characters (filtered)
  const standaloneCharacters = useMemo(() => {
    return filteredCharacters.filter((c) => !workflowAgentIds.has(c.id));
  }, [filteredCharacters, workflowAgentIds]);

  // Filtered workflow groups (matching search)
  const filteredWorkflowGroups = useMemo(() => {
    if (!searchQuery.trim()) return workflowGroups;
    const query = searchQuery.toLowerCase();
    return workflowGroups.filter((wf) => {
      if (wf.name.toLowerCase().includes(query)) return true;
      return wf.agents.some((agent) => {
        const name = (agent.displayName || agent.name).toLowerCase();
        const tagline = (agent.tagline || "").toLowerCase();
        const purpose = (agent.metadata?.purpose || "").toLowerCase();
        return name.includes(query) || tagline.includes(query) || purpose.includes(query);
      });
    });
  }, [workflowGroups, searchQuery]);

  const toggleWorkflow = useCallback((workflowId: string) => {
    setExpandedWorkflows((prev) => {
      const next = new Set(prev);
      if (next.has(workflowId)) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });
  }, []);

  // Open folder manager for a character
  const openFolderManager = (character: CharacterSummary) => {
    setFolderManagerCharacter(character);
    setFolderManagerOpen(true);
  };

  const loadCharacters = useCallback(async () => {
    try {
      const { data } = await resilientFetch<{ characters: CharacterSummary[] }>("/api/characters");
      if (!data) {
        setIsLoading(false);
        return;
      }

      // Filter to only show active characters
      const activeChars = (data.characters || []).filter(
        (c: CharacterSummary) => c.status === "active"
      );

      // Batch active-status check (single request instead of N)
      if (activeChars.length > 0) {
        const ids = activeChars.map((c: CharacterSummary) => c.id).join(",");
        const { data: statusData } = await resilientFetch<{
          statuses: Record<string, { hasActiveSession: boolean; activeSessionId: string | null }>;
        }>(`/api/characters/active-status?ids=${ids}`);

        const enrichedWithStatus = statusData?.statuses
          ? activeChars.map((char: CharacterSummary) => ({
            ...char,
            hasActiveSession: statusData.statuses[char.id]?.hasActiveSession ?? false,
            activeSessionId: statusData.statuses[char.id]?.activeSessionId ?? null,
          }))
          : activeChars;

        const statsEntries = await Promise.all(
          enrichedWithStatus.map(async (char) => {
            try {
              const { data } = await resilientFetch<{ stats?: { skillCount: number; runCount: number; successRate: number | null; lastActive: string | null } }>(`/api/characters/${char.id}/stats`);
              return [char.id, data?.stats || null] as const;
            } catch {
              return [char.id, null] as const;
            }
          })
        );
        const statsById = new Map(statsEntries);
        setCharacters(
          enrichedWithStatus.map((char) => ({
            ...char,
            stats: statsById.get(char.id) || undefined,
          }))
        );
      } else {
        setCharacters(activeChars);
      }
      // Fetch workflow groups and partition agents
      try {
        const { data: wfData } = await resilientFetch<{
          workflows: Array<{
            id: string;
            name: string;
            initiatorId: string;
            status: string;
            metadata: WorkflowGroup["metadata"];
            members: WorkflowMember[];
          }>;
        }>("/api/workflows?status=all");

        if (wfData?.workflows && wfData.workflows.length > 0) {
          const charById = new Map(activeChars.map((c: CharacterSummary) => [c.id, c]));
          const memberAgentIds = new Set<string>();
          const groups: WorkflowGroup[] = [];

          for (const wf of wfData.workflows) {
            const agents: CharacterSummary[] = [];
            for (const m of wf.members) {
              const agent = charById.get(m.agentId);
              if (agent) {
                agents.push(agent);
                memberAgentIds.add(m.agentId);
              }
            }
            if (agents.length > 0) {
              groups.push({
                id: wf.id,
                name: wf.name,
                status: wf.status,
                initiatorId: wf.initiatorId,
                metadata: typeof wf.metadata === "string" ? JSON.parse(wf.metadata) : (wf.metadata || {}),
                members: wf.members,
                agents,
              });
            }
          }

          setWorkflowGroups(groups);
          setWorkflowAgentIds(memberAgentIds);

          // Auto-expand if there's only one workflow (better first-time UX)
          if (groups.length === 1) {
            setExpandedWorkflows(new Set([groups[0].id]));
          }
        } else {
          setWorkflowGroups([]);
          setWorkflowAgentIds(new Set());
        }
      } catch (wfError) {
        console.warn("Failed to load workflows (non-fatal):", wfError);
        setWorkflowGroups([]);
        setWorkflowAgentIds(new Set());
      }
    } catch (error) {
      console.error("Failed to load characters:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    setWorkflowDrafts((prev) => {
      const next: Record<string, { addAgentId?: string; initiatorId?: string }> = {};
      for (const workflow of workflowGroups) {
        const existing = prev[workflow.id] || {};
        next[workflow.id] = {
          addAgentId: existing.addAgentId,
          initiatorId: existing.initiatorId || workflow.initiatorId,
        };
      }
      return next;
    });
  }, [workflowGroups]);

  useEffect(() => {
    if (!workflowCreatorOpen) return;
    if (allStandaloneCharacters.length > 0 && !newWorkflowInitiatorId) {
      setNewWorkflowInitiatorId(allStandaloneCharacters[0].id);
    }
  }, [workflowCreatorOpen, allStandaloneCharacters, newWorkflowInitiatorId]);

  const updateWorkflowDraft = useCallback(
    (workflowId: string, patch: Partial<{ addAgentId: string; initiatorId: string }>) => {
      setWorkflowDrafts((prev) => ({
        ...prev,
        [workflowId]: {
          ...(prev[workflowId] || {}),
          ...patch,
        },
      }));
    },
    []
  );

  const mutateWorkflow = useCallback(
    async (workflowId: string, payload: Record<string, unknown>) => {
      setWorkflowMutationBusy(workflowId);
      try {
        const { error } = await resilientPatch(`/api/workflows/${workflowId}`, payload);
        if (error) throw new Error(error);
        await loadCharacters();
        toast.success(t("workflows.updated"));
      } catch (error) {
        console.error("Workflow mutation failed:", error);
        toast.error(error instanceof Error ? error.message : t("workflows.updateFailed"));
      } finally {
        setWorkflowMutationBusy(null);
      }
    },
    [loadCharacters, t]
  );

  const addSubagentToWorkflow = useCallback(
    async (workflowId: string, agentId: string) => {
      if (!agentId) return;
      await mutateWorkflow(workflowId, {
        action: "addSubagent",
        agentId,
      });
      updateWorkflowDraft(workflowId, { addAgentId: "" });
    },
    [mutateWorkflow, updateWorkflowDraft]
  );

  const setWorkflowMainAgent = useCallback(
    async (workflowId: string, initiatorId: string) => {
      if (!initiatorId) return;
      await mutateWorkflow(workflowId, {
        action: "setInitiator",
        initiatorId,
      });
    },
    [mutateWorkflow]
  );

  const removeSubagentFromWorkflow = useCallback(
    async (workflowId: string, agentId: string) => {
      if (!confirm("Remove this sub-agent from the workflow?")) return;
      await mutateWorkflow(workflowId, {
        action: "removeMember",
        agentId,
      });
    },
    [mutateWorkflow]
  );

  const deleteWorkflowGroup = useCallback(
    async (workflowId: string) => {
      if (!confirm("Delete this workflow group? Members will stay as standalone agents.")) return;
      setWorkflowMutationBusy(workflowId);
      try {
        const { error } = await resilientDelete(`/api/workflows/${workflowId}`);
        if (error) throw new Error(error);
        await loadCharacters();
        toast.success(t("workflows.deleted"));
      } catch (error) {
        console.error("Workflow deletion failed:", error);
        toast.error(error instanceof Error ? error.message : t("workflows.updateFailed"));
      } finally {
        setWorkflowMutationBusy(null);
      }
    },
    [loadCharacters, t]
  );

  const createWorkflowGroup = useCallback(async () => {
    if (!newWorkflowInitiatorId) return;

    setCreatingWorkflow(true);
    try {
      const { error } = await resilientPost("/api/workflows", {
        name: newWorkflowName.trim() || undefined,
        initiatorId: newWorkflowInitiatorId,
        subAgentIds: Array.from(newWorkflowSubagentIds).filter((id) => id !== newWorkflowInitiatorId),
      });
      if (error) throw new Error(error);

      setWorkflowCreatorOpen(false);
      setNewWorkflowName("");
      setNewWorkflowSubagentIds(new Set());
      await loadCharacters();
      toast.success(t("workflows.created"));
    } catch (error) {
      console.error("Create workflow failed:", error);
      toast.error(error instanceof Error ? error.message : t("workflows.updateFailed"));
    } finally {
      setCreatingWorkflow(false);
    }
  }, [loadCharacters, newWorkflowInitiatorId, newWorkflowName, newWorkflowSubagentIds, t]);

  // Open tool editor for a character
  const openToolEditor = (character: CharacterSummary) => {
    setEditingCharacter(character);
    setSelectedTools(character.metadata?.enabledTools || []);
    setToolSearchQuery("");
    setCollapsedCategories(new Set());
    setToolEditorOpen(true);
  };

  // Toggle a tool selection
  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  // Save tool selections
  const saveTools = async () => {
    if (!editingCharacter) return;
    setIsSaving(true);
    try {
      const { error } = await resilientPatch(`/api/characters/${editingCharacter.id}`, {
        metadata: { enabledTools: selectedTools },
      });
      if (!error) {
        setToolEditorOpen(false);
        loadCharacters(); // Refresh the list
      }
    } catch (error) {
      console.error("Failed to save tools:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Open identity editor for a character
  const openIdentityEditor = async (character: CharacterSummary) => {
    setEditingCharacter(character);
    const metadata = character.metadata as any;
    const hasCustomPrompt = metadata?.systemPromptOverride && typeof metadata.systemPromptOverride === "string" && metadata.systemPromptOverride.trim();
    setIdentityForm({
      name: character.name,
      displayName: character.displayName || "",
      tagline: character.tagline || "",
      purpose: character.metadata?.purpose || "",
      systemPromptOverride: metadata?.systemPromptOverride || "",
    });
    setShowAdvancedPrompt(!!hasCustomPrompt);

    // Fetch the current generated prompt
    const { data: promptData } = await resilientFetch<{ prompt?: string }>(
      `/api/characters/${character.id}/prompt-preview`
    );
    setGeneratedPrompt(promptData?.prompt || "");

    setIdentityEditorOpen(true);
  };

  // Save identity changes
  const saveIdentity = async () => {
    if (!editingCharacter) return;
    setIsSaving(true);
    try {
      const { error } = await resilientPatch(`/api/characters/${editingCharacter.id}`, {
        character: {
          name: identityForm.name,
          displayName: identityForm.displayName || undefined,
          tagline: identityForm.tagline || undefined,
        },
        metadata: {
          purpose: identityForm.purpose || undefined,
          systemPromptOverride: identityForm.systemPromptOverride || undefined,
        },
      });
      if (!error) {
        setIdentityEditorOpen(false);
        loadCharacters(); // Refresh the list
      }
    } catch (error) {
      console.error("Failed to save identity:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (character: CharacterSummary) => {
    setCharacterToDelete(character);
    setDeleteDialogOpen(true);
  };

  // Delete character
  const deleteCharacter = async () => {
    if (!characterToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await resilientDelete(`/api/characters/${characterToDelete.id}`);
      if (!error) {
        setDeleteDialogOpen(false);
        setCharacterToDelete(null);
        loadCharacters(); // Refresh the list
      }
    } catch (error) {
      console.error("Failed to delete character:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Open MCP tool editor for a character
  const openMcpToolEditor = async (character: CharacterSummary) => {
    setEditingCharacter(character);

    // Load existing MCP preferences from character metadata
    const metadata = character.metadata as any;
    setMcpServers(metadata?.enabledMcpServers || []);
    setMcpTools(metadata?.enabledMcpTools || []);
    setMcpToolPreferences(metadata?.mcpToolPreferences || {});
    setMcpToolEditorOpen(true);
  };

  const openPluginEditor = async (character: CharacterSummary) => {
    setEditingCharacter(character);
    setPluginEditorOpen(true);
    setLoadingAgentPlugins(true);

    try {
      const { data, error } = await resilientFetch<{
        plugins?: Array<{
          id: string;
          name: string;
          description: string;
          version: string;
          enabledForAgent: boolean;
        }>;
      }>(`/api/characters/${character.id}/plugins`);

      if (error || !data) throw new Error(error || "Failed to load plugins");
      setAgentPlugins(
        (data.plugins || []).sort((a, b) => {
          const aEnabled = a.enabledForAgent ? 1 : 0;
          const bEnabled = b.enabledForAgent ? 1 : 0;
          if (aEnabled !== bEnabled) return bEnabled - aEnabled;
          return a.name.localeCompare(b.name);
        })
      );
    } catch (error) {
      console.error("Failed to load agent plugins:", error);
      setAgentPlugins([]);
    } finally {
      setLoadingAgentPlugins(false);
    }
  };

  const toggleAgentPlugin = async (pluginId: string, enabled: boolean) => {
    if (!editingCharacter) return;

    setSavingPluginId(pluginId);
    try {
      const { error } = await resilientPost(`/api/characters/${editingCharacter.id}/plugins`, {
        pluginId,
        enabled,
      });
      if (error) throw new Error(error);

      let nextPlugins = agentPlugins;
      setAgentPlugins((prev) => {
        nextPlugins = prev.map((plugin) =>
          plugin.id === pluginId ? { ...plugin, enabledForAgent: enabled } : plugin
        );
        return nextPlugins;
      });

      const enabledPlugins = nextPlugins
        .filter((plugin) => plugin.enabledForAgent)
        .map((plugin) => plugin.id);

      await resilientPatch(`/api/characters/${editingCharacter.id}`, {
        metadata: { enabledPlugins },
      });
    } catch (error) {
      console.error("Failed to update agent plugin:", error);
    } finally {
      setSavingPluginId(null);
    }
  };

  // Determine which MCP tools are being removed compared to the saved state
  const getMcpToolsBeingRemoved = useCallback((): string[] => {
    if (!editingCharacter) return [];
    const existingMetadata = editingCharacter.metadata as any;
    const previousTools: string[] = existingMetadata?.enabledMcpTools || [];
    return previousTools.filter((t: string) => !mcpTools.includes(t));
  }, [editingCharacter, mcpTools]);

  // Active-session-aware MCP tool confirmation state
  const [mcpRemovalWarningOpen, setMcpRemovalWarningOpen] = useState(false);
  const [mcpToolsBeingRemoved, setMcpToolsBeingRemoved] = useState<string[]>([]);

  // Save MCP tool selections (with active-session guard)
  const saveMcpTools = async () => {
    if (!editingCharacter) return;

    // Check if tools are being removed while the agent has active sessions
    const removedTools = getMcpToolsBeingRemoved();
    if (removedTools.length > 0 && hasActiveSession(editingCharacter.id, editingCharacter.hasActiveSession)) {
      // Show confirmation dialog instead of saving immediately
      setMcpToolsBeingRemoved(removedTools);
      setMcpRemovalWarningOpen(true);
      return;
    }

    await performMcpToolSave();
  };

  // Actual save logic (called directly or after user confirms removal warning)
  const performMcpToolSave = async () => {
    if (!editingCharacter) return;
    setIsSaving(true);
    try {
      const { error } = await resilientPatch(`/api/characters/${editingCharacter.id}`, {
        metadata: {
          enabledMcpServers: mcpServers,
          enabledMcpTools: mcpTools,
          mcpToolPreferences: mcpToolPreferences,
        },
      });
      if (!error) {
        setMcpToolEditorOpen(false);
        setMcpRemovalWarningOpen(false);
        loadCharacters();
      }
    } catch (error) {
      console.error("Failed to save MCP tools:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Stagger animation for grid items
  useEffect(() => {
    if (!gridRef.current || isLoading || prefersReducedMotion || hasAnimated.current) return;

    const cards = gridRef.current.querySelectorAll("[data-animate-card]");
    if (cards.length === 0) return;

    hasAnimated.current = true;

    // Set initial state
    cards.forEach((card) => {
      (card as HTMLElement).style.opacity = "0";
      (card as HTMLElement).style.transform = "translateY(20px) scale(0.95)";
    });

    // Animate in with stagger
    animate(cards, {
      opacity: [0, 1],
      translateY: [20, 0],
      scale: [0.95, 1],
      duration: ZLUTTY_DURATIONS.normal,
      ease: ZLUTTY_EASINGS.reveal,
      delay: stagger(80, { start: 100 }),
    });
  }, [isLoading, prefersReducedMotion]);

  // Continue last session
  const handleContinueChat = (characterId: string) => {
    router.push(`/chat/${characterId}`);
  };

  // Start a new session
  const handleNewChat = (characterId: string) => {
    router.push(`/chat/${characterId}?new=true`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 bg-terminal-cream min-h-full">
        <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto bg-terminal-cream min-h-full">
      <AnimatedContainer direction="down" distance={15} className="text-center">
        <h1 className="text-2xl font-bold font-mono text-terminal-dark">{t("title")}</h1>
        <p className="text-terminal-muted mt-2 font-mono text-sm">
          {t("subtitle")}
        </p>
      </AnimatedContainer>

      {/* Search Input - shown when there are agents */}
      {characters.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-terminal-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-10 pr-10 py-2 bg-terminal-cream border border-terminal-border rounded-lg font-mono text-sm text-terminal-dark placeholder:text-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-green/50 focus:border-terminal-green"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-terminal-muted hover:text-terminal-dark transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {allStandaloneCharacters.length > 0 && (
        <div className="flex justify-end">
          <AnimatedButton
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={() => setWorkflowCreatorOpen(true)}
          >
            <GitBranchPlus className="mr-1.5 h-3.5 w-3.5" />
            {t("workflows.create")}
          </AnimatedButton>
        </div>
      )}

      {/* Workflow Groups */}
      {filteredWorkflowGroups.length > 0 && (
        <div className="space-y-4 mb-6">
          <h3 className="font-mono text-sm font-medium text-terminal-muted uppercase tracking-wider">
            {t("workflows.sectionTitle")}
          </h3>
          {filteredWorkflowGroups.map((wf) => {
            const isExpanded = expandedWorkflows.has(wf.id);
            const initiator = wf.agents.find((a) => a.id === wf.initiatorId);
            const subAgents = wf.agents.filter((a) => a.id !== wf.initiatorId);
            const sharedResources = wf.metadata?.sharedResources;
            const statusColor =
              wf.status === "active"
                ? "bg-green-100 text-green-700 border-green-200"
                : wf.status === "paused"
                ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                : "bg-gray-100 text-gray-500 border-gray-200";

            return (
              <Card key={wf.id} className="transition-all bg-terminal-cream border-terminal-border">
                <CardHeader className="pb-3">
                  <button
                    onClick={() => toggleWorkflow(wf.id)}
                    className="flex items-center gap-3 text-left w-full"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-terminal-muted shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-terminal-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="font-mono text-base truncate">
                        {wf.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-[10px] font-mono ${statusColor}`}>
                          {wf.status === "active"
                            ? t("workflows.statusActive")
                            : wf.status === "paused"
                            ? t("workflows.statusPaused")
                            : t("workflows.statusArchived")}
                        </Badge>
                        <span className="text-xs font-mono text-terminal-muted">
                          {t("workflows.agentCount", { count: wf.agents.length })}
                        </span>
                        {sharedResources?.syncFolderIds && sharedResources.syncFolderIds.length > 0 && (
                          <span className="text-[10px] font-mono text-terminal-muted">
                            {t("workflows.sharedFolders", { count: sharedResources.syncFolderIds.length })}
                          </span>
                        )}
                        {sharedResources?.pluginIds && sharedResources.pluginIds.length > 0 && (
                          <span className="text-[10px] font-mono text-terminal-muted">
                            {t("workflows.sharedPlugins", { count: sharedResources.pluginIds.length })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <AnimatedButton
                        size="sm"
                        variant="outline"
                        className="text-xs font-mono h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (initiator) handleContinueChat(initiator.id);
                        }}
                      >
                        {t("workflows.run")}
                      </AnimatedButton>
                      <AnimatedButton
                        size="sm"
                        variant="outline"
                        className="text-xs font-mono h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (initiator) openFolderManager(initiator);
                        }}
                      >
                        {t("workflows.shareFolder")}
                      </AnimatedButton>
                    </div>
                  </button>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="border-t border-terminal-border/20 pt-4 space-y-3">
                      <div className="rounded border border-terminal-border/40 bg-terminal-bg/10 p-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <select
                              value={workflowDrafts[wf.id]?.addAgentId || ""}
                              onChange={(event) =>
                                updateWorkflowDraft(wf.id, { addAgentId: event.target.value })
                              }
                              className="h-8 flex-1 rounded border border-terminal-border bg-white px-2 font-mono text-xs text-terminal-dark focus:border-terminal-green focus:outline-none"
                              disabled={workflowMutationBusy === wf.id}
                            >
                              <option value="">{t("workflows.addSubagentPlaceholder")}</option>
                              {allStandaloneCharacters.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                  {agent.displayName || agent.name}
                                </option>
                              ))}
                            </select>
                            <AnimatedButton
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 font-mono text-xs"
                              disabled={
                                workflowMutationBusy === wf.id ||
                                !workflowDrafts[wf.id]?.addAgentId
                              }
                              onClick={() =>
                                addSubagentToWorkflow(
                                  wf.id,
                                  workflowDrafts[wf.id]?.addAgentId || ""
                                )
                              }
                            >
                              <UserPlus className="mr-1 h-3.5 w-3.5" />
                              {t("workflows.addSubagent")}
                            </AnimatedButton>
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={workflowDrafts[wf.id]?.initiatorId || wf.initiatorId}
                              onChange={(event) =>
                                updateWorkflowDraft(wf.id, { initiatorId: event.target.value })
                              }
                              className="h-8 flex-1 rounded border border-terminal-border bg-white px-2 font-mono text-xs text-terminal-dark focus:border-terminal-green focus:outline-none"
                              disabled={workflowMutationBusy === wf.id}
                            >
                              {wf.agents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                  {agent.displayName || agent.name}
                                </option>
                              ))}
                            </select>
                            <AnimatedButton
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 font-mono text-xs"
                              disabled={workflowMutationBusy === wf.id}
                              onClick={() =>
                                setWorkflowMainAgent(
                                  wf.id,
                                  workflowDrafts[wf.id]?.initiatorId || wf.initiatorId
                                )
                              }
                            >
                              <Crown className="mr-1 h-3.5 w-3.5" />
                              {t("workflows.makeMain")}
                            </AnimatedButton>
                          </div>
                        </div>

                        <div className="mt-2 flex justify-end">
                          <AnimatedButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 font-mono text-xs text-red-600 border-red-200 hover:bg-red-50"
                            disabled={workflowMutationBusy === wf.id}
                            onClick={() => deleteWorkflowGroup(wf.id)}
                          >
                            <Unlink className="mr-1 h-3.5 w-3.5" />
                            {t("workflows.deleteWorkflow")}
                          </AnimatedButton>
                        </div>
                      </div>

                      {/* Initiator agent card */}
                      {initiator && (
                        <AgentCardInWorkflow
                          character={initiator}
                          role="initiator"
                          isLast={subAgents.length === 0}
                          t={t}
                          hasActiveSession={hasActiveSession}
                          onContinueChat={handleContinueChat}
                          onNewChat={handleNewChat}
                          onEditIdentity={openIdentityEditor}
                          onEditTools={openToolEditor}
                          onEditFolders={openFolderManager}
                          onEditMcp={openMcpToolEditor}
                          onEditPlugins={openPluginEditor}
                          onDelete={openDeleteDialog}
                          router={router}
                        />
                      )}

                      {/* Sub-agents with connecting line */}
                      {subAgents.length === 0 && (
                        <p className="text-xs font-mono text-terminal-muted/60 ml-6 py-2">
                          {t("workflows.noSubagents")}
                        </p>
                      )}
                      {subAgents.length > 0 && (
                        <div className="relative ml-6">
                          {/* Vertical connecting line */}
                          <div className="absolute left-0 top-0 bottom-4 w-px border-l-2 border-terminal-green/30" />

                          <div className="space-y-3">
                            {subAgents.map((agent, idx) => (
                              <div key={agent.id} className="relative pl-6">
                                {/* Horizontal branch line */}
                                <div className="absolute left-0 top-6 w-5 h-px border-t-2 border-terminal-green/30" />
                                {/* Dot at junction */}
                                <div className="absolute left-[-3px] top-[21px] w-[8px] h-[8px] rounded-full bg-terminal-green/40" />

                                <AgentCardInWorkflow
                                  character={agent}
                                  role="subagent"
                                  isLast={idx === subAgents.length - 1}
                                  t={t}
                                  hasActiveSession={hasActiveSession}
                                  onContinueChat={handleContinueChat}
                                  onNewChat={handleNewChat}
                                  onEditIdentity={openIdentityEditor}
                                  onEditTools={openToolEditor}
                                  onEditFolders={openFolderManager}
                                  onEditMcp={openMcpToolEditor}
                                  onEditPlugins={openPluginEditor}
                                  onDelete={openDeleteDialog}
                                  router={router}
                                />

                                <div className="mt-1 flex justify-end">
                                  <button
                                    onClick={() => removeSubagentFromWorkflow(wf.id, agent.id)}
                                    className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-[10px] font-mono text-red-600 hover:bg-red-50 transition-colors"
                                    disabled={workflowMutationBusy === wf.id}
                                  >
                                    <Unlink className="h-3 w-3" />
                                    {t("workflows.removeSubagent")}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div ref={gridRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Create New Agent Card */}
        <AnimatedCard
          data-animate-card
          hoverLift
          className="bg-terminal-cream/50 hover:bg-terminal-cream cursor-pointer"
        >
          <Link href="/create-character" className="block h-full">
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-6">
              <div className="w-16 h-16 rounded-full bg-terminal-green/10 flex items-center justify-center shadow-sm">
                <Plus className="w-8 h-8 text-terminal-green" />
              </div>
              <div className="text-center">
                <p className="font-medium font-mono text-terminal-dark">{t("create")}</p>
                <p className="text-sm text-terminal-muted font-mono">{t("createDescription")}</p>
              </div>
            </div>
          </Link>
        </AnimatedCard>

        {/* Character Cards */}
        {standaloneCharacters.map((character) => {
          const primaryImage = character.images?.find(img => img.isPrimary);
          const avatarImage = character.images?.find(img => img.imageType === "avatar");
          const imageUrl = avatarImage?.url || primaryImage?.url;
          const initials = getCharacterInitials(character.name);
          const enabledTools = character.metadata?.enabledTools || [];
          const topTools = getTopTools(enabledTools, 3);
          const purpose = character.metadata?.purpose;
          const stats = character.stats;

          return (
            <AnimatedCard
              key={character.id}
              data-animate-card
              hoverLift
              className="bg-terminal-cream"
            >
              <div className="p-4 pb-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="w-12 h-12 shadow-sm">
                      {imageUrl ? (
                        <AvatarImage src={imageUrl} alt={character.name} />
                      ) : null}
                      <AvatarFallback className="bg-terminal-green/10 text-terminal-green font-mono">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {/* Active session indicator */}
                    {hasActiveSession(character.id, character.hasActiveSession) && (
                      <div
                        className="absolute -top-1 -right-1 z-10"
                        title={t("activeSession.tooltip")}
                      >
                        <div className="flex items-center justify-center bg-green-500 rounded-full w-5 h-5 shadow-md">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium font-mono text-terminal-dark truncate">
                      {character.displayName || character.name}
                    </p>
                    {character.tagline && (
                      <p className="text-sm text-terminal-muted font-mono line-clamp-1">
                        {character.tagline}
                      </p>
                    )}
                  </div>
                </div>

                {/* Purpose snippet */}
                {purpose && (
                  <p className="text-xs text-terminal-muted/80 font-mono line-clamp-2 mt-2 pl-0.5">
                    {purpose}
                  </p>
                )}

                {/* Tool badges */}
                {topTools.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {topTools.map((toolId) => (
                      <ToolBadge key={toolId} toolId={toolId} size="xs" />
                    ))}
                    {enabledTools.length > 3 && (
                      <span className="text-xs font-mono text-terminal-muted">
                        +{enabledTools.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {stats ? (
                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono text-terminal-muted">
                    <span>{stats.skillCount} skills</span>
                    <span>{stats.runCount} runs</span>
                    <span>{stats.successRate == null ? "N/A" : `${stats.successRate}%`} success</span>
                    <span>{stats.lastActive ? new Date(stats.lastActive).toLocaleDateString() : "No activity"}</span>
                  </div>
                ) : null}
              </div>

              {/* Enabled Tools Indicator - Clickable to edit */}
              <div className="px-4 pb-2 flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => openIdentityEditor(character)}
                  className="flex items-center gap-1.5 text-xs font-mono text-terminal-muted hover:text-terminal-green transition-colors cursor-pointer"
                  title={t("editIdentity")}
                >
                  <User className="w-3 h-3" />
                  <span>{t("edit")}</span>
                </button>
                <button
                  onClick={() => openToolEditor(character)}
                  className="flex items-center gap-1.5 text-xs font-mono text-terminal-muted hover:text-terminal-green transition-colors cursor-pointer"
                >
                  <Wrench className="w-3 h-3" />
                  <span>
                    {enabledTools.length > 0
                      ? t("toolsEnabled", { count: enabledTools.length })
                      : t("configureTools")}
                  </span>
                </button>
                <button
                  onClick={() => openFolderManager(character)}
                  className="flex items-center gap-1.5 text-xs font-mono text-terminal-muted hover:text-terminal-green transition-colors cursor-pointer"
                  title={t("vectorTitle")}
                >
                  <DatabaseIcon className="w-3 h-3" />
                  <span>{t("folders")}</span>
                </button>
                <button
                  onClick={() => openMcpToolEditor(character)}
                  className="flex items-center gap-1.5 text-xs font-mono text-terminal-muted hover:text-purple-500 transition-colors cursor-pointer"
                  title={t("mcpToolsTitle")}
                >
                  <Plug className="w-3 h-3" />
                  <span>{t("mcpTools")}</span>
                </button>
                <button
                  onClick={() => openPluginEditor(character)}
                  className="flex items-center gap-1.5 text-xs font-mono text-terminal-muted hover:text-terminal-green transition-colors cursor-pointer"
                  title={t("plugins.title")}
                >
                  <Plug className="w-3 h-3" />
                  <span>
                    {character.metadata?.enabledPlugins?.length
                      ? t("plugins.enabledCount", { count: character.metadata.enabledPlugins.length })
                      : t("plugins.configure")}
                  </span>
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex items-center gap-1.5 text-xs font-mono text-terminal-muted hover:text-terminal-green transition-colors cursor-pointer"
                  title="Dashboard"
                >
                  <BarChart2 className="w-3 h-3" />
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => openDeleteDialog(character)}
                  className="flex items-center gap-1.5 text-xs font-mono text-terminal-muted hover:text-red-500 transition-colors cursor-pointer ml-auto"
                  title={t("deleteAgent")}
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{t("delete")}</span>
                </button>
              </div>

              <div className="px-4 pb-4 pt-0 flex gap-2">
                <AnimatedButton
                  className="flex-1 gap-2 bg-terminal-dark hover:bg-terminal-dark/90 text-terminal-cream font-mono"
                  onClick={() => handleContinueChat(character.id)}
                >
                  <MessageCircle className="w-4 h-4" />
                  {t("continue")}
                </AnimatedButton>
                <AnimatedButton
                  variant="outline"
                  className="gap-1.5 text-terminal-dark hover:bg-terminal-dark/5 font-mono"
                  onClick={() => handleNewChat(character.id)}
                  title={t("startNew")}
                >
                  <PlusCircle className="w-4 h-4" />
                </AnimatedButton>
              </div>
            </AnimatedCard>
          );
        })}
      </div>

      {/* No search results */}
      {characters.length > 0 && standaloneCharacters.length === 0 && filteredWorkflowGroups.length === 0 && searchQuery && (
        <AnimatedContainer delay={100} className="text-center py-8">
          <Search className="w-12 h-12 mx-auto mb-4 text-terminal-muted opacity-50" />
          <p className="font-mono text-terminal-muted">{t("noResults")}</p>
          <button
            onClick={() => setSearchQuery("")}
            className="mt-2 text-sm font-mono text-terminal-green hover:underline"
          >
            {t("clearSearch")}
          </button>
        </AnimatedContainer>
      )}

      {/* Empty state - no agents created yet */}
      {characters.length === 0 && (
        <AnimatedContainer delay={200} className="text-center py-12">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-terminal-green/10 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-terminal-green" />
          </div>
          <h2 className="font-mono text-lg font-medium text-terminal-dark mb-2">
            {t("emptyTitle")}
          </h2>
          <p className="font-mono text-terminal-muted max-w-md mx-auto mb-6">
            {t("emptyDescription")}
          </p>
          <Link href="/create-character">
            <AnimatedButton className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono">
              <Plus className="w-4 h-4" />
              {t("create")}
            </AnimatedButton>
          </Link>
        </AnimatedContainer>
      )}

      {/* Workflow Creator Dialog */}
      <Dialog open={workflowCreatorOpen} onOpenChange={setWorkflowCreatorOpen}>
        <DialogContent className="sm:max-w-xl bg-terminal-cream">
          <DialogHeader>
            <DialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
              <GitBranchPlus className="h-5 w-5 text-terminal-green" />
              {t("workflows.create")}
            </DialogTitle>
            <DialogDescription className="font-mono text-terminal-muted">
              {t("workflows.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="font-mono text-xs text-terminal-muted uppercase tracking-wider">
                {t("workflows.nameLabel")}
              </Label>
              <input
                type="text"
                value={newWorkflowName}
                onChange={(event) => setNewWorkflowName(event.target.value)}
                placeholder={t("workflows.namePlaceholder")}
                className="mt-1 w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none"
              />
            </div>

            <div>
              <Label className="font-mono text-xs text-terminal-muted uppercase tracking-wider">
                {t("workflows.mainAgentLabel")}
              </Label>
              <select
                value={newWorkflowInitiatorId}
                onChange={(event) => setNewWorkflowInitiatorId(event.target.value)}
                className="mt-1 w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none"
              >
                <option value="">{t("workflows.selectMainAgent")}</option>
                {allStandaloneCharacters.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.displayName || agent.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="font-mono text-xs text-terminal-muted uppercase tracking-wider">
                {t("workflows.subagentsLabel")}
              </Label>
              <div className="mt-1 max-h-48 overflow-y-auto rounded border border-terminal-border/50 bg-terminal-bg/10 p-2 space-y-1">
                {allStandaloneCharacters
                  .filter((agent) => agent.id !== newWorkflowInitiatorId)
                  .map((agent) => {
                    const checked = newWorkflowSubagentIds.has(agent.id);
                    return (
                      <label
                        key={agent.id}
                        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-terminal-bg/30 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            setNewWorkflowSubagentIds((prev) => {
                              const next = new Set(prev);
                              if (value) next.add(agent.id);
                              else next.delete(agent.id);
                              return next;
                            });
                          }}
                        />
                        <span className="font-mono text-xs text-terminal-dark">
                          {agent.displayName || agent.name}
                        </span>
                      </label>
                    );
                  })}
                {allStandaloneCharacters.filter((agent) => agent.id !== newWorkflowInitiatorId).length === 0 && (
                  <p className="font-mono text-xs text-terminal-muted px-2 py-1">
                    {t("workflows.noSubagentOptions")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <AnimatedButton
              variant="outline"
              className="font-mono"
              onClick={() => setWorkflowCreatorOpen(false)}
              disabled={creatingWorkflow}
            >
              {tc("cancel")}
            </AnimatedButton>
            <AnimatedButton
              className="font-mono bg-terminal-green text-white hover:bg-terminal-green/90"
              onClick={createWorkflowGroup}
              disabled={creatingWorkflow || !newWorkflowInitiatorId}
            >
              {creatingWorkflow ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("workflows.create")
              )}
            </AnimatedButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tool Editor Dialog */}
      <Dialog open={toolEditorOpen} onOpenChange={setToolEditorOpen}>
        <DialogContent className="sm:max-w-2xl bg-terminal-cream max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-terminal-dark">
              {t("configureTools")}
            </DialogTitle>
            <DialogDescription className="font-mono text-terminal-muted">
              {t("toolEditor.subtitle", { name: editingCharacter?.displayName || editingCharacter?.name || "", count: selectedTools.length })}
            </DialogDescription>
          </DialogHeader>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-terminal-muted" />
            <input
              type="text"
              value={toolSearchQuery}
              onChange={(e) => setToolSearchQuery(e.target.value)}
              placeholder={t("toolEditor.searchPlaceholder")}
              className="w-full pl-10 pr-10 py-2 bg-terminal-bg/30 border border-terminal-border rounded-lg font-mono text-sm text-terminal-dark placeholder:text-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-green/50 focus:border-terminal-green"
            />
            {toolSearchQuery && (
              <button
                onClick={() => setToolSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-terminal-muted hover:text-terminal-dark transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Scrollable Tool Categories */}
          <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1 min-h-0">
            {Object.entries(CATEGORY_ICONS).map(([category, icon]) => {
              const tools = filteredToolsByCategory[category];
              if (!tools || tools.length === 0) return null;

              const isCollapsed = collapsedCategories.has(category);
              const selectedCount = getSelectedCountInCategory(category);
              const totalCount = (toolsByCategory[category] || []).length;
              const selectableIds = (toolsByCategory[category] || []).filter(areDependenciesMet).map((t) => t.id);
              const selectableSelectedCount = selectableIds.filter((id) => selectedTools.includes(id)).length;
              const allSelected = selectableIds.length > 0 && selectableSelectedCount === selectableIds.length;
              const categoryLabel = t.has(`toolEditor.categories.${category}`)
                ? t(`toolEditor.categories.${category}`)
                : category.replace(/-/g, " ");

              return (
                <div key={category} className="border border-terminal-border/50 rounded-lg overflow-hidden">
                  {/* Category Header */}
                  <div className="w-full flex items-center justify-between px-3 py-2 bg-terminal-bg/20">
                    {/* Clickable category toggle (left side) */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="flex items-center gap-2 hover:bg-terminal-bg/30 rounded px-1 py-0.5 -mx-1 transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-terminal-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-terminal-muted" />
                      )}
                      <span className="text-sm">{icon}</span>
                      <span className="font-mono text-sm font-medium text-terminal-dark">
                        {categoryLabel}
                      </span>
                      <span className="font-mono text-xs text-terminal-muted">
                        ({selectedCount}/{totalCount})
                      </span>
                    </button>
                    {/* Select All / Deselect All */}
                    <button
                      type="button"
                      onClick={() => toggleAllInCategory(category, !allSelected)}
                      className="px-2 py-0.5 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors"
                    >
                      {allSelected ? t("toolEditor.deselectAll") : t("toolEditor.selectAll")}
                    </button>
                  </div>

                  {/* Category Tools */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                      {tools.map((tool) => (
                        (() => {
                          const isSelected = selectedTools.includes(tool.id);
                          const dependenciesMet = areDependenciesMet(tool);
                          const warning = dependenciesMet ? null : getDependencyWarning(tool);
                          const canToggle = dependenciesMet || isSelected;

                          return (
                            <div
                              key={tool.id}
                              onClick={() => {
                                if (!canToggle) return;
                                toggleTool(tool.id);
                              }}
                              className={`flex items-start gap-2 p-2 rounded transition-colors ${canToggle ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${isSelected
                                ? "bg-terminal-green/10 border border-terminal-green/30"
                                : "bg-terminal-bg/10 border border-transparent hover:border-terminal-border/50"
                                } ${warning ? "border border-terminal-amber/30" : ""}`}
                            >
                              <Checkbox
                                id={`tool-${tool.id}`}
                                checked={isSelected}
                                onCheckedChange={() => toggleTool(tool.id)}
                                disabled={!canToggle}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <Label
                                  htmlFor={`tool-${tool.id}`}
                                  className="font-mono text-xs text-terminal-dark cursor-pointer block truncate"
                                >
                                  {tool.displayName || tool.id}
                                </Label>
                                <p className="text-[10px] font-mono text-terminal-muted line-clamp-1">
                                  {tool.description || ""}
                                </p>
                                {warning && (
                                  <div className="mt-1">
                                    <ToolDependencyBadge warning={warning} />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* No results message */}
            {Object.keys(filteredToolsByCategory).length === 0 && (
              <div className="text-center py-8 text-terminal-muted font-mono text-sm">
                {t("toolEditor.noResults", { query: toolSearchQuery })}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex justify-between items-center pt-3 border-t border-terminal-border/50">
            <span className="text-xs font-mono text-terminal-muted">
              {t("toolEditor.footerCount", { selected: selectedTools.length, total: availableTools.length })}
            </span>
            <div className="flex gap-2">
              <AnimatedButton
                variant="outline"
                onClick={() => setToolEditorOpen(false)}
                className="font-mono"
              >
                {tc("cancel")}
              </AnimatedButton>
              <AnimatedButton
                onClick={saveTools}
                disabled={isSaving}
                className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {tc("save")}
              </AnimatedButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Plugin Assignment Dialog */}
      <Dialog open={pluginEditorOpen} onOpenChange={setPluginEditorOpen}>
        <DialogContent className="sm:max-w-2xl bg-terminal-cream max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
              <Plug className="w-5 h-5 text-terminal-green" />
              {t("plugins.title")}
            </DialogTitle>
            <DialogDescription className="font-mono text-terminal-muted">
              {t("plugins.subtitle", {
                name: editingCharacter?.displayName || editingCharacter?.name || "",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {loadingAgentPlugins ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-terminal-green" />
              </div>
            ) : agentPlugins.length === 0 ? (
              <div className="rounded border border-dashed border-terminal-border/60 p-4 text-center font-mono text-sm text-terminal-muted">
                {t("plugins.empty")}
              </div>
            ) : (
              agentPlugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="rounded border border-terminal-border/50 bg-terminal-bg/10 p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-terminal-dark truncate">
                        {plugin.name}
                      </p>
                      <p className="font-mono text-xs text-terminal-muted mt-0.5">
                        v{plugin.version}
                      </p>
                      <p className="font-mono text-xs text-terminal-muted mt-1 line-clamp-2">
                        {plugin.description}
                      </p>
                    </div>
                    <Switch
                      checked={plugin.enabledForAgent}
                      onCheckedChange={(checked) => toggleAgentPlugin(plugin.id, checked)}
                      disabled={savingPluginId === plugin.id}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-terminal-border/50">
            <AnimatedButton
              variant="outline"
              onClick={() => setPluginEditorOpen(false)}
              className="font-mono"
            >
              {tc("close")}
            </AnimatedButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Folder Manager Dialog */}
      <Dialog open={folderManagerOpen} onOpenChange={setFolderManagerOpen}>
        <DialogContent className="w-[90vw] sm:max-w-[45rem] bg-terminal-cream max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
              <DatabaseIcon className="w-5 h-5 text-terminal-green" />
              {t("vectorTitle")}
            </DialogTitle>
            <DialogDescription className="font-mono text-terminal-muted">
              {folderManagerCharacter?.displayName || folderManagerCharacter?.name}
            </DialogDescription>
          </DialogHeader>
          {folderManagerCharacter && (
            <FolderSyncManager characterId={folderManagerCharacter.id} />
          )}
          <div className="flex justify-end mt-4">
            <AnimatedButton
              variant="outline"
              onClick={() => setFolderManagerOpen(false)}
              className="font-mono"
            >
              {tc("close")}
            </AnimatedButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* MCP Tools Editor Dialog */}
      <Dialog open={mcpToolEditorOpen} onOpenChange={setMcpToolEditorOpen}>
        <DialogContent className="sm:max-w-4xl bg-terminal-cream h-[90vh] flex flex-col p-0 overflow-hidden [&>button:has(.sr-only)]:hidden">
          {/* Header with explicit close button */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0 border-b border-terminal-border/20">
            <div>
              <DialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
                <Plug className="w-5 h-5 text-purple-500" />
                {t("mcpToolsTitle")}
              </DialogTitle>
              <DialogDescription className="font-mono text-terminal-muted mt-1">
                {editingCharacter?.displayName || editingCharacter?.name}
              </DialogDescription>
            </div>
            <button
              onClick={() => setMcpToolEditorOpen(false)}
              className="rounded-sm p-1.5 opacity-70 hover:opacity-100 hover:bg-terminal-border/30 transition-all"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-terminal-dark" />
            </button>
          </div>

          {/* Scrollable content - no absolute positioning */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {editingCharacter && (
              <MCPToolsPage
                embedded
                enabledMcpServers={mcpServers}
                enabledMcpTools={mcpTools}
                mcpToolPreferences={mcpToolPreferences}
                onUpdate={(servers, tools, prefs) => {
                  setMcpServers(servers);
                  setMcpTools(tools);
                  setMcpToolPreferences(prefs);
                }}
                onComplete={saveMcpTools}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Identity Editor Dialog */}
      <Dialog open={identityEditorOpen} onOpenChange={setIdentityEditorOpen}>
        <DialogContent className="sm:max-w-3xl bg-terminal-cream max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-terminal-border/20">
            <DialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
              <User className="w-5 h-5 text-terminal-green" />
              {t("identityEditor.title")}
            </DialogTitle>
            <DialogDescription className="font-mono text-terminal-muted">
              {t("identityEditor.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-6 mt-4 grid w-auto grid-cols-2 bg-terminal-bg/20">
              <TabsTrigger value="basic" className="font-mono text-sm">
                {t("identityEditor.tabs.basic")}
              </TabsTrigger>
              <TabsTrigger value="advanced" className="font-mono text-sm">
                {t("identityEditor.tabs.advanced")}
              </TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
              {/* Name */}
              <div>
                <Label className="font-mono text-sm text-terminal-dark mb-1 block">
                  {t("identityEditor.fields.name.label")} <span className="text-red-500">*</span>
                </Label>
                <input
                  type="text"
                  value={identityForm.name}
                  onChange={(e) => setIdentityForm({ ...identityForm, name: e.target.value })}
                  placeholder={t("identityEditor.fields.name.placeholder")}
                  maxLength={100}
                  className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                />
                <p className="mt-1 font-mono text-xs text-terminal-muted">
                  {t("identityEditor.fields.name.helper")}
                </p>
              </div>

              {/* Display Name */}
              <div>
                <Label className="font-mono text-sm text-terminal-dark mb-1 block">
                  {t("identityEditor.fields.displayName.label")}
                </Label>
                <input
                  type="text"
                  value={identityForm.displayName}
                  onChange={(e) => setIdentityForm({ ...identityForm, displayName: e.target.value })}
                  placeholder={t("identityEditor.fields.displayName.placeholder")}
                  maxLength={100}
                  className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                />
                <p className="mt-1 font-mono text-xs text-terminal-muted">
                  {t("identityEditor.fields.displayName.helper")}
                </p>
              </div>

              {/* Tagline */}
              <div>
                <Label className="font-mono text-sm text-terminal-dark mb-1 block">
                  {t("identityEditor.fields.tagline.label")}
                </Label>
                <input
                  type="text"
                  value={identityForm.tagline}
                  onChange={(e) => setIdentityForm({ ...identityForm, tagline: e.target.value })}
                  placeholder={t("identityEditor.fields.tagline.placeholder")}
                  maxLength={200}
                  className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                />
                <p className="mt-1 font-mono text-xs text-terminal-muted">
                  {t("identityEditor.fields.tagline.helper")}
                </p>
              </div>

              {/* Purpose */}
              <div>
                <Label className="font-mono text-sm text-terminal-dark mb-1 block">
                  {t("identityEditor.fields.purpose.label")}
                </Label>
                <textarea
                  value={identityForm.purpose}
                  onChange={(e) => setIdentityForm({ ...identityForm, purpose: e.target.value })}
                  placeholder={t("identityEditor.fields.purpose.placeholder")}
                  maxLength={2000}
                  rows={6}
                  className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green resize-none"
                />
                <p className="mt-1 font-mono text-xs text-terminal-muted">
                  {t("identityEditor.fields.purpose.helper")} ({identityForm.purpose.length}/2000)
                </p>
              </div>
            </TabsContent>

            {/* Advanced Tab - Custom Prompt */}
            <TabsContent value="advanced" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
              <div className="rounded border border-amber-200 bg-amber-50 p-3">
                <p className="font-mono text-xs text-amber-800">
                  {t("identityEditor.fields.customPrompt.warning")}
                </p>
              </div>

              {/* Current Auto-Generated Prompt Preview */}
              {generatedPrompt && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-mono text-sm text-terminal-dark">
                      {t("identityEditor.fields.customPrompt.currentPrompt")}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setIdentityForm({ ...identityForm, systemPromptOverride: generatedPrompt })}
                      className="text-xs font-mono text-terminal-green hover:text-terminal-green/80 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-terminal-green/10"
                    >
                      <span>{t("identityEditor.fields.customPrompt.copyToOverride")}</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="rounded border border-terminal-border bg-terminal-bg/10 p-3 max-h-48 overflow-y-auto">
                    <pre className="font-mono text-xs text-terminal-dark whitespace-pre-wrap break-words">
                      {generatedPrompt}
                    </pre>
                  </div>
                  <p className="font-mono text-xs text-terminal-muted">
                    {t("identityEditor.fields.customPrompt.currentPromptHelper")}
                  </p>
                </div>
              )}

              {/* Custom Override */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-mono text-sm text-terminal-dark">
                    {t("identityEditor.fields.customPrompt.label")}
                  </Label>
                  {identityForm.systemPromptOverride.trim() && (
                    <button
                      type="button"
                      onClick={() => setIdentityForm({ ...identityForm, systemPromptOverride: "" })}
                      className="text-xs font-mono text-red-500 hover:text-red-600 transition-colors"
                    >
                      {t("identityEditor.fields.customPrompt.clear")}
                    </button>
                  )}
                </div>
                <textarea
                  value={identityForm.systemPromptOverride}
                  onChange={(e) => setIdentityForm({ ...identityForm, systemPromptOverride: e.target.value })}
                  placeholder={t("identityEditor.fields.customPrompt.placeholder")}
                  maxLength={10000}
                  rows={12}
                  className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green resize-none"
                />
                <div className="mt-1 flex items-center justify-between">
                  <p className="font-mono text-xs text-terminal-muted">
                    {t("identityEditor.fields.customPrompt.helper")}
                  </p>
                  <p className="font-mono text-xs text-terminal-muted">
                    {identityForm.systemPromptOverride.length}/10000
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Sticky Footer Actions */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-terminal-border/20 bg-terminal-cream">
            <AnimatedButton
              variant="outline"
              onClick={() => setIdentityEditorOpen(false)}
              className="font-mono"
            >
              {tc("cancel")}
            </AnimatedButton>
            <AnimatedButton
              onClick={saveIdentity}
              disabled={isSaving || !identityForm.name.trim()}
              className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {tc("save")}
            </AnimatedButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* MCP Tool Removal Warning Dialog */}
      <AlertDialog open={mcpRemovalWarningOpen} onOpenChange={setMcpRemovalWarningOpen}>
        <AlertDialogContent className="bg-terminal-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
              <Plug className="w-5 h-5 text-amber-500" />
              {t("mcpRemovalWarning.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-terminal-muted">
              {t("mcpRemovalWarning.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded border border-amber-200 bg-amber-50 p-3 my-4">
            <p className="font-mono text-xs text-amber-800 mb-2">
              {t("mcpRemovalWarning.toolsBeingRemoved")}
            </p>
            <ul className="list-disc list-inside font-mono text-xs text-amber-900">
              {mcpToolsBeingRemoved.map((toolKey) => (
                <li key={toolKey}>{toolKey}</li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono" disabled={isSaving}>
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                performMcpToolSave();
              }}
              disabled={isSaving}
              className="bg-amber-500 hover:bg-amber-600 text-white font-mono"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {tc("save")}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {t("mcpRemovalWarning.confirm")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-terminal-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              {t("deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-terminal-muted">
              {t("deleteDialog.description", {
                name: characterToDelete?.displayName || characterToDelete?.name || ""
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded border border-amber-200 bg-amber-50 p-3 my-4">
            <p className="font-mono text-xs text-amber-800">
              {t("deleteDialog.warning")}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono" disabled={isDeleting}>
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteCharacter();
              }}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white font-mono"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t("deleteDialog.deleting")}
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("deleteDialog.confirm")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
