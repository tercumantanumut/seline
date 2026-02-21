"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IntroPage,
  LoadingPage,
  PreviewPage,
  SuccessPage,
  IdentityPage,
  CapabilitiesPage,
  KnowledgeBasePage,
  VectorSearchPage,
  EmbeddingSetupPage,
  MCPToolsPage,
} from "./terminal-pages";
import { useReducedMotion } from "./hooks/use-reduced-motion";
import { resilientFetch, resilientPost, resilientPut, resilientPatch } from "@/lib/utils/resilient-fetch";
import { useAgentExpansion } from "@/lib/characters/hooks";
import { DEFAULT_ENABLED_TOOLS } from "@/lib/characters/templates/resolve-tools";
import { WizardProgress, WIZARD_STEPS, type WizardStep } from "@/components/ui/wizard-progress";
import { WindowsTitleBar } from "@/components/layout/windows-titlebar";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { AgentIdentity } from "./terminal-pages/identity-page";
import type { UploadedDocument } from "./terminal-pages/knowledge-base-page";

type WizardPage =
  | "intro"
  | "identity"
  | "capabilities"
  | "mcpTools"
  | "knowledge"
  | "embeddingSetup"
  | "vectorSearch"
  | "loading"
  | "preview"
  | "success";

/** Pages that should show the progress bar */
const PROGRESS_PAGES: WizardPage[] = ["identity", "knowledge", "embeddingSetup", "vectorSearch", "capabilities", "mcpTools", "preview"];

interface WizardState {
  identity: AgentIdentity;
  enabledTools: string[];
  documents: UploadedDocument[];
  createdCharacterId: string | null;
  enabledMcpServers: string[];
  enabledMcpTools: string[];
  mcpToolPreferences: Record<string, { enabled: boolean; loadingMode: "always" | "deferred" }>;
}

const initialState: WizardState = {
  identity: { name: "", tagline: "", purpose: "" },
  enabledTools: DEFAULT_ENABLED_TOOLS,
  documents: [],
  createdCharacterId: null,
  enabledMcpServers: [],
  enabledMcpTools: [],
  mcpToolPreferences: {},
};

const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? "100%" : "-100%",
    opacity: 0,
  }),
};

export function TerminalWizard() {
  const [currentPage, setCurrentPage] = useState<WizardPage>("intro");
  const [state, setState] = useState<WizardState>(initialState);
  const [draftAgentId, setDraftAgentId] = useState<string | null>(null);
  const [direction, setDirection] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vectorDBEnabled, setVectorDBEnabled] = useState(false);
  const [hasMcpServers, setHasMcpServers] = useState<boolean | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const t = useTranslations("characterCreation.progress");
  const tLoading = useTranslations("characterCreation.loading");
  const router = useRouter();

  // Fetch settings to check if Vector Search is enabled
  useEffect(() => {
    resilientFetch<{ vectorDBEnabled?: boolean }>("/api/settings")
      .then(({ data }) => {
        setVectorDBEnabled(data?.vectorDBEnabled === true);
      });
  }, []);

  // Check if MCP servers are configured (to decide whether to show MCP step)
  useEffect(() => {
    let cancelled = false;
    resilientFetch<{ config?: { mcpServers?: Record<string, { enabled?: boolean }> } }>("/api/mcp")
      .then(({ data }) => {
        if (cancelled) return;
        const configured = (Object.entries(data?.config?.mcpServers || {}) as [string, { enabled?: boolean }][])
          .filter(([_, serverConfig]) => serverConfig?.enabled !== false)
          .map(([name]) => name);
        setHasMcpServers(configured.length > 0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build wizard steps with translations
  const wizardSteps = useMemo(() => {
    const baseSteps = WIZARD_STEPS.filter((step) => {
      if (step.id === "mcpTools" && hasMcpServers === false) return false;
      return true;
    });
    return baseSteps.map((step) => ({
      ...step,
      label: t(step.id as "intro" | "identity" | "capabilities" | "mcpTools" | "knowledge" | "embeddingSetup" | "vectorSearch" | "preview"),
    }));
  }, [vectorDBEnabled, hasMcpServers, t]);

  // Check if current page should show progress bar
  const showProgressBar = PROGRESS_PAGES.includes(currentPage);

  const navigateTo = useCallback((page: WizardPage, dir: number = 1) => {
    setDirection(dir);
    setCurrentPage(page);
  }, []);

  // Handle step click for backward navigation
  const handleStepClick = useCallback((stepId: string) => {
    navigateTo(stepId as WizardPage, -1);
  }, [navigateTo]);

  // Handle identity submission - create draft agent
  const handleIdentitySubmit = async (identity: AgentIdentity) => {
    setState((prev) => ({ ...prev, identity }));
    setError(null);
    navigateTo("loading");

    try {
      // Create draft agent via API
      const { data, error: postError } = await resilientPost<{ character: { id: string }; error?: string }>("/api/characters/draft", {
        character: {
          name: identity.name,
          tagline: identity.tagline || undefined,
        },
        metadata: {
          purpose: identity.purpose,
          enabledTools: state.enabledTools,
        },
      });

      if (postError || !data) {
        throw new Error(data?.error || postError || "Failed to create draft agent");
      }

      setDraftAgentId(data.character.id);
      navigateTo("knowledge");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
      navigateTo("identity", -1);
    }
  };

  // Handle capabilities submission
  const handleCapabilitiesSubmit = (enabledTools: string[]) => {
    setState((prev) => ({ ...prev, enabledTools }));
    if (hasMcpServers === false) {
      navigateTo("preview");
    } else {
      navigateTo("mcpTools");
    }
  };

  // Handle MCP tools submission
  const handleMCPToolsSubmit = (servers: string[], tools: string[], preferences: Record<string, { enabled: boolean; loadingMode: "always" | "deferred" }>) => {
    setState((prev) => ({
      ...prev,
      enabledMcpServers: servers,
      enabledMcpTools: tools,
      mcpToolPreferences: preferences,
    }));
  };

  // Handle knowledge base submission
  const handleKnowledgeSubmit = (documents: UploadedDocument[]) => {
    setState((prev) => ({ ...prev, documents }));
    // Navigate to embedding setup to configure semantic search
    navigateTo("embeddingSetup");
  };

  // Handle vector search submission
  const handleVectorSearchSubmit = () => {
    navigateTo("capabilities");
  };

  // Handle embedding setup submission
  const handleEmbeddingSetupSubmit = async (config: { provider: string; model: string; apiKey?: string }) => {
    try {
      // Save embedding config to settings and enable vector search
      const { error: putError } = await resilientPut("/api/settings", {
        embeddingProvider: config.provider,
        embeddingModel: config.model,
        openrouterApiKey: config.apiKey || undefined,
        vectorDBEnabled: true,
      });

      if (putError) {
        console.error("Failed to save embedding config:", putError);
        setError(`Failed to save embedding configuration: ${putError || "Unknown error"}`);
        return;
      }

      setVectorDBEnabled(true);
      navigateTo("vectorSearch");
    } catch (err) {
      console.error("Failed to save embedding config:", err);
      setError(`Failed to save embedding configuration: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  // Handle embedding setup skip — always show the folder sync page next
  const handleEmbeddingSetupSkip = () => {
    navigateTo("vectorSearch");
  };

  // Agents expansion hook
  const { expand, isExpanding: isExpandingConcept } = useAgentExpansion();

  // Quick create: pre-fill identity and go to identity step
  const handleQuickCreate = async (description: string) => {
    setError(null);
    navigateTo("loading");

    try {
      const expanded = await expand(description);

      if (!expanded) {
        throw new Error("Failed to generate agent profile. Please try manual creation.");
      }

      setState((prev) => ({
        ...prev,
        identity: {
          name: expanded.name,
          tagline: expanded.tagline,
          purpose: expanded.purpose,
        },
      }));

      navigateTo("identity");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to expand agent");
      navigateTo("intro", -1);
    }
  };

  const handleCreateFromTemplate = async (templateId: string, templateName: string) => {
    setError(null);
    navigateTo("loading");
    try {
      const response = await resilientPost<{ success?: boolean; characterId?: string; error?: string }>(
        `/api/characters/templates/${templateId}/create`,
        {}
      );
      if (response.error || !response.data || !response.data.characterId) {
        throw new Error((response.data && response.data.error) || response.error || "Failed to create from template");
      }
      const createdId = response.data.characterId;

      setState((prev) => ({
        ...prev,
        identity: { ...prev.identity, name: templateName || prev.identity.name },
        createdCharacterId: createdId,
      }));
      navigateTo("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create from template");
      navigateTo("intro", -1);
    }
  };

  // Finalize agent creation
  const handleFinalizeAgent = async () => {
    if (!draftAgentId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Update the draft agent with final configuration and activate it
      const { data, error: patchError } = await resilientPatch<{ error?: string }>(`/api/characters/${draftAgentId}`, {
        character: {
          name: state.identity.name,
          tagline: state.identity.tagline || undefined,
          status: "active",
        },
        metadata: {
          purpose: state.identity.purpose,
          enabledTools: state.enabledTools,
          enabledMcpServers: state.enabledMcpServers,
          enabledMcpTools: state.enabledMcpTools,
          mcpToolPreferences: state.mcpToolPreferences,
        },
      });

      if (patchError) {
        throw new Error(data?.error || patchError || "Failed to create agent");
      }

      setState((prev) => ({ ...prev, createdCharacterId: draftAgentId }));
      navigateTo("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const transitionProps = prefersReducedMotion
    ? { duration: 0 }
    : { type: "tween" as const, duration: 0.4, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] };

  return (
    <div className="relative min-h-screen overflow-hidden bg-terminal-cream flex flex-col">
      <WindowsTitleBar />
      <div className="relative flex-1">
        {/* Error Banner */}
        {error && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute top-0 left-0 right-0 z-50 bg-red-500 text-white px-4 py-2 text-center font-mono text-sm"
          >
            {tLoading("errorPrefix")}{error}
            <button
              onClick={() => setError(null)}
              className="ml-4 underline hover:no-underline"
            >
              {tLoading("dismiss")}
            </button>
          </motion.div>
        )}

        {/* Progress Bar - shown on main wizard pages */}
        {showProgressBar && (
          <WizardProgress
            steps={wizardSteps}
            currentStep={currentPage}
            onStepClick={handleStepClick}
            className="relative z-40"
          />
        )}

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentPage}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transitionProps}
            className={showProgressBar ? "absolute inset-0 pt-16" : "absolute inset-0"}
          >
            {currentPage === "intro" && (
              <IntroPage
                onContinue={() => navigateTo("identity")}
                onQuickCreate={handleQuickCreate}
                onCreateFromTemplate={handleCreateFromTemplate}
                onBack={() => router.push("/")}
              />
            )}
            {currentPage === "identity" && (
              <IdentityPage
                initialIdentity={state.identity}
                onSubmit={handleIdentitySubmit}
                onBack={() => navigateTo("intro", -1)}
              />
            )}
            {currentPage === "capabilities" && (
              <CapabilitiesPage
                agentName={state.identity.name}
                agentId={draftAgentId}
                initialEnabledTools={state.enabledTools}
                onSubmit={handleCapabilitiesSubmit}
                onBack={() => navigateTo(vectorDBEnabled ? "vectorSearch" : "embeddingSetup", -1)}
              />
            )}
            {currentPage === "mcpTools" && (
              <MCPToolsPage
                enabledMcpServers={state.enabledMcpServers}
                enabledMcpTools={state.enabledMcpTools}
                mcpToolPreferences={state.mcpToolPreferences}
                onUpdate={handleMCPToolsSubmit}
                onComplete={() => navigateTo("preview")}
                onBack={() => navigateTo("capabilities", -1)}
              />
            )}
            {currentPage === "knowledge" && draftAgentId && (
              <KnowledgeBasePage
                agentId={draftAgentId}
                agentName={state.identity.name}
                initialDocuments={state.documents}
                onSubmit={handleKnowledgeSubmit}
                onBack={() => navigateTo("identity", -1)}
              />
            )}
            {currentPage === "vectorSearch" && draftAgentId && (
              <VectorSearchPage
                agentId={draftAgentId}
                agentName={state.identity.name}
                onSubmit={handleVectorSearchSubmit}
                onBack={() => navigateTo("embeddingSetup", -1)}
                onSkip={handleVectorSearchSubmit}
              />
            )}
            {currentPage === "embeddingSetup" && (
              <EmbeddingSetupPage
                agentName={state.identity.name}
                onSubmit={handleEmbeddingSetupSubmit}
                onBack={() => navigateTo("knowledge", -1)}
                onSkip={handleEmbeddingSetupSkip}
              />
            )}
            {currentPage === "loading" && (
              <LoadingPage
                characterName={state.identity.name || "Agent"}
                onComplete={() => { }}
                loadingTitle={isExpandingConcept ? tLoading("enhancingTitle") : tLoading("configuringTitle")}
                customMessages={isExpandingConcept
                  ? tLoading.raw("enhancingMessages") as string[]
                  : tLoading.raw("configuringMessages") as string[]
                }
              />
            )}
            {currentPage === "preview" && (
              <PreviewPage
                identity={state.identity}
                enabledTools={state.enabledTools}
                documents={state.documents}
                onConfirm={handleFinalizeAgent}
                onBack={() => navigateTo(hasMcpServers === false ? "capabilities" : "mcpTools", -1)}
                isSubmitting={isSubmitting}
              />
            )}
            {currentPage === "success" && state.createdCharacterId && (
              <SuccessPage
                characterId={state.createdCharacterId}
                characterName={state.identity.name}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
