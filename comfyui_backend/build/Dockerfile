FROM nvidia/cuda:12.8.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.12 and create symlinks
RUN apt-get update && \
    apt-get install -y software-properties-common && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-dev python3.12-venv && \
    apt-get install -y curl && \
    curl -sS https://bootstrap.pypa.io/get-pip.py | python3.12 && \
    ln -sf /usr/bin/python3.12 /usr/bin/python && \
    ln -sf /usr/bin/python3.12 /usr/bin/python3 && \
    ln -sf /usr/local/bin/pip3.12 /usr/bin/pip && \
    ln -sf /usr/local/bin/pip3.12 /usr/bin/pip3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential cmake curl ffmpeg g++ gcc git libgl1 libglib2.0-0 libglu1-mesa libgomp1 libsm6 libxext6 libxrender1 wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install ComfyUI
RUN git clone https://github.com/comfyanonymous/ComfyUI.git /app/ComfyUI
WORKDIR /app/ComfyUI

# Install PyTorch first (required for some custom nodes during build)
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu129

# Install accelerators (precompiled wheels) - platform guarded
RUN printf '%s\n' '--extra-index-url=https://download.pytorch.org/whl/nightly/cpu ; sys_platform  == '"'"'darwin'"'"'' '--extra-index-url=https://download.pytorch.org/whl/cu129 ; sys_platform  != '"'"'darwin'"'"'' 'torchsde' 'xformers ; sys_platform  != '"'"'darwin'"'"'' 'https://github.com/woct0rdho/triton-windows/releases/download/empty/triton-3.3.0-py3-none-any.whl ; sys_platform == '"'"'win32'"'"' # tw' 'triton-windows==3.4.0.post20 ; sys_platform == '"'"'win32'"'"' # tw' 'triton==3.4.0 ; sys_platform == '"'"'linux'"'"'' 'https://github.com/loscrossos/lib_flashattention/releases/download/v2.8.3/flash_attn-2.8.3+cu129torch2.8.0-cp312-cp312-win_amd64.whl ; sys_platform == '"'"'win32'"'"' #egg2.8.0' 'https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu12torch2.8cxx11abiTRUE-cp312-cp312-linux_x86_64.whl ; sys_platform == '"'"'linux'"'"' #egg2.8.0' 'https://github.com/woct0rdho/SageAttention/releases/download/v2.2.0-windows.post2/sageattention-2.2.0+cu128torch2.8.0.post2-cp39-abi3-win_amd64.whl ; sys_platform == '"'"'win32'"'"'  #egg:v2.2.2' 'https://github.com/loscrossos/lib_sageattention/releases/download/v2.2.0/sageattention-2.2.0+cu129torch280-cp312-cp312-linux_x86_64.whl ; sys_platform == '"'"'linux'"'"' #egg:v2.2.2' 'accelerate >= 1.1.1' > /tmp/accelerators.txt
RUN pip install --no-cache-dir -r /tmp/accelerators.txt && rm -f /tmp/accelerators.txt

# Install ComfyUI requirements (optional)
RUN if [ -f requirements.txt ]; then \
    python -c "import sys, re; p='requirements.txt'; c=open(p,'r').read() if sys.version_info[:2]>=(3,12) else None; open(p,'w').write(re.sub(r'scipy[^#\\s]*', 'scipy>=1.11.0', c)) if c else None" || true; \
    pip install --no-cache-dir -r requirements.txt; \
fi

WORKDIR /app/ComfyUI

# Download models from HuggingFace (optional, controlled by build arg)
ARG DOWNLOAD_MODELS=true

# Create model directories
RUN mkdir -p /app/ComfyUI/models/checkpoints \
    /app/ComfyUI/models/loras

# Download Z-Image Turbo FP8 models if DOWNLOAD_MODELS is true
# Download checkpoint model
RUN if [ "$DOWNLOAD_MODELS" = "true" ]; then \
    echo "Downloading Z-Image Turbo FP8 checkpoint from HuggingFace..." && \
    wget --tries=3 --timeout=60 -q --show-progress --progress=bar:force \
        "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors?download=true" \
        -O /app/ComfyUI/models/checkpoints/z-image-turbo-fp8-aio.safetensors && \
    echo "Checkpoint model downloaded successfully!" \
    ; else \
    echo "Skipping checkpoint download (DOWNLOAD_MODELS=$DOWNLOAD_MODELS)" \
    ; fi

# Download detailer LoRA model (separate layer for better caching)
RUN if [ "$DOWNLOAD_MODELS" = "true" ]; then \
    echo "Downloading Z-Image Detailer LoRA from HuggingFace..." && \
    wget --tries=3 --timeout=60 -q --show-progress --progress=bar:force \
        "https://huggingface.co/styly-agents/z-image-detailer/resolve/main/z-image-detailer.safetensors?download=true" \
        -O /app/ComfyUI/models/loras/z-image-detailer.safetensors && \
    echo "Detailer LoRA downloaded successfully!" \
    ; else \
    echo "Skipping detailer download (DOWNLOAD_MODELS=$DOWNLOAD_MODELS)" \
    ; fi

EXPOSE 8188

CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]

# Shared models volume (optional for external models)
RUN mkdir -p /models && ln -s /models /app/ComfyUI/models_external || true
VOLUME ["/models"]