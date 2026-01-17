#!/bin/bash
set -e

echo "=== FLUX.2 Klein 4B ComfyUI Entrypoint ==="

MODELS_DIR="/home/workspace/ComfyUI/models"

# Check required models
echo "Checking for required models..."
check_model() {
    local subdir="$1"
    local filename="$2"
    local path="${MODELS_DIR}/${subdir}/${filename}"
    if [ -f "$path" ]; then
        echo "✓ Found: ${subdir}/${filename}"
    else
        echo "✗ Missing: ${subdir}/${filename}"
    fi
}

check_model "vae" "flux2-vae.safetensors"
check_model "clip" "qwen_3_4b.safetensors"
check_model "diffusion_models" "flux-2-klein-base-4b-fp8.safetensors"

echo "=== Starting ComfyUI ==="
exec python -u main.py --listen 0.0.0.0 --port 8081

