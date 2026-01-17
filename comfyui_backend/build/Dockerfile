# =============================================================================
# Z-Image Turbo FP8 ComfyUI - Size-Optimized Dockerfile
# =============================================================================
# Optimizations applied:
# - Runtime base image instead of devel (~15GB saved)
# - Direct COPY to final location (no /tmp staging = ~20GB saved)
# - Single RUN layer for all model operations (no layer duplication)
# - PyTorch installed LAST to prevent requirements.txt override
# - Reduced build context via .dockerignore
#
# Expected image size: ~20-25GB
# Consistency: Matches FLUX.2 Klein 4B Dockerfile structure
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
# Model Handling
# =============================================================================
# Models are always external - either downloaded or manually placed.
# They are mounted via volume at runtime.
# The entrypoint script checks for models and downloads if missing.
# =============================================================================

# Create model directories
RUN mkdir -p /home/workspace/ComfyUI/models/checkpoints \
    /home/workspace/ComfyUI/models/loras

# Copy entrypoint script
COPY build/entrypoint.sh /home/workspace/entrypoint.sh
RUN chmod +x /home/workspace/entrypoint.sh

# Expose ComfyUI port
EXPOSE 8188

# Run via entrypoint script (checks models at runtime, then starts ComfyUI)
ENTRYPOINT ["/home/workspace/entrypoint.sh"]