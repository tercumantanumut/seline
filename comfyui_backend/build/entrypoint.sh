#!/bin/bash
set -e

echo "=== Z-Image Turbo FP8 ComfyUI Entrypoint ==="

MODELS_DIR="/home/workspace/ComfyUI/models"

# Function to check and download model if missing
check_and_download() {
    local subdir="$1"
    local filename="$2"
    local url="$3"
    local path="${MODELS_DIR}/${subdir}/${filename}"
    
    # Ensure directory exists
    mkdir -p "${MODELS_DIR}/${subdir}"
    
    if [ -f "$path" ] && [ $(stat -c%s "$path" 2>/dev/null || echo 0) -gt 1048576 ]; then
        local size=$(stat -c%s "$path" | awk '{printf "%.0fMB", $1/1048576}')
        echo "✓ Found: ${subdir}/${filename} (${size})"
    else
        echo "✗ Missing: ${subdir}/${filename}"
        if [ "$DOWNLOAD_MODELS" = "true" ]; then
            echo "  Downloading from ${url}..."
            wget --tries=3 --timeout=300 -q --show-progress \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "$url" -O "$path"
            echo "  ✓ Downloaded: ${filename}"
        else
            echo "  ⚠ DOWNLOAD_MODELS=false, skipping download"
            echo "  Please place the model file manually at: ${path}"
        fi
    fi
}

echo "Checking for required models..."

# Z-Image Checkpoint
check_and_download \
    "checkpoints" \
    "z-image-turbo-fp8-aio.safetensors" \
    "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors"

# Z-Image Detailer LoRA
check_and_download \
    "loras" \
    "z-image-detailer.safetensors" \
    "https://huggingface.co/styly-agents/z-image-detailer/resolve/main/z-image-detailer.safetensors"

# Install missing dependencies (workaround for grep filtering issue)
echo "=== Installing missing dependencies ==="
pip install --no-cache-dir torchsde 2>/dev/null || echo "torchsde already installed"

echo "=== Starting ComfyUI ==="
exec python -u main.py --listen 0.0.0.0 --port 8188

