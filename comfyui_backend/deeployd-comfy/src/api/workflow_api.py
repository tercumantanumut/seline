"""FastAPI application for workflow execution with queue and worker management."""

import asyncio
import logging
import os
import tempfile
import typing as t
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import (
    BackgroundTasks,
    FastAPI,
    HTTPException,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from src.api.resource_monitor import ResourceMonitor
from src.api.routers.workflow_router import router as workflow_router
from src.api.task_executor import TaskExecutor
from src.api.task_queue import Task, TaskPriority, TaskQueueManager
from src.api.websocket_manager import WebSocketManager
from src.api.worker_service import WorkerService
from src.api.workflow_executor import (
    WorkflowExecutor,
    WorkflowRequest,
    WorkflowResponse,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: Any) -> t.AsyncIterator[None]:
    """Manage application lifecycle."""
    # Startup
    logger.info("Starting Workflow API Server with Queue and Worker Management")

    # Initialize components
    workflow_path = os.getenv("WORKFLOW_PATH")
    if workflow_path and not os.path.exists(workflow_path):
        logger.warning(f"Workflow path {workflow_path} does not exist, ignoring")
        workflow_path = None

    app.state.workflow_executor = WorkflowExecutor(
        comfyui_host=os.getenv("COMFYUI_HOST", "localhost"),
        comfyui_port=int(os.getenv("COMFYUI_PORT", "8188")),
        workflow_path=workflow_path,
        output_dir=os.getenv(
            "OUTPUT_DIR", os.path.join(tempfile.gettempdir(), "outputs")
        ),
    )

    # Initialize queue manager
    app.state.queue_manager = TaskQueueManager(
        queue_path=os.getenv(
            "QUEUE_PATH", os.path.join(tempfile.gettempdir(), "task_queue.db")
        ),
        max_queue_size=int(os.getenv("MAX_QUEUE_SIZE", "1000")),
    )

    # Initialize WebSocket manager
    app.state.websocket_manager = WebSocketManager(
        max_connections=int(os.getenv("MAX_WS_CONNECTIONS", "100"))
    )

    # Initialize resource monitor
    app.state.resource_monitor = ResourceMonitor(
        output_dir=os.getenv("OUTPUT_DIR", "/app/outputs")
    )

    # Initialize task executor
    app.state.task_executor = TaskExecutor(
        queue_manager=app.state.queue_manager,
        workflow_executor=app.state.workflow_executor,
        websocket_manager=app.state.websocket_manager,
        resource_monitor=app.state.resource_monitor,
        max_concurrent_tasks=int(os.getenv("MAX_CONCURRENT_TASKS", "2")),
        default_timeout=float(os.getenv("TASK_TIMEOUT", "300.0")),
    )

    # Initialize worker service
    app.state.worker_service = WorkerService(
        queue_manager=app.state.queue_manager,
        workflow_executor=app.state.workflow_executor,
        websocket_manager=app.state.websocket_manager,
        config={
            "min_workers": int(os.getenv("MIN_WORKERS", "1")),
            "max_workers": int(os.getenv("MAX_WORKERS", "4")),
            "scale_threshold": int(os.getenv("SCALE_THRESHOLD", "5")),
        },
    )

    # Start worker service in background
    app.state.worker_task = asyncio.create_task(app.state.worker_service.start())

    yield

    # Shutdown
    logger.info("Shutting down Workflow API Server")

    # Stop worker service
    if hasattr(app.state, "worker_service"):
        await app.state.worker_service.stop()

    # Cleanup resources
    if hasattr(app.state, "task_executor"):
        app.state.task_executor.cleanup_resources()


# Create FastAPI app
app = FastAPI(
    title="ComfyUI Workflow API",
    description="REST API for executing ComfyUI workflows with parameter injection",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=False,  # Not using cookies, so set to False
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(workflow_router, prefix="/api/workflows", tags=["workflows"])


# Temporary stub endpoints for builds and executions
@app.get("/api/builds")
async def list_builds() -> list[Any]:
    """Temporary stub for builds endpoint."""
    return []


@app.get("/api/executions")
async def list_executions() -> list[Any]:
    """Temporary stub for executions endpoint."""
    return []


@app.get("/")
async def root() -> dict[str, Any]:
    """Root endpoint with API information."""
    return {
        "name": "ComfyUI Workflow API with Queue Management",
        "version": "2.0.0",
        "endpoints": {
            "workflow": {
                "generate": "/api/generate",
                "status": "/api/status/{prompt_id}",
                "cancel": "/api/cancel/{prompt_id}",
                "image": "/api/images/{filename}",
                "websocket": "/ws/{prompt_id}",
            },
            "queue": {"status": "/api/queue/status", "task": "/api/queue/{task_id}"},
            "workers": {
                "status": "/api/workers/status",
                "pause": "/api/workers/pause",
                "resume": "/api/workers/resume",
                "scale": "/api/workers/scale",
            },
            "resources": {"status": "/api/resources/status"},
            "system": {"health": "/health", "docs": "/docs"},
        },
    }


@app.get("/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "workflow-api"}


@app.post("/api/generate", response_model=WorkflowResponse)
async def generate_image(
    request: WorkflowRequest,
    background_tasks: BackgroundTasks,
    wait: bool = True,
    priority: str = "normal",
) -> WorkflowResponse:
    """Generate image from workflow with parameters using task queue.

    Args:
        request: Workflow parameters
        wait: Whether to wait for completion (default: True)
        priority: Task priority (high/normal/low, default: normal)

    Returns:
        WorkflowResponse with status and images
    """
    queue_manager = app.state.queue_manager
    workflow_executor = app.state.workflow_executor

    # Convert request to dict
    parameters = request.dict(exclude_unset=True)

    # Handle input image if provided
    if parameters.get("input_image"):
        import base64
        import uuid
        from pathlib import Path
        import aiohttp

        input_image = parameters["input_image"]

        # Use the configured input directory
        input_dir = Path(os.getenv("INPUT_DIR", "/app/inputs"))

        # Check if it's a URL
        if input_image.startswith(("http://", "https://")):
            # Download the image
            async with aiohttp.ClientSession() as session:
                async with session.get(input_image) as response:
                    if response.status == 200:
                        image_data = await response.read()

                        # Save to shared inputs directory
                        filename = f"url_{uuid.uuid4().hex[:8]}.png"
                        input_path = input_dir / filename
                        input_dir.mkdir(parents=True, exist_ok=True)

                        with open(input_path, "wb") as f:
                            f.write(image_data)

                        parameters["input_image"] = filename
                        logger.info(f"Downloaded image from URL and saved as {filename} in {input_dir}")
                    else:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Failed to download image from {input_image}"
                        )
        # Check if it's a base64 encoded image
        elif input_image.startswith("data:image"):
            # Extract base64 data
            header, data = input_image.split(",", 1)
            image_data = base64.b64decode(data)

            # Save to shared inputs directory
            filename = f"input_{uuid.uuid4().hex[:8]}.png"
            input_path = input_dir / filename
            input_dir.mkdir(parents=True, exist_ok=True)

            with open(input_path, "wb") as f:
                f.write(image_data)

            parameters["input_image"] = filename
            logger.info(f"Saved input image to {filename}")
        elif input_image.startswith("/") or "\\" in input_image:
            # If it's a full path, extract just the filename
            parameters["input_image"] = Path(input_image).name

    # Handle random seed
    if parameters.get("seed", -1) == -1:
        import random

        parameters["seed"] = random.randint(0, 2**32 - 1)

    # Prepare workflow
    workflow = workflow_executor.inject_parameters(
        workflow_executor.workflow_template, parameters
    )

    # Map priority string to enum
    priority_map = {
        "high": TaskPriority.HIGH,
        "normal": TaskPriority.NORMAL,
        "low": TaskPriority.LOW,
    }
    task_priority = priority_map.get(priority.lower(), TaskPriority.NORMAL)

    # Generate prompt ID
    import uuid

    prompt_id = str(uuid.uuid4())

    # Create task
    task = Task(
        task_id=f"task-{prompt_id}",
        prompt_id=prompt_id,
        workflow_data=workflow,
        parameters=parameters,
        priority=task_priority,
    )

    # Enqueue task
    queue_manager.enqueue_task(task)
    logger.info(f"Enqueued task {task.task_id} with priority {priority}")

    try:
        if wait:
            # Wait for task completion
            timeout = 300.0
            start_time = asyncio.get_event_loop().time()

            while asyncio.get_event_loop().time() - start_time < timeout:
                task = queue_manager.get_task_status(task.task_id)

                if task and task.status.value == "completed":
                    # Get result from task
                    result = task.result or {}
                    images = result.get("images", [])

                    # Handle base64 encoding if requested
                    images_base64 = None
                    if request.return_base64 and images:
                        import base64
                        images_base64 = []
                        for img_path in images:
                            try:
                                # Extract just the filename from the path
                                filename = img_path.split('/')[-1]
                                full_path = Path(os.getenv("OUTPUT_DIR", "/app/outputs")) / filename
                                with open(full_path, "rb") as f:
                                    image_data = f.read()
                                    encoded = base64.b64encode(image_data).decode('utf-8')
                                    images_base64.append(f"data:image/png;base64,{encoded}")
                            except Exception as e:
                                logger.warning(f"Failed to encode image {img_path}: {e}")

                    return WorkflowResponse(
                        prompt_id=prompt_id,
                        status="completed",
                        images=images,
                        images_base64=images_base64,
                    )
                elif task and task.status.value == "failed":
                    raise HTTPException(
                        status_code=500, detail=f"Task failed: {task.error}"
                    )

                await asyncio.sleep(1.0)

            # Timeout
            raise HTTPException(status_code=408, detail="Task execution timeout")

        else:
            # Return immediately with task ID
            return WorkflowResponse(
                prompt_id=prompt_id, status="queued", task_id=task.task_id
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/status/{prompt_id}")
async def get_status(prompt_id: str) -> dict[str, Any]:
    """Get workflow execution status from queue.

    Args:
        prompt_id: Prompt ID to check

    Returns:
        Status information
    """
    queue_manager = app.state.queue_manager
    workflow_executor = app.state.workflow_executor

    try:
        # Try to find task by prompt_id
        task_id = f"task-{prompt_id}"
        task = queue_manager.get_task_status(task_id)

        if task:
            response = {
                "prompt_id": prompt_id,
                "task_id": task_id,
                "status": task.status.value,
                "created_at": datetime.fromtimestamp(task.created_at).isoformat()
                if task.created_at
                else None,
                "started_at": datetime.fromtimestamp(task.started_at).isoformat()
                if task.started_at
                else None,
                "completed_at": datetime.fromtimestamp(task.completed_at).isoformat()
                if task.completed_at
                else None,
                "retry_count": task.retry_count,
                "error_message": task.error,
            }

            # Add images if completed
            if task.status.value == "completed" and task.result:
                response["images"] = task.result.get("images", [])

            return response
        else:
            # Fallback to direct ComfyUI status check
            status = await workflow_executor.get_status(prompt_id)

            # Add images if completed
            if status.get("status") == "completed":
                try:
                    images = await workflow_executor.get_images(prompt_id)
                    status["images"] = images
                except Exception as e:
                    logger.error(f"Error getting images: {e}")

            return t.cast(dict[str, Any], status)

    except Exception as e:
        logger.error(f"Status check error: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/images/{filename}")
async def get_image(filename: str, format: str = "file") -> Any:
    """Serve generated images.

    Args:
        filename: Image filename
        format: Response format ('file' or 'base64')

    Returns:
        Image file or base64 encoded string
    """
    output_dir = Path(os.getenv("OUTPUT_DIR", "/app/outputs"))
    image_path = output_dir / filename

    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    if format == "base64":
        import base64
        with open(image_path, "rb") as f:
            image_data = f.read()
            encoded = base64.b64encode(image_data).decode('utf-8')
            return {"filename": filename, "base64": f"data:image/png;base64,{encoded}"}
    else:
        return FileResponse(path=image_path, media_type="image/png", filename=filename)


@app.websocket("/ws/{prompt_id}")
async def websocket_progress(websocket: Any, prompt_id: str) -> None:
    """Websocket endpoint for real-time progress updates.

    Args:
        websocket: WebSocket connection
        prompt_id: Prompt ID to monitor
    """
    await websocket.accept()

    queue_manager = app.state.queue_manager
    websocket_manager = app.state.websocket_manager
    workflow_executor = app.state.workflow_executor

    # Register connection with WebSocket manager
    client_id = f"client-{prompt_id}"
    await websocket_manager.connect(websocket, client_id, prompt_id=prompt_id)

    try:
        task_id = f"task-{prompt_id}"

        # Monitor task progress
        while True:
            task = queue_manager.get_task_status(task_id)

            if task:
                status_data = {
                    "type": "status_update",
                    "prompt_id": prompt_id,
                    "task_id": task_id,
                    "status": task.status.value,
                    "retry_count": task.retry_count,
                    "error_message": task.error,
                }

                # Add timestamps
                if task.created_at:
                    status_data["created_at"] = datetime.fromtimestamp(
                        task.created_at
                    ).isoformat()
                if task.started_at:
                    status_data["started_at"] = datetime.fromtimestamp(
                        task.started_at
                    ).isoformat()
                if task.completed_at:
                    status_data["completed_at"] = datetime.fromtimestamp(
                        task.completed_at
                    ).isoformat()

                # Add result if completed
                if task.status.value == "completed" and task.result:
                    status_data["images"] = task.result.get("images", [])

                await websocket.send_json(status_data)

                # Exit if task is done
                if task.status.value in ["completed", "failed", "cancelled"]:
                    break
            else:
                # Task not found, try direct ComfyUI status
                try:
                    status = await workflow_executor.get_status(prompt_id)
                    await websocket.send_json(
                        {
                            "type": "status_update",
                            "prompt_id": prompt_id,
                            "status": status.get("status", "unknown"),
                        }
                    )

                    if status.get("status") in ["completed", "failed"]:
                        if status.get("status") == "completed":
                            images = await workflow_executor.get_images(prompt_id)
                            status["images"] = images
                        await websocket.send_json(status)
                        break
                except Exception as e:
                    logger.error(f"Error getting ComfyUI status: {e}")

            await asyncio.sleep(1.0)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for {prompt_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        # Disconnect from WebSocket manager
        await websocket_manager.disconnect(client_id)
        await websocket.close()


@app.get("/api/queue/status")
async def get_queue_status() -> dict[str, Any]:
    """Get queue statistics and status.

    Returns:
        Queue statistics including size, processing, failed counts
    """
    queue_manager = app.state.queue_manager

    stats = queue_manager.get_queue_stats()
    return {
        "status": "active",
        "statistics": stats,
        "queue_sizes": {
            "high_priority": queue_manager.high_queue.size,
            "normal_priority": queue_manager.normal_queue.size,
            "low_priority": queue_manager.low_queue.size,
            "total": queue_manager.get_total_queue_size(),
        },
        "dead_letter_queue_size": queue_manager.dead_letter_queue.size,
    }


@app.get("/api/queue/{task_id}")
async def get_task_status(task_id: str) -> dict[str, Any]:
    """Get individual task status from queue.

    Args:
        task_id: Task ID to check

    Returns:
        Task status information
    """
    queue_manager = app.state.queue_manager

    task = queue_manager.get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "task_id": task_id,
        "prompt_id": task.prompt_id,
        "status": task.status.value,
        "priority": task.priority.value,
        "created_at": datetime.fromtimestamp(task.created_at).isoformat()
        if task.created_at
        else None,
        "started_at": datetime.fromtimestamp(task.started_at).isoformat()
        if task.started_at
        else None,
        "completed_at": datetime.fromtimestamp(task.completed_at).isoformat()
        if task.completed_at
        else None,
        "retry_count": task.retry_count,
        "error_message": task.error,
        "result": task.result,
    }


@app.get("/api/workers/status")
async def get_workers_status() -> dict[str, Any]:
    """Get worker pool status and statistics.

    Returns:
        Worker pool status including active workers and resource usage
    """
    worker_service = app.state.worker_service

    return t.cast(dict[str, Any], worker_service.get_status())


@app.post("/api/workers/pause")
async def pause_workers() -> dict[str, str]:
    """Pause all workers in the pool.

    Returns:
        Confirmation of pause operation
    """
    worker_service = app.state.worker_service

    worker_service.pause()
    return {"status": "paused", "message": "All workers have been paused"}


@app.post("/api/workers/resume")
async def resume_workers() -> dict[str, str]:
    """Resume all paused workers in the pool.

    Returns:
        Confirmation of resume operation
    """
    worker_service = app.state.worker_service

    worker_service.resume()
    return {"status": "resumed", "message": "All workers have been resumed"}


@app.post("/api/workers/scale")
async def scale_workers(target_workers: int) -> dict[str, Any]:
    """Manually scale the worker pool.

    Args:
        target_workers: Target number of workers

    Returns:
        Scaling operation result
    """
    worker_service = app.state.worker_service
    worker_pool = worker_service.worker_pool

    if target_workers < worker_pool.min_workers:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot scale below minimum workers ({worker_pool.min_workers})",
        )

    if target_workers > worker_pool.max_workers:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot scale above maximum workers ({worker_pool.max_workers})",
        )

    current_workers = len(worker_pool.workers)

    if target_workers > current_workers:
        # Scale up
        for _ in range(target_workers - current_workers):
            await worker_pool.add_worker()
        return {
            "status": "scaled_up",
            "previous_workers": current_workers,
            "current_workers": len(worker_pool.workers),
        }
    elif target_workers < current_workers:
        # Scale down
        workers_to_remove = current_workers - target_workers
        removed = 0
        for worker_id in list(worker_pool.workers.keys())[:workers_to_remove]:
            if await worker_pool.remove_worker(worker_id):
                removed += 1
        return {
            "status": "scaled_down",
            "previous_workers": current_workers,
            "current_workers": len(worker_pool.workers),
        }
    else:
        return {"status": "no_change", "current_workers": current_workers}


@app.get("/api/resources/status")
async def get_resource_status() -> dict[str, Any]:
    """Get current system resource usage.

    Returns:
        Current CPU, memory, disk, and GPU usage
    """
    resource_monitor = app.state.resource_monitor

    usage = resource_monitor.get_current_usage()
    system_info = resource_monitor.get_system_info()

    return {
        "current_usage": usage.to_dict(),
        "system_info": system_info,
        "resource_limits": app.state.task_executor.resource_limits,
    }


@app.post("/api/cancel/{prompt_id}")
async def cancel_generation(prompt_id: str) -> dict[str, str]:
    """Cancel a running workflow.

    Args:
        prompt_id: Prompt ID to cancel

    Returns:
        Cancellation status
    """
    queue_manager = app.state.queue_manager

    # Try to cancel task in queue
    task_id = f"task-{prompt_id}"
    task = queue_manager.get_task_status(task_id)

    if task and task.status.value in ["queued", "processing"]:
        # Mark as failed/cancelled
        queue_manager.fail_task(task_id, "Cancelled by user", retry=False)
        return {"status": "cancelled", "prompt_id": prompt_id, "task_id": task_id}

    raise HTTPException(status_code=404, detail="Job not found or already completed")


if __name__ == "__main__":
    uvicorn.run(
        "workflow_api:app",
        host=os.getenv("HOST") or "127.0.0.1",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
        log_level="info",
    )
