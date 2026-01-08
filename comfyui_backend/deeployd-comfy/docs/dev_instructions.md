# Developer Instructions - Debugging Docker Build Issues

## Table of Contents
1. [System Overview](#system-overview)
2. [Starting the API Server](#starting-the-api-server)
3. [Docker Build Process](#docker-build-process)
4. [Common Issues and Diagnosis](#common-issues-and-diagnosis)
5. [API Endpoints Reference](#api-endpoints-reference)
6. [Configuration Files](#configuration-files)
7. [Debugging Commands](#debugging-commands)
8. [Log Analysis](#log-analysis)

## System Overview

The ComfyUI-BAGEL system consists of:
- **API Server**: FastAPI-based server handling workflow management and Docker builds
- **Frontend**: React-based UI for workflow management and container building
- **Docker Builder**: Dynamic Dockerfile generation and build management
- **Node Resolver**: Custom node detection and dependency resolution

### Key Components
```
src/
├── api/
│   ├── app.py                 # Main FastAPI application
│   ├── routers/
│   │   ├── container_router.py # Docker build endpoints
│   │   └── workflow_router.py  # Workflow management
├── containers/
│   ├── dockerfile_builder.py   # Dockerfile generation
│   ├── accelerator_manager.py  # GPU accelerator management
│   └── docker_manager.py        # Docker API interface
├── workflows/
│   ├── node_resolver.py        # Custom node resolution
│   └── node_bridge.js          # Node.js bridge for comfyui-json
└── db/
    └── repositories.py          # Database operations
```

## Starting the API Server

### Development Mode
```bash
# Navigate to project directory
cd /home/ubuntu/deeployd-test/deeployd-comfy

# Activate virtual environment
source venv/bin/activate

# Start API server
python main.py api

# Or run in background with logging
python main.py api > /tmp/api.log 2>&1 &
```

### Monitor API Logs
```bash
# Real-time log monitoring
tail -f /tmp/api.log

# Check for errors
grep ERROR /tmp/api.log

# Check for specific build
grep "build_id" /tmp/api.log
```

### Check Server Status
```bash
# Check if server is running
curl http://localhost:8000/health

# Check API documentation
curl http://localhost:8000/docs

# List workflows
curl http://localhost:8000/api/v1/workflows/
```

## Docker Build Process

### Build Flow
1. Frontend/CLI sends build request to `/api/v1/containers/builds`
2. `container_router.py` creates build record and starts background thread
3. `_run_docker_build()` function handles the build process:
   - Resolves custom nodes via `node_resolver.py`
   - Generates Dockerfile via `dockerfile_builder.py`
   - Executes Docker build via `docker_manager.py`
   - Streams logs to database and WebSocket

### Triggering a Build via API

```bash
# Basic GPU build
curl -X POST "http://localhost:8000/api/v1/containers/builds" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "YOUR_WORKFLOW_ID",
    "image_name": "comfyui-test",
    "tag": "latest",
    "python_version": "3.12",
    "runtime_mode": "gpu",
    "torch_version": "2.8.0",
    "cuda_variant": "cu129",
    "safe_mode": false,
    "no_cache": true
  }'

# CPU build
curl -X POST "http://localhost:8000/api/v1/containers/builds" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "YOUR_WORKFLOW_ID",
    "image_name": "comfyui-cpu",
    "tag": "latest",
    "python_version": "3.12",
    "runtime_mode": "cpu",
    "torch_version": "2.8.0"
  }'

# With accelerators (GPU only)
curl -X POST "http://localhost:8000/api/v1/containers/builds" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "YOUR_WORKFLOW_ID",
    "image_name": "comfyui-accel",
    "tag": "latest",
    "python_version": "3.10",
    "runtime_mode": "gpu",
    "torch_version": "2.8.0",
    "cuda_variant": "cu129",
    "safe_mode": false,
    "accelerators": ["xformers", "triton", "flash", "sage"],
    "compile_fallback": true
  }'
```

### Build Parameters

| Parameter | Type | Description | Default | Options |
|-----------|------|-------------|---------|---------|
| `workflow_id` | string | UUID of workflow | Required | - |
| `image_name` | string | Docker image name | "comfyui-workflow" | Any valid name |
| `tag` | string | Docker image tag | "latest" | Any valid tag |
| `python_version` | string | Python version | "3.12" | "3.10", "3.11", "3.12", "3.13" |
| `runtime_mode` | string | Runtime mode | "cpu" | "cpu", "gpu" |
| `torch_version` | string | PyTorch version | "2.8.0" | "2.4.0" - "2.8.0" |
| `cuda_variant` | string | CUDA variant | "cu129" | "cu118", "cu121", "cu124", "cu126", "cu128", "cu129", "cpu" |
| `safe_mode` | boolean | Disable accelerators | false | true/false |
| `no_cache` | boolean | Rebuild without cache | false | true/false |
| `accelerators` | array | GPU accelerators | [] | ["xformers", "triton", "flash", "sage"] |
| `compile_fallback` | boolean | Compile from source if prebuilt unavailable | true | true/false |

## Common Issues and Diagnosis

### Issue 1: "pip: not found" Error

**Symptoms:**
```
Step 6/19 : RUN pip install --no-cache-dir torch==2.8.0 ...
/bin/sh: 1: pip: not found
```

**Diagnosis Steps:**
1. Check the generated Dockerfile:
```bash
# Find recent build contexts
find /tmp -name "build_ctx_*" -type d -mmin -10

# Check Dockerfile
cat /tmp/build_ctx_*/Dockerfile | head -20
```

2. Verify Python installation step exists:
```bash
grep -n "apt-get install.*python" /tmp/build_ctx_*/Dockerfile
```

3. Check `use_cuda` parameter in build:
```bash
# In container_router.py, check line ~413
grep -A5 -B5 "use_cuda=" src/api/routers/container_router.py
```

**Root Cause:**
- `use_cuda` parameter not set correctly for GPU builds
- Python/pip installation step skipped in dockerfile_builder.py

**Fix:**
```python
# In container_router.py, ensure:
use_cuda=(str(runtime_mode).lower() == "gpu")  # Not tied to enable_acc
```

### Issue 2: PyTorch Version Mismatch

**Symptoms:**
```
ERROR: Could not find a version that satisfies the requirement torchaudio==2.6.0
ERROR: No matching distribution found for torchaudio==2.6.0
```

**Diagnosis Steps:**
1. Check available versions:
```bash
# Check torch versions
pip index versions torch --index-url https://download.pytorch.org/whl/cu129

# Check torchaudio versions
pip index versions torchaudio --index-url https://download.pytorch.org/whl/cu129

# Check torchvision versions
pip index versions torchvision --index-url https://download.pytorch.org/whl/cu129
```

2. Verify version mappings:
```bash
# Check version inference functions
grep -A20 "_infer_audio_version\|_infer_vision_version" src/containers/dockerfile_builder.py
```

3. Test package installation manually:
```bash
# Test in Docker container
docker run --rm nvidia/cuda:12.8.0-runtime-ubuntu22.04 bash -c "
  apt-get update && apt-get install -y python3-pip &&
  pip install torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu129
"
```

**Fix:**
Update version mappings in `dockerfile_builder.py`:
```python
def _infer_audio_version(torch_version: str) -> str:
    mapping = {
        "2.8.0": "2.8.0",  # Not 2.6.0!
        # ...
    }
```

### Issue 3: Custom Node Not Detected

**Symptoms:**
- DWPreprocessor or other nodes not being installed
- "Unknown node type" errors

**Diagnosis Steps:**
1. Check node resolution:
```bash
# Test node resolution for workflow
curl -X POST "http://localhost:8000/api/v1/workflows/YOUR_WORKFLOW_ID/resolve_nodes"
```

2. Check comfyui.json priority mappings:
```bash
cat comfyui.json | jq '.node_priority_mappings.DWPreprocessor'
```

3. Verify node bridge output:
```bash
# Run node bridge directly
cd src/workflows
node node_bridge.js /path/to/workflow.json
```

**Fix:**
Add priority mapping in `comfyui.json`:
```json
{
  "node_priority_mappings": {
    "DWPreprocessor": {
      "repository": "https://github.com/Fannovel16/comfyui_controlnet_aux",
      "name": "ComfyUI's ControlNet Auxiliary Preprocessors",
      "priority": 1
    }
  }
}
```

## API Endpoints Reference

### Build Management

#### Create Build
```bash
POST /api/v1/containers/builds
Body: BuildCreateRequest (see parameters above)
Response: Build object with id, status, etc.
```

#### Get Build Status
```bash
GET /api/v1/containers/builds/{build_id}
Response: Complete build object with current status
```

#### Get Build Logs
```bash
GET /api/v1/containers/builds/{build_id}/logs?limit=200&since=0
Query params:
  - limit: Number of log lines (default: 100)
  - since: Sequence number to start from
Response: Array of log entries with sequence numbers
```

#### List Builds
```bash
GET /api/v1/containers/builds?workflow_id={id}&limit=25
Query params:
  - workflow_id: Filter by workflow (optional)
  - limit: Number of builds (1-200, default: 25)
```

### Workflow Management

#### List Workflows
```bash
GET /api/v1/workflows/?limit=100
```

#### Resolve Nodes
```bash
POST /api/v1/workflows/{workflow_id}/resolve_nodes
Response: {
  "custom_nodes": {...},
  "conflicting_nodes": {...},
  "missing_nodes": [...]
}
```

## Configuration Files

### comfyui.json
Main configuration for node resolution and priority mappings:
```json
{
  "description": "ComfyUI custom node priority mappings",
  "version": "1.0.0",
  "node_priority_mappings": {
    "NodeName": {
      "repository": "https://github.com/...",
      "name": "Human readable name",
      "priority": 1
    }
  }
}
```

### Environment Variables
```bash
# Database
export DATABASE_URL="sqlite:///comfyui_workflows.db"

# API Server
export API_HOST="0.0.0.0"
export API_PORT="8000"
export DEBUG="false"

# Docker
export DOCKER_BUILDKIT="1"
```

## Debugging Commands

### Monitor Build Progress
```bash
# Watch build in real-time
BUILD_ID="your-build-id"
while true; do
  curl -s "http://localhost:8000/api/v1/containers/builds/$BUILD_ID" | \
    jq '{status: .build_status, duration: .build_duration}'
  sleep 2
done
```

### Stream Build Logs
```bash
# Stream logs as they come
BUILD_ID="your-build-id"
LAST_SEQ=0
while true; do
  LOGS=$(curl -s "http://localhost:8000/api/v1/containers/builds/$BUILD_ID/logs?since=$LAST_SEQ")
  echo "$LOGS" | jq -r '.logs[] | .line'
  LAST_SEQ=$(echo "$LOGS" | jq '.logs[-1].seq // 0')
  sleep 1
done
```

### Check Docker Build Context
```bash
# Find and inspect build context
BUILD_CTX=$(find /tmp -name "build_ctx_*" -type d -mmin -5 | head -1)
echo "Build context: $BUILD_CTX"

# Check Dockerfile
cat $BUILD_CTX/Dockerfile

# Check requirements if copied
ls -la $BUILD_CTX/

# Check what Docker is building
docker ps --filter "label=building" --format "table {{.ID}}\t{{.Image}}\t{{.Status}}"
```

### Database Queries
```bash
# Connect to SQLite database
sqlite3 /home/ubuntu/deeployd-test/deeployd-comfy/comfyui_workflows.db

# Check recent builds
SELECT id, workflow_id, build_status, created_at
FROM container_builds
ORDER BY created_at DESC
LIMIT 10;

# Check build logs
SELECT seq, line
FROM build_logs
WHERE build_id = 'your-build-id'
ORDER BY seq DESC
LIMIT 20;
```

### Test Docker Build Manually
```bash
# Extract Dockerfile from failed build
BUILD_CTX="/tmp/build_ctx_xyz"
cd $BUILD_CTX

# Test build manually
docker build -t test:debug .

# Or with specific build args
docker build \
  --build-arg PYTHON_VERSION=3.12 \
  --build-arg CUDA_VERSION=12.8.0 \
  -t test:debug .
```

## Log Analysis

### API Server Logs
```bash
# Check for build errors
grep -E "ERROR|FAILED|Exception" /tmp/api.log

# Find specific build
grep "build_id_here" /tmp/api.log

# Check node resolution
grep "node_resolver" /tmp/api.log

# Database errors
grep -E "sqlite|InterfaceError|OperationalError" /tmp/api.log
```

### Docker Daemon Logs
```bash
# On Ubuntu/Debian
sudo journalctl -u docker.service -f

# Check Docker events
docker events --filter event=die --filter event=kill
```

### Frontend Console
```javascript
// In browser console
// Check build status
fetch('/api/v1/containers/builds/BUILD_ID')
  .then(r => r.json())
  .then(console.log)

// Check resolved nodes
fetch('/api/v1/workflows/WORKFLOW_ID/resolve_nodes', {method: 'POST'})
  .then(r => r.json())
  .then(console.log)
```

## Troubleshooting Checklist

1. **Pre-flight Checks**
   - [ ] API server running? `curl http://localhost:8000/health`
   - [ ] Docker daemon running? `docker ps`
   - [ ] Database accessible? `ls -la *.db`
   - [ ] Virtual environment activated? `which python`

2. **Build Failure Checks**
   - [ ] Check build status: `GET /api/v1/containers/builds/{id}`
   - [ ] Review build logs: `GET /api/v1/containers/builds/{id}/logs`
   - [ ] Inspect Dockerfile: `cat /tmp/build_ctx_*/Dockerfile`
   - [ ] Check Python/pip installation steps
   - [ ] Verify PyTorch version compatibility
   - [ ] Check custom node resolution

3. **Common Fixes**
   - [ ] Restart API server after code changes
   - [ ] Clear Docker cache: `docker system prune`
   - [ ] Update version mappings in `dockerfile_builder.py`
   - [ ] Add node priority mappings in `comfyui.json`
   - [ ] Verify `use_cuda` logic in `container_router.py`

## Quick Reference

### File Locations
```
/home/ubuntu/deeployd-test/deeployd-comfy/
├── main.py                          # CLI entry point
├── comfyui.json                     # Node priority config
├── comfyui_workflows.db             # SQLite database
├── src/api/routers/container_router.py  # Build endpoints
├── src/containers/dockerfile_builder.py # Dockerfile generation
├── src/workflows/node_resolver.py   # Node resolution
└── /tmp/
    ├── api.log                      # API server logs
    └── build_ctx_*/                # Docker build contexts
```

### Key Functions to Debug
```python
# container_router.py
_run_docker_build()  # Main build orchestration

# dockerfile_builder.py
build_for_workflow()  # Dockerfile generation
_infer_audio_version()  # PyTorch audio version mapping
_infer_vision_version()  # PyTorch vision version mapping

# node_resolver.py
get_comprehensive_resolution()  # Node detection
_load_comfyui_json()  # Priority mappings
```

### Emergency Commands
```bash
# Kill stuck builds
pkill -f "docker build"

# Restart API server
pkill -f "python.*main.py"
cd /home/ubuntu/deeployd-test/deeployd-comfy
source venv/bin/activate
python main.py api > /tmp/api.log 2>&1 &

# Clean up old build contexts
find /tmp -name "build_ctx_*" -type d -mtime +1 -exec rm -rf {} +

# Reset database (CAUTION: loses all data)
rm comfyui_workflows.db
python main.py api  # Will recreate DB
```