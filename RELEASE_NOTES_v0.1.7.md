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

