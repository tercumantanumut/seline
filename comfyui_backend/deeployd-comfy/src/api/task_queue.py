"""Task queue manager with persist-queue for crash recovery."""

import logging
import os
import tempfile
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any, Protocol, cast

import persistqueue

logger = logging.getLogger(__name__)


class TaskPriority(Enum):
    """Task priority levels."""

    HIGH = 1
    NORMAL = 2
    LOW = 3


class TaskStatus(Enum):
    """Task execution status."""

    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class Task:
    """Task data model."""

    task_id: str
    prompt_id: str
    workflow_data: dict[str, Any]
    parameters: dict[str, Any]
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    retry_count: int = 0
    max_retries: int = 3
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    completed_at: float | None = None
    error: str | None = None
    result: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        data = asdict(self)
        data["priority"] = self.priority.value
        data["status"] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Task":
        """Create from dictionary."""
        data["priority"] = TaskPriority(data["priority"])
        data["status"] = TaskStatus(data["status"])
        return cls(**data)


class TaskQueueManager:
    """Manages task queue with SQLite persistence."""

    class SQLiteQueueLike(Protocol):
        """Minimal protocol for persistqueue-like objects used by TaskQueueManager."""

        size: int

        def put(self, item: Any) -> None:
            """Enqueue an item."""

        def get(self, block: bool = ...) -> Any:
            """Dequeue an item, optionally blocking."""

        def close(self) -> None:
            """Close the underlying queue file/database."""

    def __init__(
        self,
        queue_path: str = os.path.join(tempfile.gettempdir(), "comfyui_queue"),
        max_queue_size: int = 1000,
        auto_commit: bool = True,
    ):
        """Initialize task queue manager.

        Args:
            queue_path: Path for SQLite queue database
            max_queue_size: Maximum number of tasks in queue
            auto_commit: Auto-commit mode for persistence
        """
        self.queue_path = Path(queue_path)
        self.queue_path.mkdir(parents=True, exist_ok=True)
        self.max_queue_size = max_queue_size

        # Create queues for different priorities
        self.high_queue = persistqueue.SQLiteQueue(
            str(self.queue_path / "high"),
            auto_commit=auto_commit,
            multithreading=True,
            timeout=10,
        )
        self.normal_queue = persistqueue.SQLiteQueue(
            str(self.queue_path / "normal"),
            auto_commit=auto_commit,
            multithreading=True,
            timeout=10,
        )
        self.low_queue = persistqueue.SQLiteQueue(
            str(self.queue_path / "low"),
            auto_commit=auto_commit,
            multithreading=True,
            timeout=10,
        )

        # Dead letter queue for failed tasks
        self.dead_letter_queue = persistqueue.SQLiteQueue(
            str(self.queue_path / "dead_letter"),
            auto_commit=auto_commit,
            multithreading=True,
            timeout=10,
        )

        # In-memory task tracking for quick lookups
        self.active_tasks: dict[str, Task] = {}
        self.task_lock = Lock()

        # Statistics
        self.stats = {
            "total_enqueued": 0,
            "total_processed": 0,
            "total_failed": 0,
            "total_retried": 0,
        }

        logger.info(f"TaskQueueManager initialized at {queue_path}")

    def enqueue_task(self, task: Task) -> bool:
        """Add task to queue.

        Args:
            task: Task to enqueue

        Returns:
            True if enqueued successfully
        """
        with self.task_lock:
            # Check queue size while holding lock
            if self.get_total_queue_size() >= self.max_queue_size:
                logger.warning(f"Queue full, rejecting task {task.task_id}")
                return False

            # Select queue based on priority
            queue = self._get_queue_for_priority(task.priority)

            # Update task status
            task.status = TaskStatus.QUEUED

            # Serialize and enqueue
            try:
                queue.put(task.to_dict())

                self.active_tasks[task.task_id] = task
                self.stats["total_enqueued"] += 1

                logger.info(
                    f"Task {task.task_id} enqueued with priority {task.priority.name}"
                )
                return True

            except Exception as e:
                logger.error(f"Failed to enqueue task {task.task_id}: {e}")
                return False

    def dequeue_task(self) -> Task | None:
        """Get next task from queue (priority order).

        Returns:
            Next task or None if queues empty
        """
        # Check queues in priority order
        for queue in [self.high_queue, self.normal_queue, self.low_queue]:
            if queue.size > 0:
                try:
                    task_data = queue.get(block=False)
                    task = Task.from_dict(task_data)

                    # Update status
                    task.status = TaskStatus.PROCESSING
                    task.started_at = time.time()

                    with self.task_lock:
                        self.active_tasks[task.task_id] = task

                    logger.info(f"Dequeued task {task.task_id}")
                    return task

                except Exception as e:
                    # persistqueue might raise different exceptions
                    if "Empty" in str(e.__class__.__name__):
                        continue
                    logger.error(f"Error dequeuing task: {e}")
                    continue

        return None

    def complete_task(self, task_id: str, result: dict[str, Any] | None = None) -> None:
        """Mark task as completed.

        Args:
            task_id: Task ID
            result: Task result
        """
        with self.task_lock:
            if task_id in self.active_tasks:
                task = self.active_tasks[task_id]
                task.status = TaskStatus.COMPLETED
                task.completed_at = time.time()
                task.result = result
                self.stats["total_processed"] += 1

                logger.info(f"Task {task_id} completed")

    def fail_task(self, task_id: str, error: str, retry: bool = True) -> None:
        """Mark task as failed.

        Args:
            task_id: Task ID
            error: Error message
            retry: Whether to retry the task
        """
        with self.task_lock:
            if task_id not in self.active_tasks:
                return

            task = self.active_tasks[task_id]
            task.error = error

            # Check if we should retry
            if retry and task.retry_count < task.max_retries:
                task.retry_count += 1
                task.status = TaskStatus.RETRYING
                self.stats["total_retried"] += 1

                # Re-enqueue with exponential backoff
                backoff_time = 2**task.retry_count
                logger.info(
                    f"Retrying task {task_id} in {backoff_time}s (attempt {task.retry_count}/{task.max_retries})"
                )

                # Reset some fields for re-queueing
                task.started_at = None

                # Select queue based on priority and add directly
                queue = self._get_queue_for_priority(task.priority)
                queue.put(task.to_dict())

            else:
                # Move to dead letter queue
                task.status = TaskStatus.FAILED
                task.completed_at = time.time()
                self.stats["total_failed"] += 1

                self.dead_letter_queue.put(task.to_dict())
                logger.error(f"Task {task_id} failed permanently: {error}")

    def cancel_task(self, task_id: str) -> bool:
        """Cancel a task.

        Args:
            task_id: Task ID to cancel

        Returns:
            True if cancelled successfully
        """
        with self.task_lock:
            if task_id in self.active_tasks:
                task = self.active_tasks[task_id]
                if task.status in [TaskStatus.PENDING, TaskStatus.QUEUED]:
                    task.status = TaskStatus.CANCELLED
                    logger.info(f"Task {task_id} cancelled")
                    return True

        return False

    def get_task_status(self, task_id: str) -> Task | None:
        """Get task status.

        Args:
            task_id: Task ID

        Returns:
            Task object or None
        """
        with self.task_lock:
            if task_id in self.active_tasks:
                return self.active_tasks[task_id]
        return None

    def get_queue_position(self, task_id: str) -> int:
        """Get position of task in queue.

        Args:
            task_id: Task ID

        Returns:
            Queue position (0 if processing, -1 if not found)
        """
        with self.task_lock:
            if task_id not in self.active_tasks:
                return -1

            task = self.active_tasks[task_id]
            if task.status == TaskStatus.PROCESSING:
                return 0

            # Count tasks ahead in queue
            position = 1
            for queue in self._get_queues_for_priority(task.priority):
                # This is approximate as we can't iterate queue without consuming
                position += queue.size

            return position

    def get_total_queue_size(self) -> int:
        """Get total number of tasks in all queues."""
        return int(self.high_queue.size + self.normal_queue.size + self.low_queue.size)

    def get_queue_stats(self) -> dict[str, Any]:
        """Get queue statistics."""
        with self.task_lock:
            active_count = sum(
                1
                for task in self.active_tasks.values()
                if task.status == TaskStatus.PROCESSING
            )

            return {
                **self.stats,
                "queue_sizes": {
                    "high": self.high_queue.size,
                    "normal": self.normal_queue.size,
                    "low": self.low_queue.size,
                    "dead_letter": self.dead_letter_queue.size,
                },
                "active_tasks": active_count,
                "total_tasks": len(self.active_tasks),
            }

    def recover_dead_letters(self, max_recover: int = 10) -> list[Task]:
        """Recover tasks from dead letter queue.

        Args:
            max_recover: Maximum number of tasks to recover

        Returns:
            List of recovered tasks
        """
        recovered = []

        for _ in range(min(max_recover, self.dead_letter_queue.size)):
            try:
                task_data = self.dead_letter_queue.get(block=False)
                task = Task.from_dict(task_data)

                # Reset for retry
                task.retry_count = 0
                task.status = TaskStatus.PENDING
                task.error = None

                if self.enqueue_task(task):
                    recovered.append(task)
                    logger.info(f"Recovered task {task.task_id} from dead letter queue")

            except Exception as e:
                # Check for empty queue
                if (
                    "Empty" in str(e.__class__.__name__)
                    or self.dead_letter_queue.size == 0
                ):
                    break
                logger.error(f"Error recovering dead letter: {e}")

        return recovered

    def cleanup_completed(self, older_than_seconds: int = 3600) -> None:
        """Remove completed tasks older than specified time.

        Args:
            older_than_seconds: Age threshold in seconds
        """
        current_time = time.time()
        to_remove = []

        with self.task_lock:
            for task_id, task in self.active_tasks.items():
                if (
                    task.status == TaskStatus.COMPLETED
                    and task.completed_at
                    and (current_time - task.completed_at) > older_than_seconds
                ):
                    to_remove.append(task_id)

            for task_id in to_remove:
                del self.active_tasks[task_id]

            if to_remove:
                logger.info(f"Cleaned up {len(to_remove)} completed tasks")

    def _get_queue_for_priority(self, priority: TaskPriority) -> SQLiteQueueLike:
        """Get queue for given priority."""
        if priority == TaskPriority.HIGH:
            return cast(TaskQueueManager.SQLiteQueueLike, self.high_queue)
        elif priority == TaskPriority.LOW:
            return cast(TaskQueueManager.SQLiteQueueLike, self.low_queue)
        return cast(TaskQueueManager.SQLiteQueueLike, self.normal_queue)

    def _get_queues_for_priority(self, priority: TaskPriority) -> list[SQLiteQueueLike]:
        """Get queues to check in order for given priority."""
        if priority == TaskPriority.HIGH:
            return [self.high_queue]
        elif priority == TaskPriority.LOW:
            return [self.high_queue, self.normal_queue, self.low_queue]
        return [self.high_queue, self.normal_queue]

    def close(self) -> None:
        """Close all queues."""
        for queue in [
            self.high_queue,
            self.normal_queue,
            self.low_queue,
            self.dead_letter_queue,
        ]:
            try:
                queue.close()
            except Exception as e:
                logger.error(f"Error closing queue: {e}")

        logger.info("TaskQueueManager closed")
