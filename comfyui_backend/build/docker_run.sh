#!/bin/bash
# Docker run command with models volume mount
docker run -d \
  --name comfyui-workflow \
  -p 8188:8188 \
  -v /home/ubuntu/webflow-demo/ComfyUI/models:/app/ComfyUI/models \
  --gpus all \
  instructdesign-flow:latest
