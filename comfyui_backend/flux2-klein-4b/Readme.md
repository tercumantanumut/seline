# Flux2 Klein 4B: ComfyUI Docker Deployment with API

Flux2 Klein 4B is a containerized image generation pipeline using Black Forest Labs' FLUX.2 Klein 4B model. It combines ComfyUI with a FastAPI backend for both text-to-image generation and image editing tasks.

## Model Specifications

| Specification | Value |
|---------------|-------|
| **Model** | FLUX.2 Klein Base 4B FP8 |
| **Parameters** | 4 Billion |
| **Text Encoder** | Qwen 3 4B |
| **VAE** | Flux2 VAE |
| **Precision** | FP8 (optimized for speed) |
| **VRAM Requirement** | ~12GB+ recommended |

## Features

- **Text-to-Image Generation**: Generate images from text prompts
- **Image Editing**: Edit existing images using reference images and prompts
- **Async/Polling API**: Non-blocking requests with job status polling (ideal for serverless deployments)
- **CFGGuider**: Uses classifier-free guidance for better prompt adherence

## Ports Configuration

| Service | Internal Port | External Port |
|---------|---------------|---------------|
| API | 5050 | **5051** |
| ComfyUI | 8081 | **8084** |

## Folder Structure

```bash
.
├── api/
│   ├── src/
│   │   ├── router.py          # FastAPI routes (sync endpoints)
│   │   ├── router_parallel.py # Async/polling endpoints
│   │   ├── pipeline.py        # Main processing pipeline
│   │   ├── schema.py          # Pydantic models
│   │   ├── comfy.py           # ComfyUI integration & workflow modification
│   │   ├── job_queue.py       # Redis-based job queue
│   │   └── utils/
│   │       └── logger.py      # Logging utilities
│   ├── app.py                 # FastAPI application
│   ├── config.py              # Configuration settings
│   ├── Dockerfile             # API container
│   └── workflow.json          # ComfyUI workflow template
├── comfy/
│   ├── Dockerfile             # ComfyUI container
│   ├── featuresInstaller.sh   # Setup script
│   └── features.json          # Model download configuration
├── docker-compose.yaml        # Container orchestration
├── Readme.md
└── volumes/
    ├── input/                 # Input images
    ├── models/                # ML models (auto-downloaded)
    └── output/                # Generated images
```

## Models Configuration

The `comfy/features.json` file defines the models to download:

```json
{
  "repositories": [
    {
      "repos": "https://github.com/comfyanonymous/ComfyUI.git",
      "branch": null,
      "outputFolder": "ComfyUI"
    }
  ],
  "models": {
    "vae": [
      {
        "filename": "flux2-vae.safetensors",
        "destination": "models/vae",
        "url": "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors"
      }
    ],
    "clip": [
      {
        "filename": "qwen_3_4b.safetensors",
        "destination": "models/clip",
        "url": "https://huggingface.co/Comfy-Org/flux2-klein-4B/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors"
      }
    ],
    "diffusion_models": [
      {
        "filename": "flux-2-klein-base-4b-fp8.safetensors",
        "destination": "models/diffusion_models",
        "url": "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4b-fp8/resolve/main/flux-2-klein-base-4b-fp8.safetensors"
      }
    ]
  }
}
```

**Note:** The 4B model requires HuggingFace authentication. Set the `HF_TOKEN` environment variable before building.

## Running the Pipeline

### Prerequisites

- Docker with NVIDIA GPU support
- NVIDIA GPU with 12GB+ VRAM
- HuggingFace account with access to FLUX.2 models
- Redis instance (for async job queue)

### 1. Build and Start Services

```bash
# Set HuggingFace token for model downloads
export HF_TOKEN=your_huggingface_token

# Build and start all services
docker-compose build
docker-compose up -d
```

### 2. Verify Services

```bash
# Check container status
docker-compose ps

# Check ComfyUI (port 8084)
curl http://localhost:8084

# Check API health (port 5051)
curl http://localhost:5051/health
```

### Service URLs

| Service | URL |
|---------|-----|
| **API Endpoint** | `http://localhost:5051/flux2/` |
| **API Docs** | `http://localhost:5051/docs` |
| **ComfyUI Interface** | `http://localhost:8084` |

## API Documentation

### Authentication

All API requests require an API key in the header:

```
X-API-Key: your-api-key
```

**Default API Key:** `internal-gateway-key`

### Endpoints

#### POST `/flux2/generate` (Synchronous)

Generate an image synchronously. Best for short requests.

#### POST `/flux2/generate-async` (Asynchronous - Recommended)

Submit a generation job and receive a job ID for polling. Ideal for serverless deployments with timeout limits.

#### GET `/flux2/status/{job_id}`

Poll for job status and retrieve results.

### Request Schema

```json
{
  "prompt": "string (required)",           // Text prompt for generation
  "negative_prompt": "string (optional)",  // Negative prompt (default: "")
  "width": 1024,                           // Image width (text-to-image only)
  "height": 1024,                          // Image height (text-to-image only)
  "steps": 20,                             // Number of inference steps
  "cfg": 3.5,                              // CFG scale
  "seed": -1,                              // Random seed (-1 for random)
  "reference_images": []                   // Array of base64 images for editing
}
```

### Text-to-Image Example

```bash
curl -X POST "http://localhost:5051/flux2/generate-async" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: internal-gateway-key" \
  -d '{
    "prompt": "a beautiful sunset over mountains, photorealistic",
    "width": 1024,
    "height": 1024,
    "steps": 20,
    "cfg": 3.5
  }'
```

**Response:**
```json
{
  "job_id": "abc123-uuid",
  "status": "queued"
}
```

### Image Editing Example

When `reference_images` are provided, the API switches to edit mode. Dimensions are derived from the reference image.

```bash
curl -X POST "http://localhost:5051/flux2/generate-async" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: internal-gateway-key" \
  -d '{
    "prompt": "transform this apple into a golden pear",
    "reference_images": ["base64_encoded_image_data..."],
    "steps": 20,
    "cfg": 3.5
  }'
```

### Polling for Results

```bash
curl "http://localhost:5051/flux2/status/abc123-uuid" \
  -H "X-API-Key: internal-gateway-key"
```

**Response (completed):**
```json
{
  "job_id": "abc123-uuid",
  "status": "completed",
  "result": "base64_encoded_image...",
  "seed": 12345,
  "time_taken": 7.5
}
```

**Response (processing):**
```json
{
  "job_id": "abc123-uuid",
  "status": "processing"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMFYUI_SERVER` | `http://flux2-klein-4b-comfy:8081` | ComfyUI server URL |
| `API_KEY` | `internal-gateway-key` | API authentication key |
| `REDIS_URL` | `redis://api-redis-1:6379/0` | Redis connection URL |
| `JOB_TTL_SECONDS` | `3600` | Job result TTL in Redis |
| `HF_TOKEN` | - | HuggingFace token (build time) |

## Troubleshooting

### Common Issues

#### Model Loading Errors
```bash
# Check ComfyUI logs
docker logs flux2-klein-4b-comfy

# Verify models are downloaded
ls -la volumes/models/diffusion_models/
ls -la volumes/models/clip/
ls -la volumes/models/vae/
```

#### API Connection Issues
```bash
# Check API logs
docker logs flux2-klein-4b-api

# Verify Redis connection
docker exec flux2-klein-4b-api python -c "import redis; r=redis.from_url('redis://api-redis-1:6379/0'); print(r.ping())"
```

#### GPU/CUDA Issues
```bash
# Verify GPU is accessible
docker exec flux2-klein-4b-comfy nvidia-smi
```

### Performance

| Operation | Typical Time |
|-----------|--------------|
| Text-to-Image (1024x1024, 20 steps) | ~7-8 seconds |
| Image Editing (20 steps) | ~10-14 seconds |

## Comparison with 9B Model

| Feature | 4B Model | 9B Model |
|---------|----------|----------|
| Parameters | 4 Billion | 9 Billion |
| Text Encoder | Qwen 3 4B | Qwen 3 8B FP8 Mixed |
| Speed | Faster | Slower |
| Quality | Good | Better detail |
| VRAM Required | ~12GB | ~16GB+ |
| API Port | 5051 | 5052 |
| ComfyUI Port | 8084 | 8085 |
