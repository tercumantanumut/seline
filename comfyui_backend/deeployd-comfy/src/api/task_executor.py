"""Task executor with resource monitoring and timeout handling."""

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import Any

from src.api.resource_monitor import ResourceMonitor
from src.api.task_queue import Task, TaskQueueManager
from src.api.websocket_manager import ProgressTracker, WebSocketManager
from src.api.workflow_executor import WorkflowExecutor

logger = logging.getLogger(__name__)


class TaskExecutor:
    """Execute tasks with resource monitoring and progress tracking."""

    def __init__(
        self,
        queue_manager: TaskQueueManager,
        workflow_executor: WorkflowExecutor,
        websocket_manager: WebSocketManager | None = None,
        resource_monitor: ResourceMonitor | None = None,
        max_concurrent_tasks: int = 2,
        default_timeout: float = 300.0,
        check_interval: float = 2.0,
    ):
        """Initialize task executor.

        Args:
            queue_manager: Task queue manager
            workflow_executor: Workflow executor for ComfyUI
            websocket_manager: WebSocket manager for progress updates
            resource_monitor: Resource monitor for checking system resources
            max_concurrent_tasks: Maximum concurrent task executions
            default_timeout: Default task timeout in seconds
            check_interval: Resource check interval in seconds
        """
        self.queue_manager = queue_manager
        self.workflow_executor = workflow_executor
        self.websocket_manager = websocket_manager
        self.resource_monitor = resource_monitor or ResourceMonitor()
        self.progress_tracker = (
            ProgressTracker(websocket_manager) if websocket_manager else None
        )

        self.max_concurrent_tasks = max_concurrent_tasks
        self.default_timeout = default_timeout
        self.check_interval = check_interval

        # Execution tracking
        self.active_tasks: dict[str, Task] = {}
        self.task_resources: dict[
            str, dict[str, Any]
        ] = {}  # Track resource usage per task
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent_tasks)

        # Resource thresholds
        self.resource_limits = {
            "max_cpu_percent": 90.0,
            "max_memory_percent": 85.0,
            "max_disk_percent": 99.0,
            "min_memory_mb": 512,
            "min_disk_mb": 1024,
        }

        logger.info(f"TaskExecutor initialized with {max_concurrent_tasks} workers")

    async def execute_task(self, task: Task) -> dict[str, Any]:
        """Execute a task with resource monitoring.

        Args:
            task: Task to execute

        Returns:
            Execution result
        """
        logger.info(f"Starting execution of task {task.task_id}")

        # Check resources before execution
        can_execute, reason = await self.check_resources(task)
        if not can_execute:
            logger.warning(f"Cannot execute task {task.task_id}: {reason}")
            raise Exception(f"Resource check failed: {reason}")

        # Track task
        self.active_tasks[task.task_id] = task
        start_time = time.time()

        try:
            # Start progress tracking if available
            if self.progress_tracker:
                await self.progress_tracker.start_execution(
                    task.prompt_id, total_steps=task.parameters.get("steps", 20)
                )

            # Execute with timeout
            result = await self.execute_with_timeout(task)

            # Mark as completed
            execution_time = time.time() - start_time
            self.queue_manager.complete_task(task.task_id, result)

            # Send completion via WebSocket
            if self.progress_tracker:
                await self.progress_tracker.complete_execution(
                    task.prompt_id, images=result.get("images", [])
                )

            logger.info(f"Task {task.task_id} completed in {execution_time:.1f}s")
            return result

        except TimeoutError:
            logger.error(f"Task {task.task_id} timed out")
            self.queue_manager.fail_task(task.task_id, "Execution timeout")

            if self.progress_tracker:
                await self.progress_tracker.complete_execution(
                    task.prompt_id, error="Execution timeout"
                )
            raise

        except Exception as e:
            logger.error(f"Task {task.task_id} failed: {e}")
            self.queue_manager.fail_task(task.task_id, str(e))

            if self.progress_tracker:
                await self.progress_tracker.complete_execution(
                    task.prompt_id, error=str(e)
                )
            raise

        finally:
            # Clean up
            if task.task_id in self.active_tasks:
                del self.active_tasks[task.task_id]
            if task.task_id in self.task_resources:
                del self.task_resources[task.task_id]

    async def check_resources(self, task: Task) -> tuple[bool, str]:
        """Check if resources are available for task execution.

        Args:
            task: Task to check resources for

        Returns:
            Tuple of (can_execute, reason_if_not)
        """
        # Get current resource usage
        usage = self.resource_monitor.get_current_usage()

        # Estimate task requirements
        complexity = self._extract_complexity(task)
        requirements = self.resource_monitor.get_resource_estimate(complexity)

        # Check if we have enough resources
        required_memory = requirements["estimated_memory_mb"]
        required_disk = requirements["estimated_disk_mb"]

        can_execute, reason = self.resource_monitor.check_resource_availability(
            required_memory_mb=required_memory, required_disk_mb=required_disk
        )

        if not can_execute:
            return False, reason

        # Check concurrent task limit
        if len(self.active_tasks) >= self.max_concurrent_tasks:
            return False, f"Max concurrent tasks ({self.max_concurrent_tasks}) reached"

        # Store resource snapshot for monitoring
        self.task_resources[task.task_id] = {
            "start_usage": usage,
            "requirements": requirements,
            "start_time": time.time(),
        }

        return True, "Resources available"

    async def execute_with_timeout(
        self, task: Task, timeout: float | None = None
    ) -> dict[str, Any]:
        """Execute task with timeout.

        Args:
            task: Task to execute
            timeout: Timeout in seconds (uses default if not specified)

        Returns:
            Execution result
        """
        timeout = timeout or self.default_timeout

        # Create execution coroutine
        async def execute() -> dict[str, Any]:
            # Monitor resources during execution
            monitor_task = asyncio.create_task(
                self.monitor_task_resources(task.task_id)
            )

            try:
                # Submit the task's workflow directly
                prompt_id = await self.workflow_executor.submit_workflow(
                    workflow=task.workflow_data, client_id=task.task_id
                )

                # Wait for completion
                result = await self.workflow_executor.wait_for_completion(
                    prompt_id=prompt_id, timeout=timeout
                )

                return result

            finally:
                # Stop monitoring
                monitor_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await monitor_task

        # Execute with timeout
        try:
            result = await asyncio.wait_for(execute(), timeout=timeout)
            return result
        except asyncio.TimeoutError as err:
            raise TimeoutError(f"Task execution exceeded {timeout}s timeout") from err

    async def monitor_task_resources(self, task_id: str) -> None:
        """Monitor resource usage during task execution.

        Args:
            task_id: Task ID to monitor
        """
        while task_id in self.active_tasks:
            try:
                # Get current usage
                usage = self.resource_monitor.get_current_usage()

                # Store snapshot
                if task_id in self.task_resources:
                    self.task_resources[task_id]["current_usage"] = usage
                    self.task_resources[task_id]["last_check"] = time.time()

                # Check if resources are critically low
                if not usage.is_within_limits():
                    logger.warning(f"Task {task_id}: Resources approaching limits")
                    # Could implement throttling or pausing here

                # Update progress if available
                if self.progress_tracker and task_id in self.active_tasks:
                    task = self.active_tasks[task_id]
                    # Send resource update via WebSocket
                    if self.websocket_manager:
                        await self.websocket_manager.broadcast_to_prompt(
                            task.prompt_id,
                            {
                                "type": "resource_update",
                                "cpu_percent": usage.cpu_percent,
                                "memory_percent": usage.memory_percent,
                                "gpu_percent": (
                                    (
                                        usage.gpu_memory_used_mb
                                        / usage.gpu_memory_total_mb
                                        * 100
                                    )
                                    if (
                                        usage.gpu_memory_total_mb
                                        and usage.gpu_memory_used_mb is not None
                                    )
                                    else None
                                ),
                            },
                        )

                await asyncio.sleep(self.check_interval)

            except Exception as e:
                logger.error(f"Error monitoring task {task_id}: {e}")
                await asyncio.sleep(self.check_interval)

    def _extract_complexity(self, task: Task) -> dict[str, Any]:
        """Extract complexity metrics from task.

        Args:
            task: Task to analyze

        Returns:
            Complexity metrics
        """
        params = task.parameters
        workflow = task.workflow_data

        # Count nodes
        total_nodes = len(workflow) if workflow else 10  # Default estimate

        # Extract key parameters
        width = params.get("width", 512)
        height = params.get("height", 512)
        batch_size = params.get("batch_size", 1)
        steps = params.get("steps", 20)

        # Count custom nodes
        custom_nodes = 0
        if workflow:
            for node in workflow.values():
                if isinstance(node, dict):
                    class_type = node.get("class_type", "")
                    # Simple heuristic: if not a common node, consider it custom
                    if class_type and not any(
                        x in class_type
                        for x in ["Load", "Save", "Sampler", "VAE", "CLIP"]
                    ):
                        custom_nodes += 1

        return {
            "total_nodes": total_nodes,
            "custom_nodes": custom_nodes,
            "width": width,
            "height": height,
            "batch_size": batch_size,
            "steps": steps,
        }

    async def can_execute(self) -> bool:
        """Check if executor can accept new tasks.

        Returns:
            True if can execute new tasks
        """
        # Check concurrent task limit
        if len(self.active_tasks) >= self.max_concurrent_tasks:
            return False

        # Check system resources
        usage = self.resource_monitor.get_current_usage()
        return usage.is_within_limits(
            max_cpu_percent=self.resource_limits["max_cpu_percent"],
            max_memory_percent=self.resource_limits["max_memory_percent"],
            max_disk_percent=self.resource_limits["max_disk_percent"],
        )

    def get_task_status(self, task_id: str) -> dict[str, Any] | None:
        """Get status of a running task.

        Args:
            task_id: Task ID

        Returns:
            Task status information
        """
        if task_id not in self.active_tasks:
            return None

        task = self.active_tasks[task_id]
        resources = self.task_resources.get(task_id, {})

        status = {
            "task_id": task_id,
            "prompt_id": task.prompt_id,
            "status": task.status.value,
            "start_time": resources.get("start_time"),
            "elapsed_time": time.time() - resources.get("start_time", time.time()),
            "resource_usage": None,
        }

        if "current_usage" in resources:
            usage = resources["current_usage"]
            status["resource_usage"] = {
                "cpu_percent": usage.cpu_percent,
                "memory_mb": usage.memory_used_mb,
                "memory_percent": usage.memory_percent,
            }

        return status

    def get_active_tasks(self) -> list[dict[str, Any]]:
        """Get list of active tasks.

        Returns:
            List of active task information
        """
        tasks = []
        for task_id in self.active_tasks:
            status = self.get_task_status(task_id)
            if status:
                tasks.append(status)
        return tasks

    def cleanup_resources(self) -> None:
        """Clean up executor resources."""
        # Cancel all active tasks
        for task_id in list(self.active_tasks.keys()):
            self.queue_manager.fail_task(task_id, "Executor shutdown")

        self.active_tasks.clear()
        self.task_resources.clear()

        # Shutdown executor
        self.executor.shutdown(wait=False)

        # Clean old outputs if needed
        self.resource_monitor.cleanup_old_outputs(max_age_hours=24)

        logger.info("TaskExecutor resources cleaned up")

    async def execute_with_callback(
        self, task: Task, progress_callback: Callable | None = None
    ) -> dict[str, Any]:
        """Execute task with progress callback."""

        async def wrapped_callback(node_id: str, progress: float) -> None:
            # Update via WebSocket if available
            if self.progress_tracker:
                await self.progress_tracker.update_progress(
                    task.prompt_id,
                    current_step=int(progress * task.parameters.get("steps", 20)),
                    current_node=node_id,
                )

            # Call user callback if provided
            if progress_callback:
                await progress_callback(node_id, progress)

        # Execute with wrapped callback
        result = await self.workflow_executor.execute_workflow(
            parameters=task.parameters,
            wait_for_completion=True,
            timeout=self.default_timeout,
        )

        return result
