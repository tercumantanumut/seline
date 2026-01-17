import os
import time
import uuid
import base64
from PIL import Image
from io import BytesIO
from typing import Any, List
from fastapi import HTTPException, status

from .utils.logger import logger
from .schema import ProcessRequest
from .comfy import modify_workflow, poll_for_result, cleanup_reference_images
from config import WORKFLOW_TEMPLATE, COMFYUI_SERVER
import requests


class Pipeline:
    def __init__(self, request: ProcessRequest):
        self.request = request

    async def main(self):
        start = time.perf_counter()
        saved_ref_filenames: List[str] = []
        output_image_path_container = None

        try:
            uuid_name = uuid.uuid4()

            # Modify workflow with Flux2 parameters
            modified_workflow, saved_ref_filenames = modify_workflow(
                WORKFLOW_TEMPLATE,
                prompt=self.request.prompt,
                width=self.request.width,
                height=self.request.height,
                guidance=self.request.guidance,
                steps=self.request.steps,
                seed_value=self.request.seed,
                reference_images=self.request.reference_images,
            )

            payload = {
                "prompt": modified_workflow,
                "client_id": f"fastapi-client-{uuid_name}",
            }

            logger.info(f"Submitting job to ComfyUI server: {COMFYUI_SERVER}")
            response = requests.post(f"{COMFYUI_SERVER}/prompt", json=payload)
            response.raise_for_status()
            prompt_id = response.json()["prompt_id"]
            print(f"ComfyUI prompt ID: {prompt_id}")

            # Poll for result
            output_image_path_container = await poll_for_result(prompt_id)
            print(f"Output image received: {output_image_path_container}")

            if not os.path.exists(output_image_path_container):
                print(f"ERROR: Output file {output_image_path_container} not found after polling.")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="ComfyUI finished but output file not found.",
                )

            # Convert output to base64
            image = Image.open(output_image_path_container)
            buffered = BytesIO()
            image.save(buffered, format="png")
            output_image_base64 = base64.b64encode(buffered.getvalue())

            end = time.perf_counter()
            return {
                "result": output_image_base64,
                "seed": self.request.seed,
                "time_taken": end - start
            }

        except Exception as e:
            end = time.perf_counter()
            import traceback
            logger.error(traceback.format_exc())

            if isinstance(e, HTTPException):
                raise e

            raise HTTPException(
                status_code=500,
                detail={"error": str(e), "time_taken": end - start}
            )
        finally:
            # Cleanup output file if it exists
            if output_image_path_container and os.path.exists(output_image_path_container):
                try:
                    os.remove(output_image_path_container)
                    logger.info(f"Cleaned up output file: {output_image_path_container}")
                except OSError as e:
                    logger.warning(f"Warning: Could not remove output file {output_image_path_container}: {e}")

            # Cleanup reference images
            if saved_ref_filenames:
                cleanup_reference_images(saved_ref_filenames)
