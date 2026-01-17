import os
import json
from dotenv import load_dotenv

load_dotenv()



WORKFLOW_FILE = "workflow.json"
COMFYUI_SERVER = os.getenv("COMFYUI_SERVER", "http://comfy:8081")
COMFYUI_INPUT_DIR = os.getenv("COMFYUI_INPUT_DIR", "/comfyui-data/input")
COMFYUI_OUTPUT_DIR = os.getenv("COMFYUI_OUTPUT_DIR", "/comfyui-data/output")
API_KEY = os.getenv("API_KEY", "internal-gateway-key-change-me")

# Redis configuration for async job queue
REDIS_URL = os.getenv("REDIS_URL", "redis://api-redis-1:6379/0")
JOB_TTL_SECONDS = int(os.getenv("JOB_TTL_SECONDS", "3600"))  # 1 hour default


try:
    with open(WORKFLOW_FILE, "r") as f:
        WORKFLOW_TEMPLATE = json.load(f)
    print(f"Successfully loaded workflow template from {WORKFLOW_FILE}")
except FileNotFoundError:
    print(f"ERROR: Workflow file '{WORKFLOW_FILE}' not found.")
    raise RuntimeError(f"Workflow file {WORKFLOW_FILE} not found.")
except json.JSONDecodeError:
    print(f"ERROR: Could not decode JSON from '{WORKFLOW_FILE}'.")
    raise RuntimeError(f"Invalid JSON in workflow file {WORKFLOW_FILE}.")
