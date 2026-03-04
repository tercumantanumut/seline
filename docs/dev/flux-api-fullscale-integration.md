# FLUX API Full-Scale Integration Plan

> **Status**: Research complete, ready for implementation
> **Date**: 2026-03-04
> **Scope**: Direct BFL API integration, onboarding, UI/UX, tool registration

---

## 1. Current State Audit

### What exists today

| Integration | Route | Backend | API Key | Status |
|---|---|---|---|---|
| FLUX.2 Klein 4B (local) | ComfyUI Docker → `localhost:5051` | `lib/comfyui/flux2-klein-client.ts` | None (local) | ✅ Working |
| FLUX.2 Klein 9B (local) | ComfyUI Docker → `localhost:5052` | `lib/comfyui/flux2-klein-client.ts` | None (local) | ✅ Working |
| FLUX.2 Flex (cloud) | OpenRouter → `black-forest-labs/flux.2-flex` | `lib/ai/tools/openrouter-image-tools.ts` | `OPENROUTER_API_KEY` | ✅ Working |
| Legacy Flux2 (cloud) | STYLY IO API | `lib/ai/tools/image-tools.ts` | `STYLY_AI_API_KEY` | ⚠️ Legacy, gated |

### What's missing (the gap)

- **No direct BFL API integration** — zero occurrences of `BFL_API_KEY` in the codebase
- **No FLUX.2 Max** — the flagship model
- **No FLUX.2 Pro** — the production-grade model (fixed + preview)
- **No FLUX Kontext Pro/Max** — the most versatile editing models
- **No FLUX 1.1 Pro / Ultra** — high-quality + ultra-high-res
- **No FLUX Fill (inpainting) / Expand (outpainting)**
- **No BFL API key settings UI** — no onboarding flow
- **No credit balance check** — BFL provides `/v1/credits` endpoint

### Files that will be touched or created

```
lib/bfl/                              # NEW — BFL API client
  client.ts                           # Core HTTP client (submit, poll, download)
  types.ts                            # Request/response types for all endpoints
  endpoints.ts                        # Endpoint registry + model metadata

lib/ai/tools/
  bfl-flux2-tools.ts                  # NEW — FLUX.2 Max/Pro/Flex tools
  bfl-kontext-tools.ts                # NEW — Kontext Pro/Max tools
  bfl-flux11-tools.ts                 # NEW — FLUX 1.1 Pro/Ultra tools
  bfl-flux-fill-tools.ts              # NEW — Fill (inpaint) / Expand (outpaint) tools

lib/ai/tool-registry/
  register-image-video-tools.ts       # MODIFY — register new BFL tools

components/settings/
  bfl-api-settings.tsx                # NEW — BFL API key input + credit balance
  settings-panel.tsx                  # MODIFY — add BFL section

locales/en.json                       # MODIFY — add tool labels
locales/tr.json                       # MODIFY — add tool labels
components/ui/tool-badge.tsx          # MODIFY — add tool category mappings
```

---

## 2. BFL API Reference (Complete Catalogue)

### Base Configuration

```
Base URL:     https://api.bfl.ai
Auth Header:  x-key: <BFL_API_KEY>
Pattern:      Async (POST submit → GET poll → download result)
Result TTL:   10 minutes (must download immediately)
CORS:         None on delivery URLs (must proxy/download server-side)
Rate Limit:   24 concurrent tasks (6 for kontext-max)
```

### Regional Endpoints

| Endpoint | Use Case |
|---|---|
| `api.bfl.ai` | Global (auto-routes, recommended) |
| `api.eu.bfl.ai` | EU-only (GDPR compliant) |
| `api.us.bfl.ai` | US-only |

### Generation Endpoints (text-to-image + multi-reference editing)

| Endpoint | Model | Description | Price (1st MP / add'l MP / ref MP) |
|---|---|---|---|
| `/v1/flux-2-max` | FLUX.2 [max] | Flagship, best quality | $0.07 / $0.03 / $0.03 |
| `/v1/flux-2-pro-preview` | FLUX.2 [pro] preview | Latest, continuously updated | $0.03 / $0.015 / $0.015 |
| `/v1/flux-2-pro` | FLUX.2 [pro] | Fixed snapshot, reproducible | $0.03 / $0.015 / $0.015 |
| `/v1/flux-2-flex` | FLUX.2 [flex] | Customizable, text-heavy design | $0.05 flat per MP |
| `/v1/flux-2-klein-4b` | FLUX.2 [klein] 4B | Sub-second, cheapest | $0.014 / $0.001 / $0.001 |
| `/v1/flux-2-klein-9b` | FLUX.2 [klein] 9B | Fast, higher quality | $0.015 / $0.002 / $0.002 |

### Kontext Endpoints (context-aware generation + editing)

| Endpoint | Model | Description | Concurrency |
|---|---|---|---|
| `/v1/flux-kontext-pro` | FLUX.1 Kontext [pro] | Context-aware gen + editing | 24 |
| `/v1/flux-kontext-max` | FLUX.1 Kontext [max] | Advanced context editing | **6** |

### Legacy 1.x Endpoints

| Endpoint | Model | Description |
|---|---|---|
| `/v1/flux-pro-1.1-ultra` | FLUX1.1 [pro] Ultra | Up to 4MP, Raw mode for photography |
| `/v1/flux-pro-1.1` | FLUX1.1 [pro] | Fast, reliable standard |
| `/v1/flux-pro` | FLUX.1 [pro] | Original |
| `/v1/flux-dev` | FLUX.1 [dev] | Developer/testing |

### Specialty Endpoints

| Endpoint | Model | Description |
|---|---|---|
| `/v1/flux-pro-1.0-fill` | FLUX.1 Fill [pro] | Inpainting (mask-based editing) |
| `/v1/flux-pro-1.0-expand` | FLUX.1 Expand [pro] | Outpainting (expand beyond boundaries) |

### Utility Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/v1/credits` | GET | Check credit balance |
| `/v1/get_result` | GET | Poll for generation result |

### Pricing Notes

- 1 megapixel = 1024×1024 pixels
- Resolution rounded up to next MP (separately for generated + each reference)
- Images exceeding 4 MP are resized to 4 MP
- Multiple reference images: each counted as 1 MP minimum

---

## 3. API Flow (Critical for Implementation)

### Submit → Poll → Download

```typescript
// 1. Submit generation request
const submitResponse = await fetch('https://api.bfl.ai/v1/flux-2-pro-preview', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-key': BFL_API_KEY,
  },
  body: JSON.stringify({
    prompt: 'A serene landscape with mountains',
    width: 1440,
    height: 2048,
    // For editing: include image_url or images array
  }),
});

const { id, polling_url } = await submitResponse.json();
// CRITICAL: Must use polling_url, not hardcoded endpoint

// 2. Poll for result (use polling_url from response)
let result;
while (true) {
  await sleep(500);
  const pollResponse = await fetch(polling_url, {
    headers: { 'x-key': BFL_API_KEY },
  });
  result = await pollResponse.json();

  if (result.status === 'Ready') break;
  if (result.status === 'Error' || result.status === 'Failed') throw new Error(result);
}

// 3. Download image immediately (10-min expiry, no CORS)
const imageUrl = result.result.sample;
const imageResponse = await fetch(imageUrl);
const imageBuffer = await imageResponse.arrayBuffer();
// Save to local storage, serve from own infrastructure
```

### Key Constraints

1. **polling_url is mandatory** — The API returns a `polling_url` in the submit response. You MUST use this URL for polling, not construct your own.
2. **10-minute expiry** — Downloaded URLs expire. Must download and re-host immediately.
3. **No CORS** — Delivery URLs (`delivery-eu.bfl.ai`, `delivery-us.bfl.ai`) don't support CORS. Server-side download only.
4. **Rate limits** — 429 status code with exponential backoff. Max 24 concurrent (6 for kontext-max).
5. **Credits** — 402 status means insufficient credits. Surface to user.

---

## 4. Implementation Plan

### Phase 1: Core BFL Client (`lib/bfl/`)

**Priority: HIGH — foundation for everything else**

#### `lib/bfl/types.ts`

Define request/response types for all endpoints:

```typescript
// Shared
interface BflSubmitResponse {
  id: string;
  polling_url: string;
}

interface BflPollResponse {
  id: string;
  status: 'Pending' | 'Processing' | 'Ready' | 'Error' | 'Failed' | 'Moderated';
  result?: {
    sample: string;        // Signed URL (10-min TTL)
    prompt: string;
    seed: number;
    has_nsfw_concepts: boolean[];
  };
}

interface BflCreditsResponse {
  credits: number;
}

// FLUX.2 Generation
interface Flux2GenerationRequest {
  prompt: string;
  width?: number;          // 256-2048 (must match aspect ratio constraints)
  height?: number;
  seed?: number;
  safety_tolerance?: number;
  output_format?: 'jpeg' | 'png';
  webhook_url?: string;
  webhook_secret?: string;
}

// FLUX.2 Editing (multi-reference)
interface Flux2EditingRequest extends Flux2GenerationRequest {
  image_url?: string;      // Single reference
  images?: Array<{         // Multi-reference (up to 10)
    url: string;
  }>;
  image_prompt?: string;   // Per-image prompt
}

// Kontext
interface KontextRequest {
  prompt: string;
  image_url?: string;      // Optional for editing mode
  seed?: number;
  aspect_ratio?: string;
  safety_tolerance?: number;
  output_format?: 'jpeg' | 'png';
}

// Fill (Inpainting)
interface FillRequest {
  prompt: string;
  image_url: string;       // Source image
  mask_url: string;        // Mask image (white = edit, black = keep)
  seed?: number;
  safety_tolerance?: number;
  output_format?: 'jpeg' | 'png';
}

// Expand (Outpainting)
interface ExpandRequest {
  prompt: string;
  image_url: string;
  top?: number;            // Pixels to expand in each direction
  bottom?: number;
  left?: number;
  right?: number;
  seed?: number;
  safety_tolerance?: number;
  output_format?: 'jpeg' | 'png';
}

// Ultra mode
interface UltraRequest {
  prompt: string;
  seed?: number;
  aspect_ratio?: string;   // "1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"
  safety_tolerance?: number;
  output_format?: 'jpeg' | 'png';
  raw?: boolean;           // Raw mode for photography aesthetics
}
```

#### `lib/bfl/client.ts`

Core client with submit/poll/download pattern:

```typescript
export class BflClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, options?: { region?: 'global' | 'eu' | 'us' }) {
    this.apiKey = apiKey;
    this.baseUrl = {
      global: 'https://api.bfl.ai',
      eu: 'https://api.eu.bfl.ai',
      us: 'https://api.us.bfl.ai',
    }[options?.region ?? 'global'];
  }

  // Submit a generation request to any endpoint
  async submit(endpoint: string, params: Record<string, unknown>): Promise<BflSubmitResponse>;

  // Poll using the polling_url from submit response
  async poll(pollingUrl: string): Promise<BflPollResponse>;

  // Submit + poll + download (full pipeline)
  async generate(endpoint: string, params: Record<string, unknown>, options?: {
    maxAttempts?: number;
    pollIntervalMs?: number;
    onProgress?: (status: string) => void;
  }): Promise<{ image: Buffer; seed: number; hasNsfw: boolean }>;

  // Download image from delivery URL (10-min TTL)
  async downloadResult(sampleUrl: string): Promise<Buffer>;

  // Check credit balance
  async getCredits(): Promise<number>;
}
```

#### `lib/bfl/endpoints.ts`

Endpoint registry with metadata:

```typescript
export const BFL_ENDPOINTS = {
  // FLUX.2 family
  'flux-2-max':         { path: '/v1/flux-2-max', family: 'flux2', tier: 'flagship', maxConcurrent: 24 },
  'flux-2-pro-preview': { path: '/v1/flux-2-pro-preview', family: 'flux2', tier: 'production', maxConcurrent: 24 },
  'flux-2-pro':         { path: '/v1/flux-2-pro', family: 'flux2', tier: 'production', maxConcurrent: 24 },
  'flux-2-flex':        { path: '/v1/flux-2-flex', family: 'flux2', tier: 'creative', maxConcurrent: 24 },
  'flux-2-klein-4b':    { path: '/v1/flux-2-klein-4b', family: 'flux2', tier: 'fast', maxConcurrent: 24 },
  'flux-2-klein-9b':    { path: '/v1/flux-2-klein-9b', family: 'flux2', tier: 'fast', maxConcurrent: 24 },

  // Kontext family
  'flux-kontext-pro':   { path: '/v1/flux-kontext-pro', family: 'kontext', tier: 'production', maxConcurrent: 24 },
  'flux-kontext-max':   { path: '/v1/flux-kontext-max', family: 'kontext', tier: 'flagship', maxConcurrent: 6 },

  // FLUX 1.1 family
  'flux-pro-1.1-ultra': { path: '/v1/flux-pro-1.1-ultra', family: 'flux1.1', tier: 'ultra', maxConcurrent: 24 },
  'flux-pro-1.1':       { path: '/v1/flux-pro-1.1', family: 'flux1.1', tier: 'standard', maxConcurrent: 24 },

  // Specialty
  'flux-pro-1.0-fill':   { path: '/v1/flux-pro-1.0-fill', family: 'tools', tier: 'specialty', maxConcurrent: 24 },
  'flux-pro-1.0-expand': { path: '/v1/flux-pro-1.0-expand', family: 'tools', tier: 'specialty', maxConcurrent: 24 },

  // Legacy
  'flux-pro':           { path: '/v1/flux-pro', family: 'flux1', tier: 'legacy', maxConcurrent: 24 },
  'flux-dev':           { path: '/v1/flux-dev', family: 'flux1', tier: 'legacy', maxConcurrent: 24 },
} as const;
```

---

### Phase 2: AI Tool Definitions

**Priority: HIGH — what agents actually call**

Create tool files following the existing pattern in `lib/ai/tools/`:

#### Tool Mapping (what to build)

| Tool Name | BFL Endpoint | Capability |
|---|---|---|
| `generateImageFlux2Max` | `/v1/flux-2-max` | Text-to-image, flagship quality |
| `editImageFlux2Max` | `/v1/flux-2-max` | Multi-reference editing (up to 10 images) |
| `generateImageFlux2Pro` | `/v1/flux-2-pro-preview` | Production text-to-image |
| `editImageFlux2Pro` | `/v1/flux-2-pro-preview` | Production multi-reference editing |
| `generateImageKontextPro` | `/v1/flux-kontext-pro` | Context-aware generation |
| `editImageKontextPro` | `/v1/flux-kontext-pro` | Context-aware editing |
| `generateImageKontextMax` | `/v1/flux-kontext-max` | Advanced context generation |
| `editImageKontextMax` | `/v1/flux-kontext-max` | Advanced context editing |
| `generateImageFlux11Ultra` | `/v1/flux-pro-1.1-ultra` | Ultra-high-res + Raw mode |
| `generateImageFlux11Pro` | `/v1/flux-pro-1.1` | Fast, reliable |
| `inpaintImageFluxFill` | `/v1/flux-pro-1.0-fill` | Mask-based inpainting |
| `expandImageFluxExpand` | `/v1/flux-pro-1.0-expand` | Outpainting |

#### Implementation Pattern (follow existing convention)

Each tool file should:
1. Import `tool`, `jsonSchema` from `"ai"`
2. Import `BflClient` from `@/lib/bfl/client`
3. Import `saveBase64Image` from `@/lib/storage/local-storage` (for saving results)
4. Define typed input/output interfaces
5. Export a `create*Tool(sessionId: string)` factory function
6. Handle the submit → poll → download → save pipeline
7. Return `{ status, images: [{ url }], seed, error }` consistent with existing tools

#### Key Design Decision: BFL API Key Resolution

The BFL API key should be resolved at tool execution time (not registration time), following the same pattern as OpenRouter tools:

```typescript
function getBflApiKey(): string {
  const key = process.env.BFL_API_KEY;
  if (!key) throw new Error('BFL_API_KEY not configured. Add it in Settings → Image Generation → BFL API.');
  return key;
}
```

---

### Phase 3: Tool Registry Registration

**Priority: HIGH — makes tools discoverable**

Update `lib/ai/tool-registry/register-image-video-tools.ts`:

```typescript
// BFL Direct API Tools
// Gated by BFL_API_KEY env var

registry.register("generateImageFlux2Max", {
  displayName: "Generate Image (FLUX.2 Max)",
  category: "image-generation",
  keywords: ["generate", "create", "image", "flux", "flux2", "max", "flagship", "best quality", "bfl"],
  shortDescription: "Flagship image generation via BFL FLUX.2 Max API",
  fullInstructions: `## FLUX.2 Max (BFL API Direct)
Flagship model. Best quality, multi-reference editing (up to 10 images). $0.07/MP.`,
  loading: { deferLoading: true },
  requiresSession: true,
  enableEnvVar: "BFL_API_KEY",
}, ({ sessionId }) => createFlux2MaxGenerateTool(sessionId!));

// ... repeat for all tools
```

---

### Phase 4: Settings UI & Onboarding

**Priority: HIGH — users need this to use BFL API**

#### Settings: `components/settings/bfl-api-settings.tsx`

Add a new settings section for BFL API configuration:

```
┌─────────────────────────────────────────────┐
│  🖼️  Black Forest Labs (FLUX) API          │
│                                             │
│  API Key                                    │
│  ┌─────────────────────────────────────┐    │
│  │ ••••••••••••••••••••                │    │
│  └─────────────────────────────────────┘    │
│  Get your key at api.bfl.ai                 │
│                                             │
│  Credit Balance: $12.45                     │
│  [Check Balance]                            │
│                                             │
│  Region                                     │
│  ○ Global (recommended)                     │
│  ○ EU (GDPR)                               │
│  ○ US                                       │
│                                             │
│  ─ Available Models ─────────────────       │
│  ✓ FLUX.2 Max (flagship, $0.07/MP)         │
│  ✓ FLUX.2 Pro (production, $0.03/MP)       │
│  ✓ FLUX Kontext Pro (editing, context)     │
│  ✓ FLUX Kontext Max (adv. editing)         │
│  ✓ FLUX 1.1 Pro Ultra (4MP, raw mode)      │
│  ✓ FLUX Fill (inpainting)                  │
│  ✓ FLUX Expand (outpainting)               │
└─────────────────────────────────────────────┘
```

#### Key design points:

1. **BFL_API_KEY stored in settings.json** — same pattern as `huggingFaceToken`
2. **Credit balance check** — call `/v1/credits` on demand, display result
3. **Region selector** — global/eu/us, stored in settings
4. **Model toggle** — enable/disable individual models to reduce tool clutter
5. **Link to BFL signup** — direct link to `https://api.bfl.ai` for key creation

#### Settings persistence:

```typescript
// In settings.json (same location as huggingFaceToken)
{
  "bflApiKey": "bfl-...",
  "bflRegion": "global",        // "global" | "eu" | "us"
  "bflEnabledModels": [         // Which tools to register
    "flux-2-max",
    "flux-2-pro-preview",
    "flux-kontext-pro",
    "flux-kontext-max",
    "flux-pro-1.1-ultra",
    "flux-pro-1.0-fill",
    "flux-pro-1.0-expand"
  ]
}
```

#### Environment variable injection:

When a BFL API key is saved in settings, inject `BFL_API_KEY` into `process.env` so tool registration `enableEnvVar` checks pass. Follow the same pattern used for `OPENROUTER_API_KEY`.

---

### Phase 5: Localization & UI Polish

**Priority: MEDIUM**

#### `locales/en.json` additions:

```json
{
  "tools": {
    "generateImageFlux2Max": { "label": "Generate (FLUX.2 Max)", "description": "Flagship image generation via BFL API" },
    "editImageFlux2Max": { "label": "Edit (FLUX.2 Max)", "description": "Multi-reference image editing via BFL API" },
    "generateImageFlux2Pro": { "label": "Generate (FLUX.2 Pro)", "description": "Production image generation via BFL API" },
    "editImageFlux2Pro": { "label": "Edit (FLUX.2 Pro)", "description": "Production image editing via BFL API" },
    "generateImageKontextPro": { "label": "Generate (Kontext Pro)", "description": "Context-aware generation via BFL API" },
    "editImageKontextPro": { "label": "Edit (Kontext Pro)", "description": "Context-aware editing via BFL API" },
    "generateImageKontextMax": { "label": "Generate (Kontext Max)", "description": "Advanced context generation via BFL API" },
    "editImageKontextMax": { "label": "Edit (Kontext Max)", "description": "Advanced context editing via BFL API" },
    "generateImageFlux11Ultra": { "label": "Generate (FLUX 1.1 Ultra)", "description": "Ultra-high-res generation (4MP, Raw mode)" },
    "generateImageFlux11Pro": { "label": "Generate (FLUX 1.1 Pro)", "description": "Fast, reliable generation via BFL API" },
    "inpaintImageFluxFill": { "label": "Inpaint (FLUX Fill)", "description": "Mask-based inpainting via BFL API" },
    "expandImageFluxExpand": { "label": "Expand (FLUX Expand)", "description": "Outpainting via BFL API" }
  }
}
```

#### `components/ui/tool-badge.tsx` additions:

```typescript
// Add to TOOL_CATEGORIES
generateImageFlux2Max: "image-generation",
editImageFlux2Max: "image-editing",
generateImageFlux2Pro: "image-generation",
editImageFlux2Pro: "image-editing",
generateImageKontextPro: "image-generation",
editImageKontextPro: "image-editing",
generateImageKontextMax: "image-generation",
editImageKontextMax: "image-editing",
generateImageFlux11Ultra: "image-generation",
generateImageFlux11Pro: "image-generation",
inpaintImageFluxFill: "image-editing",
expandImageFluxExpand: "image-editing",
```

---

## 5. UX & Onboarding Considerations

### First-time experience

1. User opens Settings → sees "Black Forest Labs (FLUX)" section
2. Empty state: "Enter your BFL API key to unlock FLUX image generation models"
3. Link to `https://api.bfl.ai` — "Get your free API key"
4. After entering key → immediate credit balance check (validates key)
5. Success state: shows credit balance + available models
6. Models auto-enabled by default (user can toggle off)

### In-chat experience

1. Agent discovers BFL tools via `searchTools` (deferred loading)
2. Tools show with appropriate badges (e.g., "FLUX.2 Max" in image-generation category)
3. Generation shows progress: "Submitting..." → "Processing..." → "Ready"
4. Image displayed inline with metadata (model, seed, cost estimate)

### Error states

| Error | User-facing message | Action |
|---|---|---|
| No API key | "BFL API key required. Add it in Settings → Image Generation." | Link to settings |
| 402 (no credits) | "Insufficient BFL credits. Top up at api.bfl.ai" | Link to BFL dashboard |
| 429 (rate limit) | "Too many concurrent requests. Retrying..." | Auto-retry with backoff |
| 422 (validation) | Surface the actual validation error from BFL | Show error details |
| Result expired | "Image expired before download. Regenerating..." | Auto-retry |
| Network error | "BFL API unreachable. Check connection." | Retry button |

### Cost transparency

Show estimated cost before generation (optional, based on dimensions):
```
Generating with FLUX.2 Pro (1024×1024) — est. ~$0.03
```

---

## 6. Architecture Decisions

### Direct BFL API vs. OpenRouter

**Decision: Support both.**

- **Direct BFL API** → Cheaper, full endpoint access, credit-based, regional control
- **OpenRouter** → Unified key, but only FLUX.2 Flex available, markup pricing

The existing OpenRouter Flux.2 Flex integration stays as-is. The new BFL direct integration adds all the endpoints OpenRouter doesn't expose.

### Local ComfyUI Klein vs. BFL API Klein

**Decision: Keep both.**

- **Local Klein** → Free (no API cost), private, requires GPU + Docker
- **BFL API Klein** → $0.014-0.015/image, no GPU required, instant

The local Klein tools are already gated by `FLUX2_KLEIN_4B_ENABLED` / `FLUX2_KLEIN_9B_ENABLED`. The BFL API Klein tools would be gated by `BFL_API_KEY`. No conflict — user gets whichever they've configured.

### Image download strategy

**Decision: Server-side download + local storage.**

BFL delivery URLs have no CORS and expire in 10 minutes. The tool execution pipeline must:
1. Poll until Ready
2. Immediately `fetch()` the `result.sample` URL server-side
3. Save to local storage via `saveBase64Image()` (existing pattern)
4. Return the local `/api/media/...` URL to the agent

This matches exactly how the local ComfyUI tools work today.

### Webhook support (future)

BFL supports `webhook_url` + `webhook_secret` on submit. This would eliminate polling overhead for high-volume use. Not in scope for initial integration but the client should accept these params.

---

## 7. Implementation Order

```
Phase 1: lib/bfl/types.ts + client.ts + endpoints.ts
         ↓
Phase 2: lib/ai/tools/bfl-*.ts (all tool files)
         ↓
Phase 3: register-image-video-tools.ts (registry entries)
         ↓
Phase 4: Settings UI (bfl-api-settings.tsx) + env injection
         ↓
Phase 5: locales/*.json + tool-badge.tsx
         ↓
Phase 6: Testing (typecheck + manual generation test)
```

Each phase is independently shippable. Phase 1-3 can land together as the core PR. Phase 4-5 as the UI/onboarding PR.

---

## 8. Testing Checklist

- [ ] BflClient.submit() returns valid `{ id, polling_url }`
- [ ] BflClient.poll() correctly handles all status values
- [ ] BflClient.downloadResult() successfully downloads from delivery URL
- [ ] BflClient.getCredits() returns credit balance
- [ ] Each tool generates and saves image to local storage
- [ ] Tools handle 402 (no credits) gracefully
- [ ] Tools handle 429 (rate limit) with retry
- [ ] Tools handle 422 (validation) with user-friendly error
- [ ] Settings UI saves/loads BFL API key
- [ ] Credit balance check works from settings
- [ ] Region selection persists and affects API calls
- [ ] Tools only appear when BFL_API_KEY is set
- [ ] Deferred loading via searchTools works for all new tools
- [ ] Localization keys render in both en and tr

---

## 9. External References

- BFL API Docs: https://docs.bfl.ai
- BFL OpenAPI Spec: https://api.bfl.ai/openapi.json
- BFL Pricing: https://bfl.ai/pricing
- BFL API Key: https://api.bfl.ai (sign up)
- BFL MCP Server: https://docs.bfl.ai/api_integration/mcp_integration
- FLUX.2 GitHub: https://github.com/black-forest-labs/flux2
- BFL Integration Guide: https://docs.bfl.ai/api_integration/integration_guidelines
