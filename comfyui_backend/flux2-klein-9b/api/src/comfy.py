# src/comfy.py

import os
import json
import requests
import asyncio
import base64
import uuid
import io
from typing import List, Optional
from PIL import Image
from dotenv import load_dotenv
from config import COMFYUI_SERVER, COMFYUI_OUTPUT_DIR, COMFYUI_INPUT_DIR

load_dotenv()


def save_reference_image(image_input: str, index: int) -> str:
    """Save an image to the input directory and return the filename.

    Supports:
    - Base64-encoded image data (with or without data URI prefix)
    - URL paths (starting with http://, https://, or /api/)

    The image is always converted to PNG format to ensure compatibility.
    """
    # Generate unique filename
    filename = f"ref_{uuid.uuid4().hex}_{index}.png"
    filepath = os.path.join(COMFYUI_INPUT_DIR, filename)

    try:
        # Check if input is a URL (http://, https://, or relative /api/ path)
        if image_input.startswith(('http://', 'https://')):
            # Absolute URL - fetch directly
            print(f"Fetching reference image {index} from URL: {image_input}")
            response = requests.get(image_input, timeout=30)
            response.raise_for_status()
            image_data = response.content
        elif image_input.startswith('/api/'):
            # Relative API path - need to fetch from the main app server
            # This is typically served by the Next.js frontend
            # Try localhost:3000 (Next.js dev) or use environment variable
            base_url = os.environ.get('FRONTEND_URL', 'http://host.docker.internal:3000')
            full_url = f"{base_url}{image_input}"
            print(f"Fetching reference image {index} from: {full_url}")
            response = requests.get(full_url, timeout=30)
            response.raise_for_status()
            image_data = response.content
        else:
            # Assume base64-encoded data
            # Handle data URI format if present
            if "," in image_input:
                image_input = image_input.split(",")[1]
            image_data = base64.b64decode(image_input)

        # Validate and convert image to PNG format
        # This handles JPEG, WEBP, GIF, BMP, etc. and ensures valid PNG output
        try:
            img = Image.open(io.BytesIO(image_data))
            # Convert to RGB if necessary (handles RGBA, P mode, etc.)
            if img.mode in ('RGBA', 'LA', 'P'):
                # Preserve alpha if present
                img = img.convert('RGBA')
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            # Save as PNG
            img.save(filepath, format='PNG')
            print(f"Saved reference image {index} to: {filename} (converted from {img.format or 'unknown'} to PNG)")
        except Exception as img_err:
            print(f"Error processing image {index}: {img_err}")
            raise ValueError(f"Invalid or corrupted image data for reference image {index}: {img_err}")

        return filename
    except requests.exceptions.RequestException as e:
        print(f"Error fetching reference image {index}: {e}")
        raise ValueError(f"Failed to fetch reference image {index} from URL: {e}")
    except ValueError:
        # Re-raise ValueError (from image processing above)
        raise
    except Exception as e:
        print(f"Error saving reference image {index}: {e}")
        raise ValueError(f"Failed to decode and save reference image {index}: {e}")


def modify_workflow(
    workflow_data,
    prompt: str,
    width: int,
    height: int,
    guidance: float,
    steps: int,
    seed_value: int,
    reference_images: Optional[List[str]] = None
):
    """Modify the Flux2 Klein workflow with user parameters.

    Klein models use CFGGuider instead of BasicGuider + FluxGuidance.
    The guidance is set via the 'cfg' parameter on CFGGuider.

    Two modes:
    - Text-to-image (no reference_images): Uses EmptyFlux2LatentImage with user-specified dimensions
    - Image editing (with reference_images): Dimensions derived from reference images via
      LoadImage -> ImageScaleToTotalPixels -> VAEEncode -> ReferenceLatent chain
    """
    workflow = json.loads(json.dumps(workflow_data))
    is_edit_mode = reference_images and len(reference_images) > 0

    # Node 6 - CLIP Text Encode (Positive Prompt)
    if "6" in workflow and "inputs" in workflow["6"]:
        workflow["6"]["inputs"]["text"] = prompt
        print(f"Injected prompt into node 6")
    else:
        raise ValueError("Workflow configuration error: Node 6 structure invalid for prompt.")

    # Node 25 - RandomNoise (seed)
    if "25" in workflow and "inputs" in workflow["25"]:
        workflow["25"]["inputs"]["noise_seed"] = seed_value
        print(f"Injected seed {seed_value} into node 25")
    else:
        raise ValueError("Workflow configuration error: Node 25 structure invalid for seed.")

    # Node 22 - CFGGuider (guidance scale via 'cfg' parameter)
    if "22" in workflow and "inputs" in workflow["22"]:
        workflow["22"]["inputs"]["cfg"] = guidance
        print(f"Injected guidance {guidance} into node 22 (CFGGuider)")
    else:
        raise ValueError("Workflow configuration error: Node 22 structure invalid for CFGGuider.")

    # Handle reference images (0-10 supported) with dynamic ReferenceLatent chain
    saved_filenames = []
    if is_edit_mode:
        # IMAGE EDITING MODE: Dimensions derived from reference images
        # Based on official Flux2 Klein edit workflow:
        # 1. ReferenceLatent is applied to BOTH positive AND negative conditioning
        # 2. EmptyFlux2LatentImage is still used (not the VAE encoded reference) with reference dimensions
        print(f"Image editing mode: Processing {len(reference_images)} reference image(s)")

        prev_pos_cond = "6"  # Start from CLIPTextEncode (positive prompt)
        prev_neg_cond = "7"  # Start from CLIPTextEncode (negative prompt)
        first_vae_encode_node = None
        first_scale_node_id = None

        for idx, img_base64 in enumerate(reference_images):
            if idx >= 10:
                print(f"Warning: Maximum 10 reference images supported, ignoring extra images")
                break

            # Save the image and get the filename
            filename = save_reference_image(img_base64, idx)
            saved_filenames.append(filename)

            # Define node IDs for this reference image
            load_node_id = str(200 + idx * 10)           # 200, 210, 220...
            scale_node_id = str(201 + idx * 10)          # 201, 211, 221...
            vae_node_id = str(202 + idx * 10)            # 202, 212, 222...
            ref_pos_node_id = str(203 + idx * 10)        # 203, 213, 223... (positive)
            ref_neg_node_id = str(204 + idx * 10)        # 204, 214, 224... (negative)

            # Add LoadImage node
            workflow[load_node_id] = {
                "inputs": {"image": filename, "upload": "image"},
                "class_type": "LoadImage",
                "_meta": {"title": f"Load Reference {idx + 1}"}
            }

            # Add ImageScaleToTotalPixels node
            workflow[scale_node_id] = {
                "inputs": {
                    "upscale_method": "area",
                    "megapixels": 1.0,
                    "resolution_steps": 64,
                    "image": [load_node_id, 0]
                },
                "class_type": "ImageScaleToTotalPixels",
                "_meta": {"title": f"Scale Reference {idx + 1}"}
            }

            # Add VAEEncode node
            workflow[vae_node_id] = {
                "inputs": {
                    "pixels": [scale_node_id, 0],
                    "vae": ["10", 0]
                },
                "class_type": "VAEEncode",
                "_meta": {"title": f"VAE Encode Reference {idx + 1}"}
            }

            # Track first nodes for dimensions
            if first_vae_encode_node is None:
                first_vae_encode_node = vae_node_id
                first_scale_node_id = scale_node_id

            # Add ReferenceLatent for POSITIVE conditioning
            workflow[ref_pos_node_id] = {
                "inputs": {
                    "conditioning": [prev_pos_cond, 0],
                    "latent": [vae_node_id, 0]
                },
                "class_type": "ReferenceLatent",
                "_meta": {"title": f"Reference Latent Pos {idx + 1}"}
            }

            # Add ReferenceLatent for NEGATIVE conditioning
            workflow[ref_neg_node_id] = {
                "inputs": {
                    "conditioning": [prev_neg_cond, 0],
                    "latent": [vae_node_id, 0]
                },
                "class_type": "ReferenceLatent",
                "_meta": {"title": f"Reference Latent Neg {idx + 1}"}
            }

            print(f"Added reference image {idx + 1}: {filename} (nodes {load_node_id}, pos:{ref_pos_node_id}, neg:{ref_neg_node_id})")

            # Update chain pointers for next iteration
            prev_pos_cond = ref_pos_node_id
            prev_neg_cond = ref_neg_node_id

        # Connect final ReferenceLatent nodes to CFGGuider
        workflow["22"]["inputs"]["positive"] = [prev_pos_cond, 0]
        workflow["22"]["inputs"]["negative"] = [prev_neg_cond, 0]
        print(f"Connected CFGGuider: positive from {prev_pos_cond}, negative from {prev_neg_cond}")

        # Add GetImageSize node to extract dimensions from the scaled reference image
        get_size_node_id = "300"
        workflow[get_size_node_id] = {
            "inputs": {
                "image": [first_scale_node_id, 0]
            },
            "class_type": "GetImageSize",
            "_meta": {"title": "Get Reference Size"}
        }
        print(f"Added GetImageSize node {get_size_node_id} connected to scale node {first_scale_node_id}")

        # Node 47 - EmptyFlux2LatentImage: Use dimensions from GetImageSize (NOT from VAE encode)
        # The sampler still uses EmptyFlux2LatentImage, dimensions come from reference
        if "47" in workflow and "inputs" in workflow["47"]:
            workflow["47"]["inputs"]["width"] = [get_size_node_id, 0]
            workflow["47"]["inputs"]["height"] = [get_size_node_id, 1]
            print(f"EmptyFlux2LatentImage (47) now uses dimensions from GetImageSize")

        # Node 48 - Flux2Scheduler: Use dimensions from GetImageSize
        if "48" in workflow and "inputs" in workflow["48"]:
            workflow["48"]["inputs"]["steps"] = steps
            workflow["48"]["inputs"]["width"] = [get_size_node_id, 0]
            workflow["48"]["inputs"]["height"] = [get_size_node_id, 1]
            print(f"Flux2Scheduler (48) steps={steps}, dimensions from GetImageSize")

    else:
        # TEXT-TO-IMAGE MODE: Use user-specified dimensions
        print("Text-to-image mode: Using user-specified dimensions")

        # No reference images: ensure CLIPTextEncode connects directly to CFGGuider positive
        workflow["22"]["inputs"]["positive"] = ["6", 0]

        # Node 47 - EmptyFlux2LatentImage (dimensions)
        if "47" in workflow and "inputs" in workflow["47"]:
            workflow["47"]["inputs"]["width"] = width
            workflow["47"]["inputs"]["height"] = height
            print(f"Injected dimensions {width}x{height} into node 47")
        else:
            raise ValueError("Workflow configuration error: Node 47 structure invalid for dimensions.")

        # Node 48 - Flux2Scheduler (steps and dimensions for scheduler)
        if "48" in workflow and "inputs" in workflow["48"]:
            workflow["48"]["inputs"]["steps"] = steps
            workflow["48"]["inputs"]["width"] = width
            workflow["48"]["inputs"]["height"] = height
            print(f"Injected steps {steps} and dimensions {width}x{height} into node 48")
        else:
            raise ValueError("Workflow configuration error: Node 48 structure invalid for scheduler settings.")

    return workflow, saved_filenames


async def poll_for_result(prompt_id):
    """Poll ComfyUI for the result of a submitted workflow."""
    max_attempts = 120
    poll_interval = 3

    print(f"Polling for result for prompt_id: {prompt_id}...")
    for attempt in range(max_attempts):
        try:
            response = requests.get(f"{COMFYUI_SERVER}/history/{prompt_id}", timeout=10)
            response.raise_for_status()
            history = response.json()

            if prompt_id in history:
                prompt_data = history[prompt_id]
                if "outputs" in prompt_data and prompt_data["outputs"]:
                    outputs = prompt_data["outputs"]

                    # Node 9 is SaveImage in the Flux2 workflow
                    final_result_node_id = "9"

                    # Check for the final output node first
                    if final_result_node_id in outputs:
                        node_outputs = outputs[final_result_node_id]
                        if "images" in node_outputs and isinstance(node_outputs["images"], list) and len(node_outputs["images"]) > 0:
                            image_data = node_outputs["images"][0]
                            if "filename" in image_data:
                                output_filename = image_data["filename"]
                                output_path_container = os.path.join(COMFYUI_OUTPUT_DIR, output_filename)

                                # Add delay to ensure file is fully written and synced
                                print(f"Image {output_filename} reported in outputs, waiting for file sync...")
                                for i in range(10):  # Try up to 10 times with 0.5 second intervals
                                    await asyncio.sleep(0.5)
                                    if os.path.exists(output_path_container):
                                        # File exists, wait a bit more to ensure it's fully written
                                        await asyncio.sleep(0.5)
                                        print(f"Found output image: {output_filename} after {i+1} attempts")
                                        return output_path_container
                                print(f"File {output_filename} reported but not yet on disk. Will retry.")

                    # Fallback: Check all outputs for any image node
                    for node_id, node_outputs in outputs.items():
                        if "images" in node_outputs and isinstance(node_outputs["images"], list) and len(node_outputs["images"]) > 0:
                            image_data = node_outputs["images"][0]
                            if "filename" in image_data:
                                output_filename = image_data["filename"]
                                output_path_container = os.path.join(COMFYUI_OUTPUT_DIR, output_filename)

                                if os.path.exists(output_path_container):
                                    print(f"Found output image from node {node_id}: {output_filename}")
                                    return output_path_container

                    print(f"Attempt {attempt + 1}/{max_attempts}: Outputs present but image file not confirmed on disk yet.")

                else:
                    status_data = prompt_data.get("status", {})
                    status_str = status_data.get("status_str", "N/A")
                    executed = status_data.get("completed", False)

                    if executed and not prompt_data.get("outputs"):
                        raise RuntimeError(f"Workflow {prompt_id} finished without outputs. Status: {status_str}")
                    else:
                        print(f"Attempt {attempt + 1}/{max_attempts}: Processing. Status: {status_str}")

            else:
                # Check if it's still in the queue
                try:
                    queue_response = requests.get(f"{COMFYUI_SERVER}/queue", timeout=5)
                    queue_response.raise_for_status()
                    queue_data = queue_response.json()
                    queued_prompts = [
                        item[1]
                        for item in queue_data.get("queue_running", [])
                        + queue_data.get("queue_pending", [])
                    ]
                    if prompt_id not in queued_prompts:
                        print(f"Warning: Prompt {prompt_id} not in history and not in queue. Retrying...")
                        await asyncio.sleep(1)
                        continue
                    else:
                        print(f"Attempt {attempt + 1}/{max_attempts}: Prompt {prompt_id} is in the queue.")

                except Exception as qe:
                    print(f"Warning: Error checking queue status: {qe}")

        except requests.exceptions.RequestException as e:
            print(f"Warning: Poll attempt {attempt + 1} failed - connection error: {e}")
        except Exception as e:
            print(f"Warning: Poll attempt {attempt + 1} failed - unexpected error: {e}")
            import traceback
            print(traceback.format_exc())

        await asyncio.sleep(poll_interval)

    raise TimeoutError(f"Timeout waiting for image processing results for prompt_id: {prompt_id} after {max_attempts} attempts.")


def cleanup_reference_images(filenames: List[str]):
    """Clean up saved reference images after processing."""
    for filename in filenames:
        filepath = os.path.join(COMFYUI_INPUT_DIR, filename)
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                print(f"Cleaned up reference image: {filename}")
        except OSError as e:
            print(f"Warning: Could not remove reference image {filename}: {e}")
