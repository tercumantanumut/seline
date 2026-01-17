# =============================================================================
# FLUX.2 Klein 9B ComfyUI - Optimized Single-Stage Dockerfile
# =============================================================================
# Optimizations applied:
# - Single-stage build (no unnecessary builder stage)
# - System Python 3.13 instead of pyenv (~5-10 min saved)
# - PyTorch installed LAST to prevent requirements.txt override
# - Reduced build context via .dockerignore (~22GB -> <1GB)
# =============================================================================

FROM nvidia/cuda:13.0.0-devel-ubuntu24.04

# Disable interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install Python 3.13 and runtime dependencies in single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Python 3.13 (available in Ubuntu 24.04 repos or deadsnakes)
    software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    python3.13 \
    python3.13-venv \
    python3.13-dev \
    python3-pip \
    # Runtime dependencies
    git \
    curl \
    wget \
    jq \
    libgl1 \
    libglib2.0-0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    # Set python3.13 as default python
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.13 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.13 1

# Verify Python and pip installation (using system pip from apt)
RUN python --version && pip --version

# Set working directory
WORKDIR /home/workspace

# HuggingFace token for authenticated model downloads
ARG HF_TOKEN
ENV HF_TOKEN=${HF_TOKEN}

# Build argument for controlling model downloads
ARG DOWNLOAD_MODELS=true

# Clone ComfyUI
RUN echo "=== Cloning ComfyUI ===" && \
    git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git /home/workspace/ComfyUI && \
    echo "✓ ComfyUI cloned successfully"

WORKDIR /home/workspace/ComfyUI

# Install ComfyUI requirements EXCLUDING torch (to prevent version conflict)
# Then install PyTorch nightly cu130 LAST to ensure correct CUDA 13.0 version
# NOTE: Use word-boundary matching to keep torchsde, torchdiffeq, etc.
RUN echo "=== Installing ComfyUI dependencies (excluding PyTorch core) ===" && \
    grep -v "^torch==" requirements.txt | grep -v "^torch$" | \
    grep -v "^torchvision" | grep -v "^torchaudio" > requirements_no_torch.txt && \
    python -m pip install --no-cache-dir -r requirements_no_torch.txt && \
    rm requirements_no_torch.txt && \
    echo "=== Installing PyTorch nightly with CUDA 13.0 ===" && \
    python -m pip install --no-cache-dir --pre torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/nightly/cu130 && \
    echo "✓ PyTorch installed with CUDA 13.0 support"

# Install custom_nodes dependencies (if any exist)
RUN find custom_nodes/ -name "requirements.txt" -print0 2>/dev/null | \
    xargs -0 -I {} sh -c 'echo "Installing dependencies from {}"; \
    python -m pip install --no-cache-dir -r "{}" || \
    echo "Warning: Failed to install dependencies from {}, continuing..."' || true

# =============================================================================
# Model Handling Section
# =============================================================================
# Models from comfyui_backend/ComfyUI/models are copied into the image.
# - For dev: Models are overwritten by docker-compose volume mounts at runtime
# - For electron builds: Models are baked into the image (no volume mounts)
#
# If model exists in build context: copy it (fast)
# If model missing and DOWNLOAD_MODELS=true: download from HuggingFace
# =============================================================================

# Create model directories
RUN mkdir -p /home/workspace/ComfyUI/models/vae \
    /home/workspace/ComfyUI/models/clip \
    /home/workspace/ComfyUI/models/diffusion_models

# Copy models from build context (comfyui_backend/ComfyUI/models)
COPY ComfyUI/models/vae/ /tmp/host_models/vae/
COPY ComfyUI/models/clip/ /tmp/host_models/clip/
COPY ComfyUI/models/diffusion_models/ /tmp/host_models/diffusion_models/

# FLUX.2 VAE: copy from host if exists, otherwise download
RUN MODEL_FILE="flux2-vae.safetensors" && \
    HOST_PATH="/tmp/host_models/vae/$MODEL_FILE" && \
    DEST_PATH="/home/workspace/ComfyUI/models/vae/$MODEL_FILE" && \
    if [ -f "$HOST_PATH" ]; then \
        FILE_SIZE=$(stat -c%s "$HOST_PATH" 2>/dev/null || echo 0) && \
        if [ "$FILE_SIZE" -gt 1048576 ]; then \
            echo "✓ VAE found on host ($(($FILE_SIZE / 1048576))MB), copying..." && \
            cp "$HOST_PATH" "$DEST_PATH" ; \
        else \
            echo "⚠ VAE incomplete, downloading..." && \
            wget --tries=3 --timeout=120 -q --show-progress \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors" \
                -O "$DEST_PATH" ; \
        fi ; \
    elif [ "$DOWNLOAD_MODELS" = "true" ]; then \
        echo "Downloading FLUX.2 VAE..." && \
        wget --tries=3 --timeout=120 -q --show-progress \
            $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
            "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors" \
            -O "$DEST_PATH" ; \
    else echo "Skipping VAE (will be mounted at runtime)" ; fi

# FLUX.2 Klein 9B CLIP: copy from host if exists, otherwise download
RUN MODEL_FILE="qwen_3_8b_fp8mixed.safetensors" && \
    HOST_PATH="/tmp/host_models/clip/$MODEL_FILE" && \
    DEST_PATH="/home/workspace/ComfyUI/models/clip/$MODEL_FILE" && \
    if [ -f "$HOST_PATH" ]; then \
        FILE_SIZE=$(stat -c%s "$HOST_PATH" 2>/dev/null || echo 0) && \
        if [ "$FILE_SIZE" -gt 1048576 ]; then \
            echo "✓ CLIP found on host ($(($FILE_SIZE / 1048576))MB), copying..." && \
            cp "$HOST_PATH" "$DEST_PATH" ; \
        else \
            echo "⚠ CLIP incomplete, downloading..." && \
            wget --tries=3 --timeout=120 -q --show-progress \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "https://huggingface.co/Comfy-Org/flux2-klein-9B/resolve/main/split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors" \
                -O "$DEST_PATH" ; \
        fi ; \
    elif [ "$DOWNLOAD_MODELS" = "true" ]; then \
        echo "Downloading FLUX.2 Klein 9B CLIP..." && \
        wget --tries=3 --timeout=120 -q --show-progress \
            $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
            "https://huggingface.co/Comfy-Org/flux2-klein-9B/resolve/main/split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors" \
            -O "$DEST_PATH" ; \
    else echo "Skipping CLIP (will be mounted at runtime)" ; fi

# FLUX.2 Klein 9B Diffusion Model: copy from host if exists, otherwise download
RUN MODEL_FILE="flux-2-klein-base-9b-fp8.safetensors" && \
    HOST_PATH="/tmp/host_models/diffusion_models/$MODEL_FILE" && \
    DEST_PATH="/home/workspace/ComfyUI/models/diffusion_models/$MODEL_FILE" && \
    if [ -f "$HOST_PATH" ]; then \
        FILE_SIZE=$(stat -c%s "$HOST_PATH" 2>/dev/null || echo 0) && \
        if [ "$FILE_SIZE" -gt 1048576 ]; then \
            echo "✓ Diffusion model found on host ($(($FILE_SIZE / 1048576))MB), copying..." && \
            cp "$HOST_PATH" "$DEST_PATH" ; \
        else \
            echo "⚠ Diffusion model incomplete, downloading..." && \
            wget --tries=3 --timeout=300 -q --show-progress \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-9b-fp8/resolve/main/flux-2-klein-base-9b-fp8.safetensors" \
                -O "$DEST_PATH" ; \
        fi ; \
    elif [ "$DOWNLOAD_MODELS" = "true" ]; then \
        echo "Downloading FLUX.2 Klein 9B Diffusion Model..." && \
        wget --tries=3 --timeout=300 -q --show-progress \
            $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
            "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-9b-fp8/resolve/main/flux-2-klein-base-9b-fp8.safetensors" \
            -O "$DEST_PATH" ; \
    else echo "Skipping Diffusion model (will be mounted at runtime)" ; fi

# Clean up temporary host models copy
RUN rm -rf /tmp/host_models

# Copy entrypoint script (path relative to new build context)
COPY flux2-klein-9b/comfy/entrypoint.sh /home/workspace/entrypoint.sh
RUN chmod +x /home/workspace/entrypoint.sh

# Expose required port
EXPOSE 8081

# Run via entrypoint script
ENTRYPOINT ["/home/workspace/entrypoint.sh"]
