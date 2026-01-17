# ========================== Build Stage ==========================
# Using CUDA 13.0 for optimized CUDA operations on RTX 5090 and modern GPUs
FROM nvidia/cuda:13.0.0-devel-ubuntu24.04 AS builder

# Set build arguments
ARG PYTHON_VERSION=3.11.9

# Disable interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required dependencies for building Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    wget \
    curl \
    llvm \
    libncurses5-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libffi-dev \
    liblzma-dev \
    git \
    jq \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install pyenv and Python
# Using PYENV_ROOT=/opt/pyenv to make it more system-like
ENV PYENV_ROOT=/opt/pyenv
ENV PATH=$PYENV_ROOT/bin:$PATH
RUN git clone https://github.com/pyenv/pyenv.git ${PYENV_ROOT} \
    && pyenv install ${PYTHON_VERSION} \
    && pyenv global ${PYTHON_VERSION} \
    # Explicitly use the pyenv shim path for python
    && curl -sS https://bootstrap.pypa.io/get-pip.py | ${PYENV_ROOT}/shims/python \
    # Explicitly use the pyenv shim path for pip
    && ${PYENV_ROOT}/shims/pip install --no-cache-dir --upgrade pip setuptools wheel

# Install PyTorch with CUDA 13.0 support for optimized operations on RTX 5090
# Using nightly build with cu130 for CUDA 13.0 compatibility
RUN ${PYENV_ROOT}/shims/pip3 install --no-cache-dir --pre \
    torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu130

# ========================== Final Runtime Stage ==========================
# Using CUDA 13.0 runtime for optimized CUDA operations
FROM nvidia/cuda:13.0.0-devel-ubuntu24.04

# Set Python version argument to be available in this stage
ARG PYTHON_VERSION=3.11.9
# Extract Major.Minor version for apt package installation
ARG PYTHON_MAJOR_MINOR=$(echo "${PYTHON_VERSION}" | cut -d. -f1,2)

# Set environment variables
ENV PYENV_ROOT=/opt/pyenv
# Use the specific version's bin directory first in PATH for the final image
ENV PATH=$PYENV_ROOT/versions/${PYTHON_VERSION}/bin:$PYENV_ROOT/bin:$PATH
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
    wget \
    libgl1 \
    libglib2.0-0 \
    # Add ca-certificates needed by curl/wget for HTTPS
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Python installation from build stage
COPY --from=builder ${PYENV_ROOT} ${PYENV_ROOT}

# Verify Python installation (this should now work correctly)
RUN python --version && pip --version

# Set initial working directory
WORKDIR /home/workspace

# HuggingFace token for authenticated model downloads
ARG HF_TOKEN
ENV HF_TOKEN=${HF_TOKEN}

# Build argument for controlling model downloads (matches Z-Image Turbo pattern)
ARG DOWNLOAD_MODELS=true

# Clone ComfyUI directly (standardized approach - no external scripts)
RUN echo "=== Cloning ComfyUI ===" && \
    git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git /home/workspace/ComfyUI && \
    echo "✓ ComfyUI cloned successfully" && \
    if [ ! -d "/home/workspace/ComfyUI" ]; then echo "ERROR: /home/workspace/ComfyUI directory not found!"; exit 1; fi && \
    if [ ! -f "/home/workspace/ComfyUI/requirements.txt" ]; then echo "ERROR: /home/workspace/ComfyUI/requirements.txt not found!"; exit 1; fi

# Set working directory to ComfyUI where base files should now be
WORKDIR /home/workspace/ComfyUI

# Install base ComfyUI requirements first
RUN echo "--- Installing ComfyUI requirements ---" && \
    python -m pip install --no-cache-dir -r requirements.txt

# Upgrade pip, setuptools, wheel
RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel

# Install dependencies from requirements.txt files found in custom_nodes (if any)
RUN find custom_nodes/ -name "requirements.txt" -print0 2>/dev/null | xargs -0 -I {} sh -c 'echo "Installing dependencies from {}"; python -m pip install --no-cache-dir -r "{}" || echo "Warning: Failed to install dependencies from {}, continuing..."' || true

# Create model directories
RUN mkdir -p /home/workspace/ComfyUI/models/vae \
    /home/workspace/ComfyUI/models/clip \
    /home/workspace/ComfyUI/models/diffusion_models

# Copy shared models directory into build context for checking existing models
# Build context is now comfyui_backend root, so ComfyUI/models is accessible
COPY ComfyUI/models /tmp/host_models

# Download FLUX.2 Klein 4B VAE model (with intelligent skip logic)
RUN if [ "$DOWNLOAD_MODELS" = "true" ]; then \
    MODEL_FILE="flux2-vae.safetensors" && \
    HOST_PATH="/tmp/host_models/vae/$MODEL_FILE" && \
    DEST_PATH="/home/workspace/ComfyUI/models/vae/$MODEL_FILE" && \
    MODEL_URL="https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors" && \
    if [ -f "$HOST_PATH" ]; then \
        FILE_SIZE=$(stat -c%s "$HOST_PATH" 2>/dev/null || echo 0) && \
        if [ "$FILE_SIZE" -gt 1048576 ]; then \
            echo "✓ VAE exists on host with valid size ($(($FILE_SIZE / 1048576))MB), copying..." && \
            cp "$HOST_PATH" "$DEST_PATH" && \
            echo "✓ VAE copied successfully!" ; \
        else \
            echo "⚠ VAE exists but appears incomplete (${FILE_SIZE} bytes), downloading..." && \
            wget --tries=3 --timeout=120 -q --show-progress --progress=bar:force \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "$MODEL_URL" -O "$DEST_PATH" && \
            echo "✓ VAE downloaded successfully!" ; \
        fi ; \
    else \
        echo "Downloading FLUX.2 VAE from HuggingFace..." && \
        wget --tries=3 --timeout=120 -q --show-progress --progress=bar:force \
            $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
            "$MODEL_URL" -O "$DEST_PATH" && \
        echo "✓ VAE downloaded successfully!" ; \
    fi ; \
    else \
    echo "Skipping VAE download (DOWNLOAD_MODELS=$DOWNLOAD_MODELS)" ; \
    fi

# Download FLUX.2 Klein 4B CLIP/Text Encoder model (with intelligent skip logic)
RUN if [ "$DOWNLOAD_MODELS" = "true" ]; then \
    MODEL_FILE="qwen_3_4b.safetensors" && \
    HOST_PATH="/tmp/host_models/clip/$MODEL_FILE" && \
    DEST_PATH="/home/workspace/ComfyUI/models/clip/$MODEL_FILE" && \
    MODEL_URL="https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors" && \
    if [ -f "$HOST_PATH" ]; then \
        FILE_SIZE=$(stat -c%s "$HOST_PATH" 2>/dev/null || echo 0) && \
        if [ "$FILE_SIZE" -gt 1048576 ]; then \
            echo "✓ CLIP exists on host with valid size ($(($FILE_SIZE / 1048576))MB), copying..." && \
            cp "$HOST_PATH" "$DEST_PATH" && \
            echo "✓ CLIP copied successfully!" ; \
        else \
            echo "⚠ CLIP exists but appears incomplete (${FILE_SIZE} bytes), downloading..." && \
            wget --tries=3 --timeout=120 -q --show-progress --progress=bar:force \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "$MODEL_URL" -O "$DEST_PATH" && \
            echo "✓ CLIP downloaded successfully!" ; \
        fi ; \
    else \
        echo "Downloading FLUX.2 Klein 4B CLIP from HuggingFace..." && \
        wget --tries=3 --timeout=120 -q --show-progress --progress=bar:force \
            $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
            "$MODEL_URL" -O "$DEST_PATH" && \
        echo "✓ CLIP downloaded successfully!" ; \
    fi ; \
    else \
    echo "Skipping CLIP download (DOWNLOAD_MODELS=$DOWNLOAD_MODELS)" ; \
    fi

# Download FLUX.2 Klein 4B Diffusion Model (with intelligent skip logic)
RUN if [ "$DOWNLOAD_MODELS" = "true" ]; then \
    MODEL_FILE="flux-2-klein-base-4b-fp8.safetensors" && \
    HOST_PATH="/tmp/host_models/diffusion_models/$MODEL_FILE" && \
    DEST_PATH="/home/workspace/ComfyUI/models/diffusion_models/$MODEL_FILE" && \
    MODEL_URL="https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4b-fp8/resolve/main/flux-2-klein-base-4b-fp8.safetensors" && \
    if [ -f "$HOST_PATH" ]; then \
        FILE_SIZE=$(stat -c%s "$HOST_PATH" 2>/dev/null || echo 0) && \
        if [ "$FILE_SIZE" -gt 1048576 ]; then \
            echo "✓ Diffusion model exists on host with valid size ($(($FILE_SIZE / 1048576))MB), copying..." && \
            cp "$HOST_PATH" "$DEST_PATH" && \
            echo "✓ Diffusion model copied successfully!" ; \
        else \
            echo "⚠ Diffusion model exists but appears incomplete (${FILE_SIZE} bytes), downloading..." && \
            wget --tries=3 --timeout=300 -q --show-progress --progress=bar:force \
                $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
                "$MODEL_URL" -O "$DEST_PATH" && \
            echo "✓ Diffusion model downloaded successfully!" ; \
        fi ; \
    else \
        echo "Downloading FLUX.2 Klein 4B Diffusion Model from HuggingFace..." && \
        wget --tries=3 --timeout=300 -q --show-progress --progress=bar:force \
            $([ -n "$HF_TOKEN" ] && echo "--header=Authorization: Bearer $HF_TOKEN") \
            "$MODEL_URL" -O "$DEST_PATH" && \
        echo "✓ Diffusion model downloaded successfully!" ; \
    fi ; \
    else \
    echo "Skipping Diffusion model download (DOWNLOAD_MODELS=$DOWNLOAD_MODELS)" ; \
    fi

# Clean up temporary host models copy to reduce image size
RUN rm -rf /tmp/host_models

# Copy entrypoint script (path relative to new build context)
COPY flux2-klein-4b/comfy/entrypoint.sh /home/workspace/entrypoint.sh
RUN chmod +x /home/workspace/entrypoint.sh

# Expose required port
EXPOSE 8081

# Run via entrypoint script
ENTRYPOINT ["/home/workspace/entrypoint.sh"]
