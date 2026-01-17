import os
import time
import uuid
import base64
import requests
from PIL import Image
from io import BytesIO
from typing import Any
from fastapi import HTTPException, status

from .utils.logger import logger
from .schema import ProcessRequest
from .comfy_multi import modify_workflow, submit_prompt_to_server, poll_for_result_multi, get_comfyui_servers
from config import COMFYUI_INPUT_DIR, WORKFLOW_TEMPLATE, COMFYUI_SERVER


class Pipeline:
    def __init__(self, request: ProcessRequest):
        self.request = request

    def input_validator(self) -> bytes | Any:
        image_data = None
        if self.request.base64_image:
            try:
                image_data = base64.b64decode(self.request.base64_image)
                logger.info("Decoded image from base64 input.")
            except (base64.binascii.Error, ValueError) as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid base64 input: {e}",
                )
        elif self.request.image_url:
            try:
                logger.info(f"Downloading image from URL: {self.request.image_url}")
                response = requests.get(self.request.image_url, stream=True, timeout=30)
                response.raise_for_status()
                image_data = response.content

                print(f"Successfully downloaded image from URL.")
            except requests.exceptions.RequestException as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to download image from URL: {e}",
                )
        else:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No image source provided (base64 or URL).",
            )

        img = Image.open(BytesIO(image_data))
        img_format = img.format.lower() if img.format else "unknown"

        valid_formats = ["jpeg", "jpg", "png", "webp", "bmp", "tiff"]
        if img_format not in valid_formats:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid image format: {img_format}. Valid formats: {valid_formats}",
            )

        print(f"Validated image format: {img_format}")

        return image_data

    def save_input_image(self, image_data: bytes) -> str:
        unique_filename = f"{uuid.uuid4()}.png"
        input_path = os.path.join(COMFYUI_INPUT_DIR, unique_filename)

        try:
            img = Image.open(BytesIO(image_data))
            img.save(input_path, "PNG")
            print(f"Saved input image to: {input_path}")
            return unique_filename
        except Exception as e:
            logger.error(f"Failed to save input image: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save input image: {e}",
            )

    async def main(self):
        start_time = time.time()

        # Step 1: Validate and save input image
        image_data = self.input_validator()
        image_filename = self.save_input_image(image_data)

        # Step 2: Prepare workflow with parameters
        modified_workflow = modify_workflow(
            workflow_data=WORKFLOW_TEMPLATE,
            image_filename=image_filename,
            room_type=self.request.room_type,
            style=self.request.style,
            seed_value=self.request.seed,
            positive=self.request.positive,
            color_theme=self.request.color_theme
        )

        # Step 3: Submit to ComfyUI (multi-instance aware)
        try:
            # Log available servers
            servers = get_comfyui_servers()
            logger.info(f"Available ComfyUI servers: {servers}")
            
            # Select a server and submit
            selected_server = servers[hash(image_filename) % len(servers)]  # Distribute based on filename
            server, prompt_id = submit_prompt_to_server(selected_server, modified_workflow)
            
            logger.info(f"ComfyUI prompt ID: {prompt_id} on server: {server}")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to submit prompt to ComfyUI: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"ComfyUI service unavailable: {e}",
            )

        # Step 4: Poll for result (multi-instance aware)
        try:
            output_path = await poll_for_result_multi(prompt_id)
        except TimeoutError as e:
            logger.error(f"Timeout waiting for ComfyUI result: {e}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Processing timeout - please try again",
            )
        except Exception as e:
            logger.error(f"Error polling for result: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error processing image: {e}",
            )

        # Step 5: Read and encode output
        try:
            with open(output_path, "rb") as f:
                output_image_data = f.read()
                base64_output = base64.b64encode(output_image_data).decode("utf-8")
                
            process_time = time.time() - start_time
            logger.info(f"Processing completed in {process_time:.2f} seconds")
            
            return {
                "result": base64_output,
                "time_taken": process_time,
                "server_used": server
            }
            
        except Exception as e:
            logger.error(f"Failed to read output image: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read output image: {e}",
            )