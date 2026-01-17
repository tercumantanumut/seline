# =============================================================================
# FLUX.2 Klein 4B ComfyUI - Size-Optimized Dockerfile
# =============================================================================
# Optimizations applied:
# - Runtime base image instead of devel (~15GB saved)
# - Direct COPY to final location (no /tmp staging = ~22GB saved)
# - Single RUN layer for all model operations (no layer duplication)
# - PyTorch installed LAST to prevent requirements.txt override
# - Reduced build context via .dockerignore
#
# Expected image size: ~20-25GB (down from 87.5GB)
# =============================================================================

# Use runtime image - PyTorch bundles its own CUDA libraries
# devel (~15-20GB) vs runtime (~5GB) - we don't compile CUDA code
FROM nvidia/cuda:13.1.0-runtime-ubuntu24.04

# Disable interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install Python 3.13 and runtime dependencies in single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    python3.13 \
    python3.13-venv \
    python3.13-dev \
    python3-pip \
    git \
    curl \
    wget \
    jq \
    libgl1 \
    libglib2.0-0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.13 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.13 1

# Verify Python installation
RUN python --version && pip --version

# Set working directory
WORKDIR /home/workspace

# HuggingFace token for authenticated model downloads
ARG HF_TOKEN
ENV HF_TOKEN=${HF_TOKEN}

# Build argument for controlling model downloads
ARG DOWNLOAD_MODELS=true

# Clone ComfyUI and install dependencies in single layer
RUN echo "=== Cloning ComfyUI ===" && \
    git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git /home/workspace/ComfyUI && \
    echo "✓ ComfyUI cloned successfully"

WORKDIR /home/workspace/ComfyUI

# Install ComfyUI requirements EXCLUDING torch, then install PyTorch nightly cu130
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
    python -m pip install --no-cache-dir --break-system-packages -r "{}" || \
    echo "Warning: Failed to install dependencies from {}, continuing..."' || true

# =============================================================================
# Model Handling - Optimized for minimal layer size
# =============================================================================
# Strategy: Copy model files directly to final destination. If files don't
# exist in build context and DOWNLOAD_MODELS=true, download them.
#
# For dev: Models are overwritten by docker-compose volume mounts at runtime
# For electron builds: Models are baked into the image (no volume mounts)
# =============================================================================

# Create model directories
RUN mkdir -p /home/workspace/ComfyUI/models/vae \
    /home/workspace/ComfyUI/models/clip \
    /home/workspace/ComfyUI/models/diffusion_models

# Copy model files directly to final destination (no intermediate /tmp layer)
# Using wildcard to handle case where file may not exist in build context
COPY ComfyUI/models/vae/flux2-vae.safetensor[s] /home/workspace/ComfyUI/models/vae/
COPY ComfyUI/models/clip/qwen_3_4b.safetensor[s] /home/workspace/ComfyUI/models/clip/
COPY ComfyUI/models/diffusion_models/flux-2-klein-base-4b-fp8.safetensor[s] /home/workspace/ComfyUI/models/diffusion_models/

# Download missing models if DOWNLOAD_MODELS=true (single layer for all downloads)
RUN set -e && \
    # VAE
    VAE_FILE="/home/workspace/ComfyUI/models/vae/flux2-vae.safetensors" && \
    if [ ! -f "$VAE_FILE" ] || [ $(stat -c%s "$VAE_FILE" 2>/dev/null || echo 0) -lt 1048576 ]; then \
        if [ "$DOWNLOAD_MODELS" = "true" ]; then \
            echo "Downloading FLUX.2 VAE..." && \
            wget --tries=3 --timeout=120 -q --show-progress \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors" \
                -O "$VAE_FILE" && \
            echo "✓ VAE downloaded" ; \
        else \
            echo "⚠ VAE not found (will be mounted at runtime)" ; \
        fi ; \
    else \
        echo "✓ VAE present ($(stat -c%s "$VAE_FILE" | awk '{printf "%.0fMB", $1/1048576}'))" ; \
    fi && \
    # CLIP
    CLIP_FILE="/home/workspace/ComfyUI/models/clip/qwen_3_4b.safetensors" && \
    if [ ! -f "$CLIP_FILE" ] || [ $(stat -c%s "$CLIP_FILE" 2>/dev/null || echo 0) -lt 1048576 ]; then \
        if [ "$DOWNLOAD_MODELS" = "true" ]; then \
            echo "Downloading FLUX.2 Klein 4B CLIP..." && \
            wget --tries=3 --timeout=120 -q --show-progress \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors" \
                -O "$CLIP_FILE" && \
            echo "✓ CLIP downloaded" ; \
        else \
            echo "⚠ CLIP not found (will be mounted at runtime)" ; \
        fi ; \
    else \
        echo "✓ CLIP present ($(stat -c%s "$CLIP_FILE" | awk '{printf "%.0fMB", $1/1048576}'))" ; \
    fi && \
    # Diffusion Model
    DIFF_FILE="/home/workspace/ComfyUI/models/diffusion_models/flux-2-klein-base-4b-fp8.safetensors" && \
    if [ ! -f "$DIFF_FILE" ] || [ $(stat -c%s "$DIFF_FILE" 2>/dev/null || echo 0) -lt 1048576 ]; then \
        if [ "$DOWNLOAD_MODELS" = "true" ]; then \
            echo "Downloading FLUX.2 Klein 4B Diffusion Model..." && \
            wget --tries=3 --timeout=300 -q --show-progress \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4b-fp8/resolve/main/flux-2-klein-base-4b-fp8.safetensors" \
                -O "$DIFF_FILE" && \
            echo "✓ Diffusion model downloaded" ; \
        else \
            echo "⚠ Diffusion model not found (will be mounted at runtime)" ; \
        fi ; \
    else \
        echo "✓ Diffusion model present ($(stat -c%s "$DIFF_FILE" | awk '{printf "%.0fMB", $1/1048576}'))" ; \
    fi

# Copy entrypoint script
COPY flux2-klein-4b/comfy/entrypoint.sh /home/workspace/entrypoint.sh
RUN chmod +x /home/workspace/entrypoint.sh

# Expose ComfyUI port
EXPOSE 8081

# Run via entrypoint script
ENTRYPOINT ["/home/workspace/entrypoint.sh"]
