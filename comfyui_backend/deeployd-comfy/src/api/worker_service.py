"""Background worker service for processing tasks from queue."""

import asyncio
import contextlib
import logging
import os
import signal
import threading
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any

from src.api.resource_monitor import ResourceMonitor
from src.api.task_executor import TaskExecutor
from src.api.task_queue import Task, TaskQueueManager
from src.api.websocket_manager import WebSocketManager
from src.api.workflow_executor import WorkflowExecutor

logger = logging.getLogger(__name__)


class WorkerStatus(Enum):
    """Worker status states."""

    IDLE = "idle"
    PROCESSING = "processing"
    PAUSED = "paused"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


@dataclass
class WorkerInfo:
    """Information about a worker."""

    worker_id: str
    status: WorkerStatus
    current_task: str | None = None
    tasks_completed: int = 0
    tasks_failed: int = 0
    start_time: float = 0.0
    last_task_time: float = 0.0
    error_message: str | None = None


class Worker:
    """Individual worker that processes tasks."""

    def __init__(
        self,
        worker_id: str,
        queue_manager: TaskQueueManager,
        task_executor: TaskExecutor,
        poll_interval: float = 2.0,
    ):
        """Initialize worker.

        Args:
            worker_id: Unique worker identifier
            queue_manager: Task queue manager
            task_executor: Task executor
            poll_interval: Queue polling interval in seconds
        """
        self.worker_id = worker_id
        self.queue_manager = queue_manager
        self.task_executor = task_executor
        self.poll_interval = poll_interval

        self.info = WorkerInfo(
            worker_id=worker_id, status=WorkerStatus.IDLE, start_time=time.time()
        )

        self.running = False
        self.paused = False
        self._task: Task | None = None

        logger.info(f"Worker {worker_id} initialized")

    async def start(self) -> None:
        """Start worker processing loop."""
        self.running = True
        self.info.status = WorkerStatus.IDLE

        logger.info(f"Worker {self.worker_id} started")

        while self.running:
            try:
                # Check if paused
                if self.paused:
                    self.info.status = WorkerStatus.PAUSED
                    await asyncio.sleep(self.poll_interval)
                    continue

                # Check if executor can accept tasks
                if not await self.task_executor.can_execute():
                    await asyncio.sleep(self.poll_interval)
                    continue

                # Get next task from queue
                task = self.queue_manager.dequeue_task()

                if task:
                    await self.process_task(task)
                else:
                    # No tasks available
                    self.info.status = WorkerStatus.IDLE
                    self.info.current_task = None
                    await asyncio.sleep(self.poll_interval)

            except Exception as e:
                logger.error(f"Worker {self.worker_id} error: {e}")
                self.info.status = WorkerStatus.ERROR
                self.info.error_message = str(e)
                await asyncio.sleep(self.poll_interval)

        self.info.status = WorkerStatus.STOPPED
        logger.info(f"Worker {self.worker_id} stopped")

    async def process_task(self, task: Task) -> None:
        """Process a single task.

        Args:
            task: Task to process
        """
        logger.info(f"Worker {self.worker_id} processing task {task.task_id}")

        self.info.status = WorkerStatus.PROCESSING
        self.info.current_task = task.task_id
        self._task = task

        try:
            # Execute task
            await self.task_executor.execute_task(task)

            # Update stats
            self.info.tasks_completed += 1
            self.info.last_task_time = time.time()

            logger.info(f"Worker {self.worker_id} completed task {task.task_id}")

        except Exception as e:
            logger.error(f"Worker {self.worker_id} failed task {task.task_id}: {e}")
            self.info.tasks_failed += 1
            self.info.last_task_time = time.time()
            self.info.error_message = str(e)

        finally:
            self._task = None
            self.info.current_task = None

    def pause(self) -> None:
        """Pause worker processing."""
        self.paused = True
        logger.info(f"Worker {self.worker_id} paused")

    def resume(self) -> None:
        """Resume worker processing."""
        self.paused = False
        logger.info(f"Worker {self.worker_id} resumed")

    def stop(self) -> None:
        """Stop worker processing."""
        self.running = False
        self.info.status = WorkerStatus.STOPPING
        logger.info(f"Worker {self.worker_id} stopping")

    def get_info(self) -> WorkerInfo:
        """Get worker information."""
        return self.info


class WorkerPool:
    """Manages a pool of workers."""

    def __init__(
        self,
        queue_manager: TaskQueueManager,
        workflow_executor: WorkflowExecutor,
        websocket_manager: WebSocketManager | None = None,
        min_workers: int = 1,
        max_workers: int = 4,
        scale_threshold: int = 5,
    ):
        """Initialize worker pool.

        Args:
            queue_manager: Task queue manager
            workflow_executor: Workflow executor
            websocket_manager: Optional WebSocket manager
            min_workers: Minimum number of workers
            max_workers: Maximum number of workers
            scale_threshold: Queue size threshold for scaling
        """
        self.queue_manager = queue_manager
        self.workflow_executor = workflow_executor
        self.websocket_manager = websocket_manager

        self.min_workers = min_workers
        self.max_workers = max_workers
        self.scale_threshold = scale_threshold

        self.workers: dict[str, Worker] = {}
        self.worker_tasks: dict[str, asyncio.Task] = {}
        self.resource_monitor = ResourceMonitor(
            output_dir=os.getenv("OUTPUT_DIR", "/app/outputs")
        )

        # Create shared task executor
        self.task_executor = TaskExecutor(
            queue_manager=queue_manager,
            workflow_executor=workflow_executor,
            websocket_manager=websocket_manager,
            resource_monitor=self.resource_monitor,
            max_concurrent_tasks=max_workers,
        )

        self.running = False
        self.monitor_task: asyncio.Task[Any] | None = None

        logger.info(f"WorkerPool initialized (min={min_workers}, max={max_workers})")

    async def start(self) -> None:
        """Start the worker pool."""
        self.running = True

        # Start minimum workers
        for i in range(self.min_workers):
            await self.add_worker(f"worker-{i}")

        # Start monitoring task
        self.monitor_task = asyncio.create_task(self.monitor_and_scale())

        logger.info(f"WorkerPool started with {len(self.workers)} workers")

    async def add_worker(self, worker_id: str | None = None) -> bool:
        """Add a new worker to the pool.

        Args:
            worker_id: Optional worker ID

        Returns:
            True if worker added successfully
        """
        if len(self.workers) >= self.max_workers:
            logger.warning("Cannot add worker: max workers reached")
            return False

        if not worker_id:
            worker_id = f"worker-{len(self.workers)}"

        if worker_id in self.workers:
            logger.warning(f"Worker {worker_id} already exists")
            return False

        # Create and start worker
        worker = Worker(
            worker_id=worker_id,
            queue_manager=self.queue_manager,
            task_executor=self.task_executor,
        )

        self.workers[worker_id] = worker
        self.worker_tasks[worker_id] = asyncio.create_task(worker.start())

        logger.info(f"Added worker {worker_id}")
        return True

    async def remove_worker(self, worker_id: str) -> bool:
        """Remove a worker from the pool.

        Args:
            worker_id: Worker ID to remove

        Returns:
            True if worker removed successfully
        """
        if worker_id not in self.workers:
            logger.warning(f"Worker {worker_id} not found")
            return False

        if len(self.workers) <= self.min_workers:
            logger.warning("Cannot remove worker: min workers reached")
            return False

        # Stop worker
        worker = self.workers[worker_id]
        worker.stop()

        # Wait for task to complete
        if worker_id in self.worker_tasks:
            task = self.worker_tasks[worker_id]
            try:
                await asyncio.wait_for(task, timeout=10.0)
            except asyncio.TimeoutError:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

        # Remove from pool
        del self.workers[worker_id]
        del self.worker_tasks[worker_id]

        logger.info(f"Removed worker {worker_id}")
        return True

    async def monitor_and_scale(self) -> None:
        """Monitor queue and scale workers as needed."""
        while self.running:
            try:
                # Get queue size
                queue_size = self.queue_manager.get_total_queue_size()
                active_workers = len(self.workers)

                # Check resource usage
                usage = self.resource_monitor.get_current_usage()

                # Scale up if queue is large and resources available
                if (
                    queue_size > self.scale_threshold * active_workers
                    and active_workers < self.max_workers
                    and usage.memory_percent < 70
                    and usage.cpu_percent < 80
                ):
                    await self.add_worker()
                    logger.info(
                        f"Scaled up to {len(self.workers)} workers (queue size: {queue_size})"
                    )

                # Scale down if queue is small
                elif queue_size < active_workers and active_workers > self.min_workers:
                    # Find idle worker to remove
                    for worker_id, worker in self.workers.items():
                        if worker.info.status == WorkerStatus.IDLE:
                            await self.remove_worker(worker_id)
                            logger.info(f"Scaled down to {len(self.workers)} workers")
                            break

                # Sleep before next check
                await asyncio.sleep(10.0)

            except Exception as e:
                logger.error(f"Error in monitor_and_scale: {e}")
                await asyncio.sleep(10.0)

    def pause_all(self) -> None:
        """Pause all workers."""
        for worker in self.workers.values():
            worker.pause()
        logger.info("All workers paused")

    def resume_all(self) -> None:
        """Resume all workers."""
        for worker in self.workers.values():
            worker.resume()
        logger.info("All workers resumed")

    async def stop(self) -> None:
        """Stop the worker pool."""
        self.running = False

        # Cancel monitoring
        if self.monitor_task:
            self.monitor_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.monitor_task

        # Stop all workers
        for worker in self.workers.values():
            worker.stop()

        # Wait for all worker tasks with timeout
        if self.worker_tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*self.worker_tasks.values(), return_exceptions=True),
                    timeout=2.0,  # 2 second timeout
                )
            except asyncio.TimeoutError:
                # Force cancel all tasks
                for task in self.worker_tasks.values():
                    task.cancel()
                # Wait briefly for cancellation
                await asyncio.sleep(0.1)

        # Cleanup
        self.task_executor.cleanup_resources()

        logger.info("WorkerPool stopped")

    def get_status(self) -> dict[str, Any]:
        """Get worker pool status.

        Returns:
            Pool status information
        """
        worker_info = []
        for worker in self.workers.values():
            info = worker.get_info()
            worker_info.append(
                {
                    "worker_id": info.worker_id,
                    "status": info.status.value,
                    "current_task": info.current_task,
                    "tasks_completed": info.tasks_completed,
                    "tasks_failed": info.tasks_failed,
                    "uptime": time.time() - info.start_time,
                }
            )

        # Get resource usage
        usage = self.resource_monitor.get_current_usage()

        return {
            "workers": worker_info,
            "worker_count": len(self.workers),
            "min_workers": self.min_workers,
            "max_workers": self.max_workers,
            "queue_size": self.queue_manager.get_total_queue_size(),
            "queue_stats": self.queue_manager.get_queue_stats(),
            "resources": {
                "cpu_percent": usage.cpu_percent,
                "memory_percent": usage.memory_percent,
                "memory_available_mb": usage.memory_available_mb,
            },
        }


class WorkerService:
    """Main worker service that manages the worker pool."""

    def __init__(
        self,
        queue_manager: TaskQueueManager,
        workflow_executor: WorkflowExecutor,
        websocket_manager: WebSocketManager | None = None,
        config: dict[str, Any] | None = None,
    ):
        """Initialize worker service.

        Args:
            queue_manager: Task queue manager
            workflow_executor: Workflow executor
            websocket_manager: Optional WebSocket manager
            config: Service configuration
        """
        config = config or {}

        self.worker_pool = WorkerPool(
            queue_manager=queue_manager,
            workflow_executor=workflow_executor,
            websocket_manager=websocket_manager,
            min_workers=config.get("min_workers", 1),
            max_workers=config.get("max_workers", 4),
            scale_threshold=config.get("scale_threshold", 5),
        )

        self.running = False
        self._shutdown_event = asyncio.Event()

        # Setup signal handlers
        self._setup_signal_handlers()

        logger.info("WorkerService initialized")

    def _setup_signal_handlers(self) -> None:
        """Set up signal handlers for graceful shutdown."""
        # Skip signal handlers if not in main thread (e.g., during tests)
        if threading.current_thread() is not threading.main_thread():
            logger.debug("Skipping signal handler setup - not in main thread")
            return

        def signal_handler(sig: int, _frame: Any) -> None:
            logger.info(f"Received signal {sig}, initiating shutdown")
            self._shutdown_event.set()

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

    async def start(self) -> None:
        """Start the worker service."""
        logger.info("Starting WorkerService")
        self.running = True

        # Start worker pool
        await self.worker_pool.start()

        # Wait for shutdown signal
        await self._shutdown_event.wait()

        # Graceful shutdown
        await self.stop()

    async def stop(self) -> None:
        """Stop the worker service."""
        logger.info("Stopping WorkerService")
        self.running = False

        # Stop worker pool
        await self.worker_pool.stop()

        logger.info("WorkerService stopped")

    def get_status(self) -> dict[str, Any]:
        """Get service status.

        Returns:
            Service status information
        """
        return {"running": self.running, "pool_status": self.worker_pool.get_status()}

    def pause(self) -> None:
        """Pause all workers."""
        self.worker_pool.pause_all()

    def resume(self) -> None:
        """Resume all workers."""
        self.worker_pool.resume_all()
