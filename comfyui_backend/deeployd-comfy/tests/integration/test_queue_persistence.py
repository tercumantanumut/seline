"""Test queue persistence across restarts."""

import pytest
import os
import time
import json
from pathlib import Path

from src.api.task_queue import TaskQueueManager, Task, TaskPriority, TaskStatus


def get_test_workflow():
    """Get a real workflow for testing."""
    workflow_path = Path(__file__).parent.parent / "real_workflow.json"
    with open(workflow_path) as f:
        workflow = json.load(f)
    # Reduce steps for faster testing
    if "85" in workflow:
        workflow["85"]["inputs"]["steps"] = 2
    return workflow


@pytest.fixture
def queue_db_path(tmp_path):
    """Create temporary queue database path."""
    return tmp_path / "test_queue.db"


def test_queue_persists_after_restart(queue_db_path):
    """Test that queue data persists after manager restart."""
    # Create first queue manager instance
    queue1 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Enqueue tasks
    task1 = Task(
        task_id="persist-1",
        prompt_id="prompt-1",
        workflow_data={"test": "data1"},
        parameters={"param1": "value1"}
    )
    
    task2 = Task(
        task_id="persist-2",
        prompt_id="prompt-2",
        workflow_data={"test": "data2"},
        parameters={"param2": "value2"},
        priority=TaskPriority.HIGH
    )
    
    queue1.enqueue_task(task1)
    queue1.enqueue_task(task2)
    
    # Get initial stats
    initial_size = queue1.get_total_queue_size()
    assert initial_size == 2
    
    # Simulate crash by deleting queue manager
    del queue1
    
    # Create new queue manager with same database
    queue2 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Check that tasks are still there (queue items persist, stats don't)
    restored_size = queue2.get_total_queue_size()
    assert restored_size == 2
    
    # Dequeue and verify tasks
    first = queue2.dequeue_task()
    assert first.task_id == "persist-2"  # High priority first
    assert first.parameters == {"param2": "value2"}
    
    second = queue2.dequeue_task()
    assert second.task_id == "persist-1"
    assert second.parameters == {"param1": "value1"}


def test_task_status_in_memory_only(queue_db_path):
    """Test that task status is tracked in memory (not persistent yet - needs Phase 5 DB)."""
    # Create queue and process task
    queue1 = TaskQueueManager(queue_path=str(queue_db_path))
    
    test_workflow = get_test_workflow()
    task = Task(
        task_id="status-test",
        prompt_id="prompt-status",
        workflow_data=test_workflow,
        parameters={"seed": 42}
    )
    
    queue1.enqueue_task(task)
    
    # Dequeue and mark as processing
    dequeued = queue1.dequeue_task()
    assert dequeued is not None
    
    # Complete the task
    queue1.complete_task("status-test", {"result": "success"})
    
    # Get status - should work in same instance
    task1 = queue1.get_task_status("status-test")
    assert task1.status.value == "completed"
    assert task1.result == {"result": "success"}
    
    # Restart queue manager
    del queue1
    queue2 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Status should NOT persist (no database yet - Phase 5)
    task2 = queue2.get_task_status("status-test")
    assert task2 is None  # Expected: no persistence without DB


def test_failed_tasks_requeue(queue_db_path):
    """Test that failed tasks are re-queued for retry."""
    queue1 = TaskQueueManager(queue_path=str(queue_db_path))
    
    test_workflow = get_test_workflow()
    task = Task(
        task_id="fail-test",
        prompt_id="prompt-fail",
        workflow_data=test_workflow,
        parameters={"seed": 99},
        max_retries=2
    )
    
    queue1.enqueue_task(task)
    dequeued = queue1.dequeue_task()
    
    # Fail the task - should re-queue
    queue1.fail_task("fail-test", "First failure")
    
    # Check it's re-queued  
    queue_size = queue1.get_total_queue_size()
    assert queue_size == 1  # Task should be back in queue
    
    # Restart
    del queue1
    queue2 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Task should still be in queue after restart
    retry_task = queue2.dequeue_task()
    assert retry_task is not None
    assert retry_task.task_id == "fail-test"
    assert retry_task.retry_count == 1


def test_dead_letter_queue_persists(queue_db_path):
    """Test that dead letter queue persists."""
    queue1 = TaskQueueManager(queue_path=str(queue_db_path))
    
    test_workflow = get_test_workflow()
    task = Task(
        task_id="dead-test",
        prompt_id="prompt-dead",
        workflow_data=test_workflow,
        parameters={"seed": 666},
        max_retries=1  # Only 1 retry allowed
    )
    
    queue1.enqueue_task(task)
    
    # Fail task multiple times to send to DLQ
    dequeued = queue1.dequeue_task()
    queue1.fail_task("dead-test", "Failure 1")
    
    # Should be retried once
    retry = queue1.dequeue_task()
    assert retry is not None
    
    # Fail again - should go to DLQ
    queue1.fail_task("dead-test", "Failure 2")
    
    # Check DLQ
    dlq_size1 = queue1.dead_letter_queue.size
    assert dlq_size1 == 1
    
    # Restart
    del queue1
    queue2 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # DLQ should persist
    dlq_size2 = queue2.dead_letter_queue.size
    assert dlq_size2 == 1


def test_queue_items_persist_not_status(queue_db_path):
    """Test that queue items persist but status tracking doesn't (needs DB - Phase 5)."""
    queue1 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Add multiple tasks
    test_workflow = get_test_workflow()
    for i in range(5):
        task = Task(
            task_id=f"stat-test-{i}",
            prompt_id=f"prompt-stat-{i}",
            workflow_data=test_workflow,
            parameters={"seed": i}
        )
        queue1.enqueue_task(task)
    
    # Process some tasks
    for i in range(3):
        dequeued = queue1.dequeue_task()
        queue1.complete_task(dequeued.task_id, {"done": True})
    
    # Check remaining in queue
    remaining = queue1.get_total_queue_size()
    assert remaining == 2  # 5 added, 3 processed
    
    # Restart
    del queue1
    queue2 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Queue items should persist
    assert queue2.get_total_queue_size() == 2
    
    # But completed task status should NOT persist (no DB yet)
    for i in range(3):
        task = queue2.get_task_status(f"stat-test-{i}")
        assert task is None  # Status not persisted without DB


def test_priority_queue_order_persists(queue_db_path):
    """Test that priority queue order is maintained after restart."""
    queue1 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Add tasks with different priorities
    tasks = [
        Task("low-1", "p1", {}, {}, priority=TaskPriority.LOW),
        Task("high-1", "p2", {}, {}, priority=TaskPriority.HIGH),
        Task("normal-1", "p3", {}, {}, priority=TaskPriority.NORMAL),
        Task("high-2", "p4", {}, {}, priority=TaskPriority.HIGH),
        Task("low-2", "p5", {}, {}, priority=TaskPriority.LOW),
    ]
    
    for task in tasks:
        queue1.enqueue_task(task)
    
    # Restart
    del queue1
    queue2 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Verify priority order is maintained
    order = []
    while queue2.get_total_queue_size() > 0:
        task = queue2.dequeue_task()
        order.append(task.task_id)
    
    # Should be: high-1, high-2, normal-1, low-1, low-2
    assert order[0] in ["high-1", "high-2"]
    assert order[1] in ["high-1", "high-2"]
    assert order[2] == "normal-1"
    assert order[3] in ["low-1", "low-2"]
    assert order[4] in ["low-1", "low-2"]


def test_sequential_access_to_persisted_queue(queue_db_path):
    """Test that queue managers can access same database sequentially."""
    # persist-queue doesn't support concurrent access - use sequential
    queue1 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Add task from first queue
    task1 = Task("sequential-1", "p1", {}, {})
    queue1.enqueue_task(task1)
    
    size1 = queue1.get_total_queue_size()
    assert size1 == 1
    
    # Close first queue
    queue1.close()
    del queue1
    
    # Open second queue  
    queue2 = TaskQueueManager(queue_path=str(queue_db_path))
    
    # Should see the task
    size2 = queue2.get_total_queue_size()
    assert size2 == 1
    
    # Add another task
    task2 = Task("sequential-2", "p2", {}, {})
    queue2.enqueue_task(task2)
    
    size2_after = queue2.get_total_queue_size()
    assert size2_after == 2
    
    queue2.close()