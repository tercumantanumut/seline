# Enhanced ComfyUI functions for multi-instance support

import os
import json
import requests
import asyncio
import random
import time
from typing import List, Optional, Dict, Tuple
from config import COMFYUI_SERVER, COMFYUI_OUTPUT_DIR

# Track which instance is handling each prompt
prompt_to_instance: Dict[str, str] = {}

def get_comfyui_servers() -> List[str]:
    """Get list of ComfyUI servers from environment"""
    servers_env = os.getenv('COMFYUI_SERVERS', COMFYUI_SERVER)
    if ',' in servers_env:
        return [s.strip() for s in servers_env.split(',')]
    return [servers_env]

def select_server(prompt_id: str = None) -> str:
    """Select a ComfyUI server for a request"""
    servers = get_comfyui_servers()
    
    # If we're tracking this prompt, return its server
    if prompt_id and prompt_id in prompt_to_instance:
        return prompt_to_instance[prompt_id]
    
    # For new requests, randomly select a server
    return random.choice(servers)

def submit_prompt_to_server(server: str, workflow: dict) -> Tuple[str, str]:
    """Submit a prompt to a specific ComfyUI server"""
    prompt_id = str(random.randint(0, 2**32))
    
    try:
        response = requests.post(
            f"{server}/prompt",
            json={"prompt": workflow},
            timeout=30
        )
        response.raise_for_status()
        result = response.json()
        actual_prompt_id = result.get("prompt_id", prompt_id)
        
        # Track which server is handling this prompt
        prompt_to_instance[actual_prompt_id] = server
        print(f"Submitted prompt {actual_prompt_id} to server {server}")
        
        return server, actual_prompt_id
        
    except Exception as e:
        print(f"Error submitting to {server}: {e}")
        raise

async def poll_for_result_multi(prompt_id: str):
    """Poll for result from the correct ComfyUI instance"""
    max_attempts = 120
    poll_interval = 3
    
    # Get the server handling this prompt
    server = prompt_to_instance.get(prompt_id)
    if not server:
        # If we don't know, check all servers
        servers = get_comfyui_servers()
        print(f"Unknown server for prompt {prompt_id}, checking all {len(servers)} servers")
    else:
        servers = [server]
    
    print(f"Polling for result for prompt_id: {prompt_id} on server(s): {servers}")
    
    for attempt in range(max_attempts):
        for check_server in servers:
            try:
                # Check history
                response = requests.get(f"{check_server}/history/{prompt_id}", timeout=10)
                response.raise_for_status()
                history = response.json()
                
                if prompt_id in history:
                    # Found it! Update tracking
                    prompt_to_instance[prompt_id] = check_server
                    prompt_data = history[prompt_id]
                    
                    if "outputs" in prompt_data and prompt_data["outputs"]:
                        outputs = prompt_data["outputs"]
                        
                        # Look for output images
                        for node_id, node_outputs in outputs.items():
                            if (
                                "images" in node_outputs
                                and isinstance(node_outputs["images"], list)
                                and len(node_outputs["images"]) > 0
                            ):
                                image_data = node_outputs["images"][0]
                                if "filename" in image_data:
                                    output_filename = image_data["filename"]
                                    output_path_container = os.path.join(
                                        COMFYUI_OUTPUT_DIR, output_filename
                                    )
                                    print(f"Found output image: {output_filename} from node {node_id}")
                                    
                                    if os.path.exists(output_path_container):
                                        print(f"Confirmed output file exists: {output_path_container}")
                                        # Clean up tracking
                                        prompt_to_instance.pop(prompt_id, None)
                                        return output_path_container
                                    else:
                                        print(f"File {output_filename} not yet on disk, retrying...")
                
                # Also check queue
                queue_response = requests.get(f"{check_server}/queue", timeout=10)
                if queue_response.status_code == 200:
                    queue_data = queue_response.json()
                    
                    # Check if prompt is in queue
                    in_queue = False
                    for item in queue_data.get("queue_running", []):
                        if item[1] == prompt_id:
                            in_queue = True
                            prompt_to_instance[prompt_id] = check_server
                            print(f"Prompt {prompt_id} is running on {check_server}")
                            break
                    
                    if not in_queue:
                        for item in queue_data.get("queue_pending", []):
                            if item[1] == prompt_id:
                                in_queue = True
                                prompt_to_instance[prompt_id] = check_server
                                print(f"Prompt {prompt_id} is pending on {check_server}")
                                break
                
            except Exception as e:
                print(f"Error checking {check_server}: {e}")
                continue
        
        print(f"Attempt {attempt + 1}/{max_attempts}: Waiting for prompt {prompt_id}...")
        await asyncio.sleep(poll_interval)
    
    # Clean up tracking on failure
    prompt_to_instance.pop(prompt_id, None)
    raise TimeoutError(f"Timeout waiting for prompt {prompt_id} after {max_attempts} attempts")

# Export the enhanced versions
from .comfy import modify_workflow
__all__ = ['modify_workflow', 'submit_prompt_to_server', 'poll_for_result_multi', 'get_comfyui_servers']