# Seline

<div align="center">

![Version](https://img.shields.io/badge/version-0.1.8-blue)
![Electron](https://img.shields.io/badge/Electron-39.2.4-47848F?logo=electron&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

</div>

<div align="center">
  <img src="assets/demo.gif" alt="Seline Demo" width="800"/>
</div>

<br/>

Seline is a local-first AI desktop application that brings together conversational AI, visual generation tools, vector search, and multi-channel connectivity in one place. Your data stays on your machine, conversations persist across sessions with long-running context, and you can route between any LLM provider without leaving the app. Connect WhatsApp, Telegram, or Slack to turn your agents into always-on bots that respond across channels with full context and background task delivery.

Seline is in active development, things break, we fix, it's a big application and our team utilizes it each day now and dedicated to improve. 

Known Issues: Mac dmg builds has signing issue, might give error after install. 
Wait two days or search for workaround on the web. I will sign in two days with Apple developer id. 

## Highlights

**Multi-Channel Connectivity**
- **WhatsApp, Telegram, Slack** — Turn agents into always-on bots. Messages route to assigned agents, responses flow back automatically. Scheduled task delivery to channels.
- **MCP (Model Context Protocol)** — Connect external AI services per-agent with dynamic path variables. Bundled Node.js for `npx`-based servers.

**Intelligence & Research**
- **Deep Research Mode** — 6-phase workflow (plan → search → analyze → draft → refine → finalize) with cited sources and full reports. Multi-model routing for research, chat, vision, and utility tasks running in parallel.
- **Local web browsing with Puppeteer** — Bundled headless Chromium scrapes pages locally (no external API needed), supports JavaScript-heavy sites, extracts markdown and metadata.
- **Prompt enhancement** — A utility model enriches your queries with context from synced folders before the main LLM sees them.
- **Smart tool discovery** — 40+ tools loaded on-demand via searchTools, saving ~70% of tokens per request.

**Local Knowledge & Privacy**
- **Local or API Vector search with LanceDB** — Hybrid dense + lexical retrieval, AI-powered result synthesis. Embedding provider can be local (on-device) or API-based.
- **Document RAG** — Attach files to agents, indexed and searchable instantly with configurable sync ignore patterns.
- **Local grep (ripgrep)** — Fast pattern search across synced folders.

**Visual & Creative Tools**
- **Image generation** — Flux.2, GPT-5, Gemini, Z-Image, FLUX.2 Klein 4B/9B (local), WAN 2.2. Reference-based editing, style transfer, virtual try-on.
- **Video assembly** — AI-driven scene planning, professional transitions (fade/crossfade/slide/wipe/zoom), Ken Burns effect, text overlays, session-wide asset compilation into cohesive videos via Remotion.
- **Custom ComfyUI workflows** — Import JSON, auto-detect inputs/outputs, real-time WebSocket progress.

**Automation & Agents**
- **Task scheduler** — Recurring cron jobs with presets (Daily Standup, Weekly Digest, Code Review). Pause, resume, trigger on demand. Live streaming output. Background task system with zombie run detection and channel delivery.
- **Persistent memory** — Agents remember preferences and workflows across sessions, categorized and user-controlled.
- **Configurable agents** — Persistent sessions, long-running context, active session indicators.
- **Plan tool & UI** — Models create and track multi-step task plans inline with collapsible status UI. Tool calls grouped into compact badge rows (handles 15+ concurrent calls cleanly).

**Developer Experience**
- **Prompt caching** — Claude API and OpenRouter cache tracking in observability dashboard. Explicit cache breakpoints with configurable TTL (5m/1h) for Claude direct API.
- **Execute commands** — Safely run commands within synced/indexed folders.

## LLM Providers
| Provider | Models | Prompt Caching |
|----------|--------|----------------|
| Anthropic | Claude (direct API) | Explicit cache breakpoints, configurable TTL (5m / 1h) |
| OpenRouter | Claude, Gemini, OpenAI, Grok, Moonshot, Groq, DeepSeek | Provider-side (automatic for supported models) |
| Kimi / Moonshot | Kimi K2.5 (256K ctx, vision, thinking) | Provider-side automatic |
| Antigravity | Gemini 3, Claude Sonnet 4.5, Claude Haiku 4.5 | Not supported |
| Codex | GPT-5, Codex | Not supported |
| Ollama | Local models | Not supported |

## MCP (Model Context Protocol)
Seline ships with full MCP support. Servers are configured per-agent and auto-connect on startup.

### Dynamic Variables
- `${SYNCED_FOLDER}` — path of the primary synced folder for the current agent.
- `${SYNCED_FOLDERS}` — comma-separated list of all synced folders.
- `${SYNCED_FOLDERS_ARRAY}` — expands to one argument per folder (useful for the `filesystem` server).

Node.js is bundled inside the app on macOS and Windows, so MCP servers that need `npx` or `node` work out of the box without a system Node.js installation.

## Multi-Channel Inbox

Turn your agents into always-on bots by connecting WhatsApp, Telegram, or Slack. Each agent can have its own channel connections—inbound messages route to the assigned agent with full context, and responses flow back through the same channel automatically.

### Supported Channels

**WhatsApp** (via Baileys)
- QR code pairing — scan with your WhatsApp mobile app
- Persistent auth across restarts
- Text messages and image attachments (send/receive)
- Self-chat mode for testing
- Auto-reconnection on connection drops

**Telegram** (via Grammy)
- Bot token authentication (create via @BotFather)
- Message threads/topics support
- Automatic message chunking for long responses (3800 char limit)
- Text and image support
- Handles polling conflicts (multiple instances)

**Slack** (via Bolt SDK)
- Socket mode (no public webhook needed)
- Requires: bot token, app token, signing secret
- Channels, DMs, and threaded messages
- File uploads with captions
- Auto-resolves channel/user names

### Features

- **Unified routing** — Messages route to the agent assigned to each connection
- **Background task delivery** — Scheduled task results can be sent to channels automatically with formatted summaries (task name, status, duration, errors, session links)
- **Full context** — Agents see message history, attachments, and thread context
- **Status tracking** — Connection status (disconnected/connecting/connected/error) shown in UI
- **Auto-bootstrap** — All connections auto-reconnect on app startup

## Supported Platforms
- **macOS** — DMG installer available.
- **Windows** — NSIS installer and portable builds available.
- **Linux** — not tested.

## Prerequisites
For end users: none beyond the OS installer.

For developers:
- Node.js 20+ (22 recommended for Electron 39 native module rebuilds)
- npm 9+
- Windows 10/11 or macOS 12+

## Installation
```bash
npm install
```

## Development Workflow

```bash
npm run electron:dev
```
This runs the Next.js dev server (with stdio fix) and launches Electron against `http://localhost:3000`.

## Build Commands
```bash
# Windows installer + portable
npm run electron:dist:win

# macOS (DMG + dir)
npm run electron:dist:mac
```
For local packaging without creating installers, use `npm run electron:pack`. See `docs/BUILD.md` for the full pipeline.

## 📦 Manual Model Placement

If you prefer to download models manually (or have slow/no internet during Docker build), place them in the paths below. Models are mounted via Docker volumes at runtime.

### Z-Image Turbo FP8

**Base path:** `comfyui_backend/ComfyUI/models/`

| Model | Path | Download |
|-------|------|----------|
| **Checkpoint** | `checkpoints/z-image-turbo-fp8-aio.safetensors` | [HuggingFace](https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors) |
| **LoRA** | `loras/z-image-detailer.safetensors` | [HuggingFace](https://huggingface.co/styly-agents/z-image-detailer/resolve/main/z-image-detailer.safetensors) |

### FLUX.2 Klein 4B

**Base path:** `comfyui_backend/flux2-klein-4b/volumes/models/`

| Model | Path | Download |
|-------|------|----------|
| **VAE** | `vae/flux2-vae.safetensors` | [HuggingFace](https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors) |
| **CLIP** | `clip/qwen_3_4b.safetensors` | [HuggingFace](https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors) |
| **Diffusion Model** | `diffusion_models/flux-2-klein-base-4b-fp8.safetensors` | [HuggingFace](https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4b-fp8/resolve/main/flux-2-klein-base-4b-fp8.safetensors) |

### FLUX.2 Klein 9B

**Base path:** `comfyui_backend/flux2-klein-9b/volumes/models/`

| Model | Path | Download |
|-------|------|----------|
| **VAE** | `vae/flux2-vae.safetensors` | [HuggingFace](https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors) |
| **CLIP** | `clip/qwen_3_8b_fp8mixed.safetensors` | [HuggingFace](https://huggingface.co/Comfy-Org/flux2-klein-9B/resolve/main/split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors) |
| **Diffusion Model** | `diffusion_models/flux-2-klein-base-9b-fp8.safetensors` | [HuggingFace](https://huggingface.co/black-forest-labs/FLUX.2-klein-base-9b-fp8/resolve/main/flux-2-klein-base-9b-fp8.safetensors) |

### Example Directory Structure

```
comfyui_backend/
├── ComfyUI/models/                          # Z-Image models
│   ├── checkpoints/
│   │   └── z-image-turbo-fp8-aio.safetensors
│   └── loras/
│       └── z-image-detailer.safetensors
│
├── flux2-klein-4b/volumes/models/           # FLUX.2 Klein 4B models
│   ├── vae/
│   │   └── flux2-vae.safetensors
│   ├── clip/
│   │   └── qwen_3_4b.safetensors
│   └── diffusion_models/
│       └── flux-2-klein-base-4b-fp8.safetensors
│
└── flux2-klein-9b/volumes/models/           # FLUX.2 Klein 9B models
    ├── vae/
    │   └── flux2-vae.safetensors
    ├── clip/
    │   └── qwen_3_8b_fp8mixed.safetensors
    └── diffusion_models/
        └── flux-2-klein-base-9b-fp8.safetensors
```

> **Note:** The VAE (`flux2-vae.safetensors`) is the same for both Klein 4B and 9B. You can download it once and copy to both locations.

## 🔄 Swapping LoRAs (Z-Image)

The Z-Image Turbo FP8 workflow uses a LoRA for detail enhancement. You can swap it with any compatible LoRA.

### Step 1: Add Your LoRA File

Place your LoRA file in:
```
comfyui_backend/ComfyUI/models/loras/your-lora-name.safetensors
```

### Step 2: Update the Workflow

Edit `comfyui_backend/workflow_to_replace_z_image_fp8.json` and find node `41` (LoraLoader):

```json
"41": {
  "inputs": {
    "lora_name": "z-image-detailer.safetensors",  // ← Change this
    "strength_model": 0.5,
    "strength_clip": 1,
    ...
  },
  "class_type": "LoraLoader"
}
```

Change `lora_name` to your LoRA filename.

### Step 3: Restart the Container

The workflow JSON is mounted as a volume, so just restart:
```bash
cd comfyui_backend
docker-compose restart comfyui workflow-api
```

## Troubleshooting
- **Native module errors** (`better-sqlite3`, `onnxruntime-node`): run `npm run electron:rebuild-native` before building.
- **Black screen in packaged app**: verify `.next/standalone` and `extraResources` are correct; see `docs/BUILD.md`.
- **Missing provider keys**: ensure `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, or `KIMI_API_KEY` is configured in settings or `.env`.
- **Embeddings mismatch errors**: reindex Vector Search from Settings or run `POST /api/vector-sync` with `action: "reindex-all"`.
- **MCP servers not starting**: Node.js is bundled in the app; if you still see ENOENT errors, check that the app was installed from the latest DMG/installer (not copied manually).

## Documentation
- `docs/ARCHITECTURE.md` - system layout and core flows
- `docs/AI_PIPELINES.md` - LLM, embeddings, and tool pipelines
- `docs/DEVELOPMENT.md` - dev setup, scripts, tests, and build process
- `docs/API.md` - internal modules and API endpoints
