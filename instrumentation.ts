/**
 * Next.js Instrumentation
 * 
 * This file is executed once when the Next.js server starts.
 * Used for initialization tasks like starting file watchers and background sync.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const shouldLogAiSdkWarnings =
      process.env.AI_SDK_LOG_WARNINGS === "true" || process.env.AI_SDK_LOG_WARNINGS === "1";
    if (!shouldLogAiSdkWarnings) {
      const globalForAiSdk = globalThis as typeof globalThis & {
        AI_SDK_LOG_WARNINGS?: boolean;
      };
      globalForAiSdk.AI_SDK_LOG_WARNINGS = false;
    }

    console.log("[Instrumentation] Initializing server-side services...");
    
    // Initialize settings first
    const { initializeSettings } = await import("@/lib/settings/settings-manager");
    initializeSettings();
    
    // Initialize vector sync system (file watchers + background sync)
    // Delay slightly to allow database to be ready
    setTimeout(async () => {
      try {
        const { initializeVectorSync } = await import("@/lib/vectordb/background-sync");
        await initializeVectorSync();
      } catch (error) {
        console.error("[Instrumentation] Error initializing vector sync:", error);
      }
    }, 2000);

    // Start observability cleanup job for stale runs
    setTimeout(async () => {
      try {
        const { startCleanupJob } = await import("@/lib/observability");
        startCleanupJob();
      } catch (error) {
        console.error("[Instrumentation] Error starting cleanup job:", error);
      }
    }, 3000);

    // Start scheduled task scheduler
    setTimeout(async () => {
      try {
        const { startScheduler } = await import("@/lib/scheduler/scheduler-service");
        await startScheduler();
        console.log("[Instrumentation] Scheduler service started");
      } catch (error) {
        console.error("[Instrumentation] Error starting scheduler:", error);
      }
    }, 4000);

    // Auto-connect to configured MCP servers
    setTimeout(async () => {
      try {
        const { loadSettings } = await import("@/lib/settings/settings-manager");
        const { MCPClientManager, resolveMCPConfig } = await import("@/lib/mcp/client-manager");

        const settings = loadSettings();
        const mcpConfig = settings.mcpServers?.mcpServers || {};
        const enabledServers = Object.entries(mcpConfig)
          .filter(([_, config]) => (config as any).enabled !== false)
          .map(([name]) => name);

        if (enabledServers.length > 0) {
          console.log(`[Instrumentation] Auto-connecting to ${enabledServers.length} MCP server(s)...`);
          const manager = MCPClientManager.getInstance();
          const env = settings.mcpEnvironment || {};

          for (const serverName of enabledServers) {
            const config = mcpConfig[serverName];
            if (!config) continue;

            try {
              const resolved = await resolveMCPConfig(serverName, config, env);
              await manager.connect(serverName, resolved);
              console.log(`[Instrumentation] MCP server "${serverName}" connected`);
            } catch (error) {
              console.warn(`[Instrumentation] MCP server "${serverName}" failed to connect:`, error);
            }
          }
          console.log("[Instrumentation] MCP auto-connect complete");
        }
      } catch (error) {
        console.error("[Instrumentation] Error auto-connecting MCP servers:", error);
      }
    }, 5000);

    console.log("[Instrumentation] Server-side services initialized");
  }
}

