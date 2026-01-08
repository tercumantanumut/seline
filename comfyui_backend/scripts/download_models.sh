#!/bin/bash
# Z-Image Turbo FP8 Model Download Script
# Usage: ./download_models.sh [target_dir]

set -e

TARGET_DIR="${1:-./ComfyUI/models}"

echo "============================================"
echo "Z-Image Turbo FP8 Model Downloader"
echo "============================================"
echo "Target directory: $TARGET_DIR"
echo ""

# Create directories
mkdir -p "$TARGET_DIR/checkpoints"
mkdir -p "$TARGET_DIR/loras"

# Model URLs
CHECKPOINT_URL="https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors?download=true"
LORA_URL="https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-detailer.safetensors?download=true"

# Download checkpoint
CHECKPOINT_PATH="$TARGET_DIR/checkpoints/z-image-turbo-fp8-aio.safetensors"
if [ -f "$CHECKPOINT_PATH" ]; then
    echo "✓ Checkpoint already exists: $CHECKPOINT_PATH"
else
    echo "Downloading Z-Image-Turbo FP8 Checkpoint..."
    wget -q --show-progress -O "$CHECKPOINT_PATH" "$CHECKPOINT_URL"
    echo "✓ Checkpoint downloaded: $CHECKPOINT_PATH"
fi

# Download LoRA
LORA_PATH="$TARGET_DIR/loras/z-image-detailer.safetensors"
if [ -f "$LORA_PATH" ]; then
    echo "✓ LoRA already exists: $LORA_PATH"
else
    echo "Downloading Z-Image Detailer LoRA..."
    wget -q --show-progress -O "$LORA_PATH" "$LORA_URL"
    echo "✓ LoRA downloaded: $LORA_PATH"
fi

echo ""
echo "============================================"
echo "All models downloaded successfully!"
echo "============================================"
echo ""
echo "Models location:"
echo "  Checkpoint: $CHECKPOINT_PATH"
echo "  LoRA: $LORA_PATH"
