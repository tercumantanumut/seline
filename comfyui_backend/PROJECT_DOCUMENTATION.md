# InstructDesign Flow - Technical Documentation

## Project Overview

InstructDesign Flow is a fine-tuned FLUX.1 Kontext [dev] model specialized in transforming web interface designs through natural language instructions. The model enables sequential design transformations, style transfers, and mockup generations for web design workflows.

## Training Process

### Dataset Preparation

**Dataset Size**: 937 image pairs with corresponding text instructions

**Data Collection Method**:
- Scraped 5,000+ public web pages
- Generated transformation pairs using automated visual processing
- Created instruction captions using LLM-based annotation
- Multiple rounds of quality refinement and validation

**Training Timeline**:
- Initial training: 3 days (350 pairs, baseline quality)
- Evaluation and dataset refinement: 2 days
- Second training iteration: 3 days (expanded dataset)
- Final training iteration: 6+ days (937 pairs, consolidated dataset)

### Model Architecture

**Base Model**: FLUX.1 Kontext [dev]
**Training Method**: LoRA fine-tuning with distillation approach
**Final Checkpoint**: flux_kontext_lora_v4_consolidated_000010000.safetensors

### Transformation Categories Identified

1. **UI/UX Redesign** (250+ pairs) - Complete interface redesigns and modernization
2. **Style Transformations** (150+ pairs) - Aesthetic and theme applications
3. **Mockup Presentations** (226 pairs) - Device mockups and environmental placement
4. **Interactive Elements** (50+ pairs) - Cursor positioning and interaction states
5. **Content Updates** (37+ pairs) - Dynamic content modifications
6. **Color Schemes** (71+ pairs) - Palette transformations and theme switching
7. **Layout Modifications** (30+ pairs) - Structural and compositional changes

## Technical Implementation

### ComfyUI Workflow Configuration

**Key Parameters**:
- Model: FLUX.1 Kontext [dev] with custom LoRA
- Steps: 20 (default)
- CFG Scale: 1
- Guidance: 5
- Sampler: euler
- Scheduler: simple
- LoRA Strength: 1.0

### API Architecture

**Technology Stack**:
- ComfyUI for model inference
- FastAPI for REST API endpoints
- WebSocket for real-time progress updates
- Docker for containerization
- DeepFloyd-Comfy framework for API wrapper

**Core Features**:
- Queue management with priority handling
- Worker pool for concurrent processing
- Resource monitoring and auto-scaling
- Dead letter queue for failed tasks

### API Endpoints

#### Generation Endpoint
`POST /api/generate`

**Request Parameters**:
```json
{
  "positive_prompt": "transformation instruction",
  "negative_prompt": "things to avoid",
  "input_image": "filename.png | URL | base64",
  "seed": -1,
  "steps": 20,
  "cfg": 1.0,
  "guidance": 5.0,
  "return_base64": false
}
```

**Response**:
```json
{
  "prompt_id": "unique-id",
  "status": "completed",
  "images": ["/path/to/image.png"],
  "images_base64": ["data:image/png;base64,..."]
}
```

#### Status Endpoint
`GET /api/status/{prompt_id}`

#### Image Retrieval
`GET /api/images/{filename}?format=file|base64`

#### Queue Management
- `GET /api/queue/status` - Queue statistics
- `GET /api/queue/{task_id}` - Individual task status

#### Worker Management
- `GET /api/workers/status` - Worker pool status
- `POST /api/workers/pause` - Pause processing
- `POST /api/workers/resume` - Resume processing
- `POST /api/workers/scale` - Manual scaling

#### WebSocket Support
`WS /ws/{prompt_id}` - Real-time progress updates

### Input Image Support

The API accepts images in multiple formats:
1. **Direct filename**: Images in the shared input directory
2. **URL**: Automatic download from web (Unsplash, etc.)
3. **Base64**: Embedded image data in request
4. **Local path**: Reference to mounted files

### Output Options

1. **File paths**: Default response with paths to generated images
2. **Base64 encoded**: Optional inline image data in response
3. **Direct download**: File serving through API endpoint

## Deployment Configuration

### Docker Compose Setup

```yaml
services:
  comfyui:
    image: instructdesign-flow:latest
    volumes:
      - ./ComfyUI/models:/app/ComfyUI/models
      - ./output:/app/ComfyUI/output
      - ./inputs:/app/ComfyUI/input

  workflow-api:
    build: ./deeployd-comfy
    volumes:
      - ./output:/app/outputs
      - ./inputs:/app/inputs
    environment:
      - COMFYUI_HOST=comfyui
      - OUTPUT_DIR=/app/outputs
      - INPUT_DIR=/app/inputs
```

### Volume Structure
- **Models**: Shared model weights (50GB+)
- **Inputs**: Source images for transformation
- **Outputs**: Generated images accessible on host
- All paths use relative mounting (no hardcoding)

### Resource Requirements

- GPU: NVIDIA GPU with 16GB+ VRAM recommended
- RAM: 32GB minimum
- Storage: 50GB for models and dependencies
- Docker & Docker Compose
- NVIDIA Container Toolkit

## Usage Examples

### Basic Transformation
```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "positive_prompt": "Transform to modern dark mode",
    "input_image": "website.png",
    "seed": 42
  }'
```

### URL Input with Base64 Output
```bash
curl -X POST http://localhost:8000/api/generate \
  -d '{
    "positive_prompt": "Add glassmorphism effects",
    "input_image": "https://example.com/design.png",
    "return_base64": true
  }'
```

### Batch Processing
Multiple requests can be queued with priority levels (high/normal/low)

## Performance Metrics

**Inference Speed**: ~45-70 seconds per transformation (GPU)
**Queue Processing**: Up to 4 concurrent workers
**Quality Assessment**: Manual evaluation across 100+ test cases
**Consistency Rate**: 85%+ instruction adherence
**API Response Time**: <100ms for queuing, real-time WebSocket updates

## Development Timeline

- **Week 1-2**: Data collection and initial dataset preparation
- **Week 3**: First training iteration and evaluation
- **Week 4**: Dataset refinement based on evaluation results
- **Week 5**: Second training iteration
- **Week 6-7**: Final training and model optimization
- **Week 8**: API development and deployment setup
- **Week 9**: DeepFloyd-Comfy integration and queue management
- **Week 10**: Production deployment and optimization

## Technical Challenges Addressed

1. **Dataset Quality**: Iterative refinement process to improve caption accuracy
2. **Training Stability**: Multiple restarts to optimize convergence
3. **Inference Optimization**: Workflow configuration for optimal quality/speed balance
4. **API Design**: Balancing flexibility with ease of use
5. **Container Integration**: Seamless Docker Compose orchestration
6. **Input Flexibility**: Supporting multiple image input formats
7. **Output Accessibility**: Direct host mounting for generated files

## Repository Structure

```
/home/ubuntu/webflow-demo/
├── workflow_api.json              # ComfyUI workflow (API format)
├── docker-compose.yml             # Multi-container orchestration
├── deeployd-comfy/                # API infrastructure
│   ├── src/api/
│   │   ├── workflow_executor.py  # Core execution logic
│   │   ├── workflow_api.py       # FastAPI endpoints
│   │   ├── task_queue.py         # Queue management
│   │   └── worker_service.py     # Worker pool
│   └── docker/api/Dockerfile     # API container
├── build/
│   ├── api_config.json           # API configuration
│   └── docker_run.sh             # Build scripts
├── inputs/                        # Source images
├── output/                        # Generated images
└── ComfyUI/models/               # Model weights
    ├── unet/                     # FLUX base model
    ├── loras/                    # LoRA checkpoint
    ├── clip/                     # Text encoders
    └── vae/                      # VAE decoder
```

## Current Status

✅ **Completed**:
- Model training and optimization
- ComfyUI workflow configuration
- DeepFloyd-Comfy API integration
- Docker containerization
- Queue and worker management
- Multiple input format support
- Base64 output option
- Host volume mounting

🚧 **Next Steps**:
- Frontend web interface development


## API Testing

The complete system has been tested with:
- Local image files
- URL downloads (Unsplash, etc.)
- Base64 encoded inputs
- Various transformation prompts
- Concurrent request handling
- Queue prioritization
- Worker scaling

## Acknowledgments

This project represents approximately 10 weeks of iterative development, with continuous refinement of both the dataset and training methodology to achieve production-quality results for web design transformation tasks. The integration of DeepFloyd-Comfy provides enterprise-grade API infrastructure for scalable deployment.