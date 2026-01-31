# Seline V0.1.7 - Crawlyboys Update - Task Scheduler, Channels & Custom ComfyUI Workflows

## What's New

### Task Scheduler
- Schedule your AI agents to run automatically on a recurring basis (daily standups, weekly digests, code reviews, and more)
- Built-in preset templates: Daily Standup, Weekly Digest, Code Review, Linear Summary
- Live streaming view for active scheduled tasks with real-time output
- Pause, resume, and trigger schedules on demand
- Delivery options: email, Slack webhook, and generic webhooks
- Template variables and cron-based scheduling with a visual cron builder

### Channel Connectors (WhatsApp, Slack & Telegram)
- Connect your AI agents to WhatsApp, Slack, and Telegram (Slack and Telegram works well, Whatsapp connects but haven't tested fully.)
- Manage channel connections from the settings page with QR code pairing for WhatsApp
- Inbound message routing and outbound delivery with channel-specific formatting
- Image handling support for channel messages

### Custom ComfyUI Workflows
- Import and run your own ComfyUI workflow JSON files directly from the chat
- Workflow analyzer automatically detects inputs, outputs, and configurable parameters
- Manage custom workflows from a dedicated UI with edit and delete support
- Real-time progress tracking with WebSocket-based status updates
- Flux Klein edit and image-reference tools bundled with the backend

### Moonshot / Kimi Models
- Added Moonshot provider with full Kimi model catalogue (including vision models)

### Prompt Caching for Claude API and Openrouter API
- Intelligent prompt caching reduces token usage and speeds up repeated conversations
- Cache creation and read metrics are tracked in the observability dashboard
- Configurable cache thresholds per provider (5Min - 1hr, only applies to Claude API)

### MCP (Model Context Protocol) Improvements
- Enable/disable toggle for individual MCP servers without removing them
- Supabase MCP template added to quick-start gallery
- Environment variables in stdio transport args now resolve correctly
- Servers requiring folder read-write access are handled properly with env arguments
- Live reload status indicator shows when MCP servers are reconnecting

### Vector Search
- Improved context coverage and search relevance
- Full search query now displayed while results are loading
- Better question-oriented query handling

## Improvements

- Upgraded to AI SDK v6 with proper cache and message metadata callbacks
- Observability dashboard now displays prompt cache hit/creation metrics
- Scheduled task creation and list pages redesigned for clarity
- Agent character creation wizard UI refinements
- Tool result persistence and summaries for long-running tool calls
- Electron build stability fixes for subprocess MCP and compile path resolution
- Docker backend updated with latest Torch and CUDA versions
- Windows and Mac installers size reduction. (1GB -> 430MB)

## Bug Fixes

- Fixed jittery streaming and flashing in scheduled task event view
- Fixed MCP Tools dialog close button in half-screen mode
- Fixed image handling for channel messages
- Fixed command execution issues with shell arguments and path traversal
- Fixed race condition in scheduled task queue
- Fixed tool call streaming errors with Anthropic/Telegram provider
- Fixed OpenRouter model validation and reduced polling noise
- Fixed Antigravity Claude request normalization
- Fixed vector search dependency checks
- Fixed Z-Image model handling (skip download if models exist, follow redirects)

---

**Full Changelog**: v0.1.6...v0.1.7
                                                                                                                                                     ● I see the issue. The login page does router.push("/") and router.refresh() after successful login, but the AuthProvider has already mounted and run
   verifyAuth() once during initial load. The router.refresh() triggers a Next.js soft refresh, but the AuthProvider's verifyAuth only runs on mount 
  (the useEffect with [verifyAuth] dependency). So after login redirect, the auth state is stale — it never re-verifies.
                                                                                                                                                       The key problem: after login succeeds, verifyAuth() is never called again. The router.refresh() does a Next.js server component refresh but doesn't   re-trigger client-side useEffect hooks since the AuthProvider component doesn't unmount/remount during a same-page navigation.                    
  
  There are two things to fix:

  1. Login page should call refreshAuth() after successful login (or the login page should trigger re-verification)
  2. The verifyAuth should also run when the pathname changes (so navigating from /login to / triggers it)

  The simplest fix is option 2 — add pathname to the initAuth effect:

● Update(components\auth\auth-provider.tsx)       
  ⎿  Added 1 line, removed 1 line
      88      };
      89                                                                                                                                                   90      initAuth();
      91 -  }, [verifyAuth]);                                                                                                                        
      91 +  }, [verifyAuth, pathname]);
      92
      93    useEffect(() => {
      94      if (isLoading) return;

● This makes verifyAuth() re-run whenever the pathname changes — so when the login page does router.push("/"), the navigation from /login to /
  triggers a fresh auth check, which will now find the session cookie and populate the user state.

  Why it worked after restart: On cold start, the app loads / directly, AuthProvider mounts, runs verifyAuth(), the cookie is already there from the   previous session, and auth succeeds immediately.
                                                                                                                                                     
  Why it failed on first login: The AuthProvider was already mounted (it wraps the whole app). Login set the cookie server-side, but the client never   re-ran verifyAuth() after navigation — the effect only had [verifyAuth] as a dependency, which is a stable useCallback reference that never       
  changes.
