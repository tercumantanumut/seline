# Z-Image Turbo FP8

🏆 **High-Performance Image Generation with Z-Image Turbo FP8**

<div align="center">
  <p><i>Generate high-quality images at blazing speeds (9 steps)</i></p>
</div>

## 🎯 Project Overview

Z-Image Turbo FP8 is a high-performance ComfyUI backend optimized for speed and quality. Using a single AIO checkpoint and specialized LoRA, it provides high-quality text-to-image generation in just 9 steps.

### Key Features
- **100+ Pre-defined Design Presets**: From dark mode to cyberpunk themes
- **Natural Language Control**: Describe changes in plain English
- **Consistent Transformations**: 85%+ instruction adherence rate
- **End-to-End Pipeline Development for Production**: Dockerized with automatic model downloads

## 📊 Dataset & Training

### Training Dataset
- **Dataset Repository**: [HuggingFace - instructdesign-kontext](https://huggingface.co/datasets/tercumantanumut/instructdesign-kontext)
- **Size**: 937 webpage transformation pairs
- **Sample Available**: 100 representative pairs publicly available
- **Format**: Original screenshots + transformed outputs + text instructions
- **Coverage**: UI/UX redesigns, theme changes, layout modifications, style transfers

### Training Infrastructure
- **Training Framework**: [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit)
- **Configuration**: [`flux_kontext_training_v4_consolidated.yaml`](https://github.com/tercumantanumut/InstructDesign-Flow/blob/main/training_config.yaml)
- **Development Time**: 7 days
- **Hardware**: NVIDIA H100 GPU with 80GB VRAM
- **Training Steps**: 16,000
- **Checkpoints Saved**: Every 1000 steps

### Training Configuration Details
```yaml
Model Architecture:
  Base Model: black-forest-labs/FLUX.1-Kontext-dev
  Type: LoRA (Low-Rank Adaptation)
  Rank: 256
  Alpha: 256

Training Parameters:
  Batch Size: 2
  Learning Rate: 7e-5
  Optimizer: AdamW 8-bit
  Gradient Accumulation: 1
  Noise Scheduler: FlowMatch
  Timestep Type: Sigmoid
  Resolution: [512, 768, 1024]

Dataset Settings:
  Caption Dropout: 5%
  Cache Latents: True
  Control Images: _original.jpg suffix
  Output Images: _output.jpg suffix
```

### Model Artifacts
- **Model Repository**: [HuggingFace - instructdesign-kontext](https://huggingface.co/tercumantanumut/instructdesign-kontext)
- **LoRA Weights**: `flux_kontext_lora_v4_consolidated_000010000.safetensors`
- **Base Model**: `flux1-kontext-dev.safetensors`
- **Text Encoders**: CLIP-L + T5-XXL (FP8)
- **VAE**: `ae.safetensors`

## 🚀 Quick Start

### Prerequisites
- NVIDIA GPU (16GB+ VRAM recommended)
- Docker & Docker Compose
- NVIDIA Container Toolkit
- ~100GB disk space (for models and Docker images)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/tercumantanumut/Z-Image-Turbo-FP8
cd Z-Image-Turbo-FP8
```

2. Start the services (models download automatically):
```bash
docker-compose up -d
```

The services will be available at:
- API: `http://localhost:8000`
- ComfyUI: `http://localhost:8188`
- Frontend: `http://localhost:3000` (if running)

## 🎨 Transformation Capabilities

### Pre-trained Transformation Types
1. **Theme Changes**: Dark mode, light mode, high contrast
2. **Design Systems**: Material Design, iOS, Windows Metro
3. **Style Effects**: Glassmorphism, neumorphism, brutalism
4. **Layout Modifications**: Mobile-first, dashboard, e-commerce
5. **Industry Specific**: SaaS, portfolio, blog, landing page
6. **Creative Themes**: Cyberpunk, retro, minimalist, maximalist
7. **Device Mockups**: iPhone, MacBook, billboard placements
8. **Accessibility**: High contrast, larger fonts, better spacing

## 📡 API Usage

### Basic Generation
```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "positive_prompt": "a beautiful sunset over a calm lake, mountain range in distance, highly detailed, photorealistic",
    "steps": 9,
    "cfg": 1.0,
    "width": 1024,
    "height": 1024
  }'
```

### Using Presets
```bash
curl -X POST http://localhost:8000/api/generate \
  -d '{
    "positive_prompt": "Apply glassmorphism_ui aesthetic",
    "input_image": "https://example.com/screenshot.png",
    "return_base64": true
  }'
```

### Batch Processing
```python
import requests
import json

presets = ["dark_mode", "mobile_responsive", "minimalist_clean"]
for preset in presets:
    response = requests.post("http://localhost:8000/api/generate",
        json={
            "positive_prompt": f"Apply {preset} transformation",
            "input_image": "test.png",
            "seed": 42
        })
    print(f"{preset}: {response.json()}")
```

## 🔧 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Generate transformation |
| `/api/status/{prompt_id}` | GET | Check generation status |
| `/api/images/{filename}` | GET | Download generated image |
| `/api/queue/status` | GET | View queue statistics |
| `/health` | GET | Service health check |
| `/docs` | GET | Interactive API documentation |

## 📁 Project Structure

```
InstructDesign-Flow/
├── docker-compose.yml         # Service orchestration
├── build/
│   └── Dockerfile            # ComfyUI + models container
├── workflow_api.json         # ComfyUI workflow definition
├── inputs/                   # Input images directory
├── output/                   # Generated outputs
├── deeployd-comfy/          # DeepFloyd-Comfy API wrapper (my own deployment framework)
├── comfyui-deploy-next-example/ # Frontend application
└── training/
    └── config.yaml          # Training configuration
```

## 🐳 Docker Architecture

### Services
1. **comfyui-instructdesign**: GPU-accelerated inference server
   - Automatic model downloads (~12GB)
   - ComfyUI with custom nodes
   - CUDA 12.8 optimized

2. **instructdesign-api**: FastAPI wrapper
   - Queue management
   - WebSocket support
   - Priority task processing

## 🔬 Technical Details

### Model Specifications
- **Base Model**: FLUX.1 Kontext [dev]
- **Fine-tuning Method**: LoRA with rank 256
- **Training Duration**: 10,000 steps
- **Inference Time**: 45-70 seconds per 1024x1024 image
- **VRAM Usage**: ~14GB during inference
- **Consistency**: 85%+ instruction following

### Performance Metrics
- **Queue Capacity**: 1000 concurrent tasks
- **Worker Threads**: Auto-scaling 1-4
- **Average Latency**: 55 seconds
- **Success Rate**: 95%+
- **Supported Formats**: PNG, JPEG, WebP

## 🎓 Example Transformations

### From Training Dataset
```
"Transform this webpage to dark mode with purple accents"
"Apply material design 3 principles with rounded corners"
"Convert to cyberpunk aesthetic with neon colors"
"Make this mobile-responsive with touch-friendly buttons"
"Add glassmorphism effects to all card elements"
```

### Advanced Prompts
```
"Redesign this interface for accessibility, increasing contrast
 and font sizes while maintaining the original brand colors"

"Transform this desktop layout to a mobile-first design with
 hamburger navigation and thumb-friendly interaction zones"

"Apply a premium SaaS aesthetic with gradient backgrounds,
 subtle shadows, and modern typography"
```

## 🛠️ Development

### Training Your Own Model

1. Prepare your dataset:
   - Collect webpage screenshots (original)
   - Create transformed versions (output)
   - Write transformation descriptions (captions)

2. Configure training:
```bash
git clone https://github.com/ostris/ai-toolkit
cd ai-toolkit
# Copy our training config
cp /path/to/flux_kontext_training_v4_consolidated.yaml config/
```

3. Start training:
```bash
python run.py config/flux_kontext_training_v4_consolidated.yaml
```

### Monitoring Training

```bash
# TensorBoard logs
tensorboard --logdir=output/flux_kontext_lora_v4_consolidated/logs

# Sample outputs every 1000 steps
ls output/flux_kontext_lora_v4_consolidated/samples/
```

## 📚 Resources

- **Competition**: [FLUX.1 Kontext Hackathon](https://bfl-kontext-dev.devpost.com/)
- **Model Weights**: [HuggingFace Model Hub](https://huggingface.co/tercumantanumut/instructdesign-kontext)
- **Dataset Samples**: [HuggingFace Datasets](https://huggingface.co/datasets/tercumantanumut/instructdesign-kontext)
- **Training Framework**: [AI Toolkit by Ostris](https://github.com/ostris/ai-toolkit)
- **Base Model**: [FLUX.1 Kontext [dev]](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev)
- **API Framework**: [DeepFloyd-Comfy](https://github.com/flowers6421/deeployd-comfy) (My ComfyUI deployment solution)
- **Frontend Foundation**: [ComfyUI Deploy Next.js Example](https://github.com/BennyKok/comfyui-deploy-next-example)

## 🏆 Hackathon Submission

This project was developed for the **Black Forest Labs FLUX.1 Kontext [dev] Hackathon**:
- **Development Period**: 7 days
- **Team**: Umut Tan 
- **Focus**: Web interface transformation through natural language
- **Innovation**: First LoRA fine-tune specifically for web design transformations

## 🤝 Contributing

We welcome contributions! Areas for improvement:
- Additional transformation presets
- Frontend UI enhancements
- Performance optimizations
- Dataset expansion
- Documentation improvements

## 📄 License

This project uses the FLUX.1 Kontext [dev] model. Please refer to:
- [FLUX.1 Kontext License](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev)
- Dataset: Research and educational use
- Code: MIT License

## 🙏 Acknowledgments

### Core Technologies
- **[Black Forest Labs](https://blackforestlabs.ai/)** for FLUX.1 Kontext [dev] model
- **[Comfy.org](https://comfy.org/)** - ecosystem support
- **[Ostris](https://github.com/ostris)** for the excellent [AI Toolkit](https://github.com/ostris/ai-toolkit) training framework
- **[ComfyUI](https://github.com/comfyanonymous/ComfyUI)** community for the powerful inference infrastructure
- **[ComfyDeploy](https://github.com/BennyKok/comfyui-deploy-next-example)** for the Next.js frontend example that served as the foundation for our UI

### Hackathon Sponsors
- **[fal.ai](https://fal.ai/)** - Hackathon co-sponsor and compute infrastructure
- **[Black Forest Labs](https://blackforestlabs.ai/)** - Model provider and hackathon host
- **[NVIDIA](https://nvidia.com/)** - Hackathon partner 


### Infrastructure & Tools
- **[HuggingFace](https://huggingface.co/)** for model and dataset hosting
- **[DeepFloyd-Comfy](https://github.com/flowers6421/deeployd-comfy)** - My own ComfyUI deployment application used for the API wrapper

### Special Thanks
- The entire FLUX.1 and ComfyUI community for their support and feedback
- All hackathon participants for pushing the boundaries of AI-driven design

## 🚧 Roadmap

- [x] Complete model training (16,000 steps)
- [x] Docker containerization with auto-download
- [x] API implementation with queue management
- [x] Dataset publication on HuggingFace
- [x] Frontend with 100+ presets
- [ ] Web-based playground interface
- [ ] Fine-tuning guide and tutorials

---

**📧 Contact**: tercumantanumut@gmail.com | **🏆 Hackathon**: [FLUX.1 Kontext [dev]](https://bfl-kontext-dev.devpost.com/)
