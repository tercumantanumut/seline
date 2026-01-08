"""Tests for TaskQueueManager with persist-queue."""

import pytest
import time
import tempfile
import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.api.task_queue import (
    TaskQueueManager,
    Task,
    TaskPriority,
    TaskStatus
)


class TestTask:
    """Test Task data model."""
    
    def test_task_creation(self):
        """Test creating a task."""
        task = Task(
            task_id="test-123",
            prompt_id="prompt-456",
            workflow_data={"test": "data"},
            parameters={"param": "value"},
            priority=TaskPriority.HIGH
        )
        
        assert task.task_id == "test-123"
        assert task.prompt_id == "prompt-456"
        assert task.priority == TaskPriority.HIGH
        assert task.status == TaskStatus.PENDING
        assert task.retry_count == 0
        assert task.max_retries == 3
    
    def test_task_serialization(self):
        """Test task to_dict and from_dict."""
        task = Task(
            task_id="test-123",
            prompt_id="prompt-456",
            workflow_data={"test": "data"},
            parameters={"param": "value"},
            priority=TaskPriority.NORMAL,
            status=TaskStatus.QUEUED
        )
        
        # Serialize
        data = task.to_dict()
        assert data["task_id"] == "test-123"
        assert data["priority"] == TaskPriority.NORMAL.value
        assert data["status"] == TaskStatus.QUEUED.value
        
        # Deserialize
        task2 = Task.from_dict(data)
        assert task2.task_id == task.task_id
        assert task2.priority == task.priority
        assert task2.status == task.status


class TestTaskQueueManager:
    """Test TaskQueueManager functionality."""
    
    @pytest.fixture
    def temp_queue_path(self):
        """Create temporary queue path."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        # Cleanup
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    @pytest.fixture
    def queue_manager(self, temp_queue_path):
        """Create TaskQueueManager instance."""
        manager = TaskQueueManager(
            queue_path=temp_queue_path,
            max_queue_size=10,
            auto_commit=True
        )
        yield manager
        manager.close()
    
    @pytest.fixture
    def sample_task(self):
        """Create sample task."""
        return Task(
            task_id="test-task-1",
            prompt_id="prompt-1",
            workflow_data={"nodes": []},
            parameters={"positive_prompt": "test"}
        )
    
    def test_queue_initialization(self, queue_manager):
        """Test queue manager initialization."""
        assert queue_manager.get_total_queue_size() == 0
        stats = queue_manager.get_queue_stats()
        assert stats["total_enqueued"] == 0
        assert stats["total_processed"] == 0
        assert stats["total_failed"] == 0
    
    def test_enqueue_task(self, queue_manager, sample_task):
        """Test enqueueing a task."""
        result = queue_manager.enqueue_task(sample_task)
        
        assert result is True
        assert queue_manager.get_total_queue_size() == 1
        assert sample_task.status == TaskStatus.QUEUED
        
        stats = queue_manager.get_queue_stats()
        assert stats["total_enqueued"] == 1
        assert stats["queue_sizes"]["normal"] == 1
    
    def test_dequeue_task(self, queue_manager, sample_task):
        """Test dequeueing a task."""
        queue_manager.enqueue_task(sample_task)
        
        dequeued = queue_manager.dequeue_task()
        
        assert dequeued is not None
        assert dequeued.task_id == sample_task.task_id
        assert dequeued.status == TaskStatus.PROCESSING
        assert dequeued.started_at is not None
        assert queue_manager.get_total_queue_size() == 0
    
    def test_priority_ordering(self, queue_manager):
        """Test tasks are dequeued in priority order."""
        # Create tasks with different priorities
        low_task = Task(
            task_id="low",
            prompt_id="p1",
            workflow_data={},
            parameters={},
            priority=TaskPriority.LOW
        )
        normal_task = Task(
            task_id="normal",
            prompt_id="p2",
            workflow_data={},
            parameters={},
            priority=TaskPriority.NORMAL
        )
        high_task = Task(
            task_id="high",
            prompt_id="p3",
            workflow_data={},
            parameters={},
            priority=TaskPriority.HIGH
        )
        
        # Enqueue in reverse priority order
        queue_manager.enqueue_task(low_task)
        queue_manager.enqueue_task(normal_task)
        queue_manager.enqueue_task(high_task)
        
        # Should dequeue in priority order
        task1 = queue_manager.dequeue_task()
        assert task1.task_id == "high"
        
        task2 = queue_manager.dequeue_task()
        assert task2.task_id == "normal"
        
        task3 = queue_manager.dequeue_task()
        assert task3.task_id == "low"
    
    def test_complete_task(self, queue_manager, sample_task):
        """Test completing a task."""
        queue_manager.enqueue_task(sample_task)
        dequeued = queue_manager.dequeue_task()
        
        result = {"images": ["image1.png"]}
        queue_manager.complete_task(dequeued.task_id, result)
        
        status = queue_manager.get_task_status(dequeued.task_id)
        assert status == TaskStatus.COMPLETED
        
        task = queue_manager.active_tasks[dequeued.task_id]
        assert task.completed_at is not None
        assert task.result == result
        
        stats = queue_manager.get_queue_stats()
        assert stats["total_processed"] == 1
    
    def test_fail_task_with_retry(self, queue_manager, sample_task):
        """Test failing a task with retry."""
        queue_manager.enqueue_task(sample_task)
        dequeued = queue_manager.dequeue_task()
        
        # Fail with retry
        queue_manager.fail_task(dequeued.task_id, "Test error", retry=True)
        
        task = queue_manager.active_tasks[dequeued.task_id]
        assert task.status == TaskStatus.RETRYING
        assert task.retry_count == 1
        assert task.error == "Test error"
        
        # Task should be re-queued
        assert queue_manager.get_total_queue_size() == 1
        
        stats = queue_manager.get_queue_stats()
        assert stats["total_retried"] == 1
    
    def test_fail_task_max_retries(self, queue_manager, sample_task):
        """Test task moves to dead letter after max retries."""
        sample_task.retry_count = 3  # Already at max
        queue_manager.enqueue_task(sample_task)
        dequeued = queue_manager.dequeue_task()
        
        # Fail with retry (but already at max)
        queue_manager.fail_task(dequeued.task_id, "Final error", retry=True)
        
        task = queue_manager.active_tasks[dequeued.task_id]
        assert task.status == TaskStatus.FAILED
        assert task.error == "Final error"
        
        # Should be in dead letter queue
        assert queue_manager.dead_letter_queue.size == 1
        assert queue_manager.get_total_queue_size() == 0
        
        stats = queue_manager.get_queue_stats()
        assert stats["total_failed"] == 1
    
    def test_cancel_task(self, queue_manager, sample_task):
        """Test cancelling a task."""
        queue_manager.enqueue_task(sample_task)
        
        result = queue_manager.cancel_task(sample_task.task_id)
        
        assert result is True
        status = queue_manager.get_task_status(sample_task.task_id)
        assert status == TaskStatus.CANCELLED
    
    def test_get_queue_position(self, queue_manager):
        """Test getting queue position."""
        # Create multiple tasks
        tasks = []
        for i in range(3):
            task = Task(
                task_id=f"task-{i}",
                prompt_id=f"prompt-{i}",
                workflow_data={},
                parameters={}
            )
            tasks.append(task)
            queue_manager.enqueue_task(task)
        
        # First task not started yet
        pos = queue_manager.get_queue_position(tasks[0].task_id)
        assert pos > 0  # In queue
        
        # Start processing first task
        dequeued = queue_manager.dequeue_task()
        pos = queue_manager.get_queue_position(dequeued.task_id)
        assert pos == 0  # Processing
        
        # Non-existent task
        pos = queue_manager.get_queue_position("non-existent")
        assert pos == -1
    
    def test_max_queue_size(self, queue_manager):
        """Test queue size limit."""
        # Fill queue to max
        for i in range(10):
            task = Task(
                task_id=f"task-{i}",
                prompt_id=f"prompt-{i}",
                workflow_data={},
                parameters={}
            )
            result = queue_manager.enqueue_task(task)
            assert result is True
        
        # Try to add one more
        overflow_task = Task(
            task_id="overflow",
            prompt_id="overflow",
            workflow_data={},
            parameters={}
        )
        result = queue_manager.enqueue_task(overflow_task)
        assert result is False  # Should be rejected
    
    def test_recover_dead_letters(self, queue_manager):
        """Test recovering tasks from dead letter queue."""
        # Create and fail a task
        task = Task(
            task_id="failed-task",
            prompt_id="prompt",
            workflow_data={},
            parameters={},
            retry_count=3  # Max retries reached
        )
        queue_manager.enqueue_task(task)
        dequeued = queue_manager.dequeue_task()
        queue_manager.fail_task(dequeued.task_id, "Error", retry=True)
        
        # Should be in dead letter
        assert queue_manager.dead_letter_queue.size == 1
        
        # Recover it
        recovered = queue_manager.recover_dead_letters(max_recover=1)
        
        assert len(recovered) == 1
        assert recovered[0].task_id == "failed-task"
        assert recovered[0].retry_count == 0  # Reset
        assert recovered[0].status == TaskStatus.QUEUED
        
        # Should be back in normal queue
        assert queue_manager.get_total_queue_size() == 1
        assert queue_manager.dead_letter_queue.size == 0
    
    def test_cleanup_completed(self, queue_manager):
        """Test cleaning up old completed tasks."""
        # Create and complete a task
        task = Task(
            task_id="old-task",
            prompt_id="prompt",
            workflow_data={},
            parameters={}
        )
        queue_manager.enqueue_task(task)
        dequeued = queue_manager.dequeue_task()
        queue_manager.complete_task(dequeued.task_id, {"result": "done"})
        
        # Set completed time to past
        queue_manager.active_tasks[dequeued.task_id].completed_at = time.time() - 7200
        
        # Should have 1 task
        assert len(queue_manager.active_tasks) == 1
        
        # Cleanup tasks older than 1 hour
        queue_manager.cleanup_completed(older_than_seconds=3600)
        
        # Should be removed
        assert len(queue_manager.active_tasks) == 0
    
    def test_queue_persistence(self, temp_queue_path):
        """Test queue persists across restarts."""
        # Create first manager and add tasks
        manager1 = TaskQueueManager(queue_path=temp_queue_path)
        
        task1 = Task(
            task_id="persist-1",
            prompt_id="p1",
            workflow_data={"data": "test"},
            parameters={"param": "value"}
        )
        task2 = Task(
            task_id="persist-2",
            prompt_id="p2",
            workflow_data={"data": "test2"},
            parameters={"param": "value2"}
        )
        
        manager1.enqueue_task(task1)
        manager1.enqueue_task(task2)
        
        assert manager1.get_total_queue_size() == 2
        manager1.close()
        
        # Create new manager with same path
        manager2 = TaskQueueManager(queue_path=temp_queue_path)
        
        # Tasks should still be there
        assert manager2.get_total_queue_size() == 2
        
        # Dequeue and verify
        dequeued1 = manager2.dequeue_task()
        assert dequeued1.task_id == "persist-1"
        assert dequeued1.workflow_data == {"data": "test"}
        
        dequeued2 = manager2.dequeue_task()
        assert dequeued2.task_id == "persist-2"
        
        manager2.close()
    
    def test_concurrent_access(self, queue_manager):
        """Test thread-safe concurrent access."""
        import threading
        
        results = []
        
        def enqueue_tasks():
            for i in range(5):
                task = Task(
                    task_id=f"thread-{threading.current_thread().name}-{i}",
                    prompt_id=f"p-{i}",
                    workflow_data={},
                    parameters={}
                )
                result = queue_manager.enqueue_task(task)
                results.append(result)
        
        # Create multiple threads
        threads = []
        for i in range(3):
            thread = threading.Thread(target=enqueue_tasks, name=f"T{i}")
            threads.append(thread)
            thread.start()
        
        # Wait for all threads
        for thread in threads:
            thread.join()
        
        # Should have 15 attempts (3 threads * 5 tasks each)
        assert len(results) == 15
        
        # Exactly 10 should succeed (max queue size)
        successful = sum(1 for r in results if r)
        failed = sum(1 for r in results if not r)
        
        # Should have exactly 10 successful and 5 failed
        assert successful == 10
        assert failed == 5
        assert queue_manager.get_total_queue_size() == 10
    
    def test_get_queue_stats(self, queue_manager):
        """Test getting comprehensive queue statistics."""
        # Add tasks of different priorities
        high_task = Task("h1", "p1", {}, {}, priority=TaskPriority.HIGH)
        normal_task = Task("n1", "p2", {}, {}, priority=TaskPriority.NORMAL)
        low_task = Task("l1", "p3", {}, {}, priority=TaskPriority.LOW)
        
        queue_manager.enqueue_task(high_task)
        queue_manager.enqueue_task(normal_task)
        queue_manager.enqueue_task(low_task)
        
        # Process one
        dequeued = queue_manager.dequeue_task()
        
        stats = queue_manager.get_queue_stats()
        
        assert stats["total_enqueued"] == 3
        assert stats["queue_sizes"]["high"] == 0  # Was dequeued
        assert stats["queue_sizes"]["normal"] == 1
        assert stats["queue_sizes"]["low"] == 1
        assert stats["active_tasks"] == 1  # Currently processing
        assert stats["total_tasks"] == 3