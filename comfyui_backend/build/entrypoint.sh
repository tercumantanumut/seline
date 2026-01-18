#!/bin/bash
# Don't use set -e - we handle errors gracefully

echo "=== Z-Image Turbo FP8 ComfyUI Entrypoint ==="

MODELS_DIR="/home/workspace/ComfyUI/models"
MISSING_MODELS=0

# Function to check and optionally download model if missing
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
        return 0
    fi

    echo "✗ Missing: ${subdir}/${filename}"

    if [ "$DOWNLOAD_MODELS" != "true" ]; then
        echo "  ⚠ DOWNLOAD_MODELS=false, skipping download"
        echo "  Place model manually at: ${path}"
        MISSING_MODELS=$((MISSING_MODELS + 1))
        return 1
    fi

    echo "  Downloading from HuggingFace..."

    # Build wget command with -L to follow redirects
    local wget_cmd="wget -L --tries=3 --timeout=300 --progress=bar:force"
    if [ -n "$HF_TOKEN" ]; then
        wget_cmd="$wget_cmd --header=Authorization:\ Bearer\ $HF_TOKEN"
    fi

    if $wget_cmd "$url" -O "$path" 2>&1; then
        # Verify file was downloaded (not an error page)
        if [ -f "$path" ] && [ $(stat -c%s "$path" 2>/dev/null || echo 0) -gt 1048576 ]; then
            local size=$(stat -c%s "$path" | awk '{printf "%.0fMB", $1/1048576}')
            echo "  ✓ Downloaded: ${filename} (${size})"
            return 0
        else
            echo "  ✗ Download failed or file too small"
            rm -f "$path"
        fi
    else
        echo "  ✗ Download failed (wget error)"
        rm -f "$path"
    fi

    echo "  Manual placement required: ${path}"
    echo "  Download URL: ${url}"
    MISSING_MODELS=$((MISSING_MODELS + 1))
    return 1
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

