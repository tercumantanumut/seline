"""End-to-end integration test for workflow execution with queue and workers."""

import pytest
import asyncio
import json
import os
import time
from pathlib import Path
from typing import Dict, Any

import aiohttp
from fastapi.testclient import TestClient

from src.api.task_queue import TaskQueueManager, Task, TaskPriority
from src.api.workflow_executor import WorkflowExecutor
from src.api.worker_service import WorkerService
from src.api.websocket_manager import WebSocketManager
from src.api.resource_monitor import ResourceMonitor
from src.api.task_executor import TaskExecutor


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
def test_workflow():
    """Load test workflow."""
    workflow_path = Path(__file__).parent.parent / "real_workflow.json"
    with open(workflow_path) as f:
        return json.load(f)


@pytest.fixture
def simple_workflow():
    """Create a simple test workflow - use the real workflow."""
    workflow_path = Path(__file__).parent.parent / "real_workflow.json"
    with open(workflow_path) as f:
        workflow = json.load(f)
    # Reduce steps for faster testing
    if "85" in workflow:
        workflow["85"]["inputs"]["steps"] = 2
    return workflow


@pytest.fixture
def comfyui_available():
    """Check if ComfyUI is available."""
    import requests
    try:
        response = requests.get("http://localhost:8188/system_stats", timeout=2)
        return response.status_code == 200
    except:
        return False


@pytest.fixture
async def test_components(tmp_path):
    """Create test components."""
    # Create directories
    output_dir = tmp_path / "outputs"
    output_dir.mkdir(exist_ok=True)
    
    queue_path = tmp_path / "test_queue.db"
    
    # Initialize components
    queue_manager = TaskQueueManager(
        queue_path=str(queue_path)
    )
    
    workflow_executor = WorkflowExecutor(
        comfyui_host="localhost",
        comfyui_port=8188,
        workflow_path=str(Path(__file__).parent.parent / "real_workflow.json"),
        output_dir=str(output_dir)
    )
    
    websocket_manager = WebSocketManager(max_connections=10)
    resource_monitor = ResourceMonitor(output_dir=str(output_dir))
    
    task_executor = TaskExecutor(
        queue_manager=queue_manager,
        workflow_executor=workflow_executor,
        websocket_manager=websocket_manager,
        resource_monitor=resource_monitor,
        max_concurrent_tasks=2,
        default_timeout=60.0
    )
    
    worker_service = WorkerService(
        queue_manager=queue_manager,
        workflow_executor=workflow_executor,
        websocket_manager=websocket_manager,
        config={
            "min_workers": 1,
            "max_workers": 2,
            "scale_threshold": 3
        }
    )
    
    yield {
        "queue_manager": queue_manager,
        "workflow_executor": workflow_executor,
        "websocket_manager": websocket_manager,
        "resource_monitor": resource_monitor,
        "task_executor": task_executor,
        "worker_service": worker_service,
        "output_dir": output_dir
    }
    
    # Cleanup
    await worker_service.stop()


@pytest.mark.asyncio
@pytest.mark.skipif(not os.getenv("TEST_WITH_COMFYUI"), reason="ComfyUI not available")
async def test_end_to_end_workflow_execution(test_components, simple_workflow):
    """Test complete workflow execution from queue to completion."""
    queue_manager = test_components["queue_manager"]
    worker_service = test_components["worker_service"]
    
    # Start worker service
    worker_task = asyncio.create_task(worker_service.start())
    await asyncio.sleep(1)  # Let workers start
    
    # Create and enqueue task
    task = Task(
        task_id="test-task-1",
        prompt_id="test-prompt-1",
        workflow_data=simple_workflow,
        parameters={
            "positive_prompt": "a beautiful sunset",
            "negative_prompt": "ugly, blurry",
            "seed": 42,
            "steps": 2
        },
        priority=TaskPriority.NORMAL
    )
    
    queue_manager.enqueue_task(task)
    
    # Wait for task completion
    timeout = 30
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        status = queue_manager.get_task_status("test-task-1")
        if status and status.status.value == "completed":
            break
        elif status and status.status.value == "failed":
            pytest.fail(f"Task failed: {status.error}")
        await asyncio.sleep(1)
    else:
        pytest.fail("Task did not complete within timeout")
    
    # Verify task completed
    assert status.status.value == "completed"
    assert status.result is not None
    
    # Stop worker service
    worker_service._shutdown_event.set()
    await asyncio.sleep(1)
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_queue_priority_handling(test_components):
    """Test that high priority tasks are processed first."""
    queue_manager = test_components["queue_manager"]
    
    # Enqueue tasks with different priorities
    test_workflow = get_test_workflow()
    high_task = Task(
        task_id="high-priority",
        prompt_id="prompt-high",
        workflow_data=test_workflow,
        parameters={"seed": 1},
        priority=TaskPriority.HIGH
    )
    
    normal_task = Task(
        task_id="normal-priority",
        prompt_id="prompt-normal",
        workflow_data=test_workflow,
        parameters={"seed": 2},
        priority=TaskPriority.NORMAL
    )
    
    low_task = Task(
        task_id="low-priority",
        prompt_id="prompt-low",
        workflow_data=test_workflow,
        parameters={"seed": 3},
        priority=TaskPriority.LOW
    )
    
    # Enqueue in reverse priority order
    queue_manager.enqueue_task(low_task)
    queue_manager.enqueue_task(normal_task)
    queue_manager.enqueue_task(high_task)
    
    # Dequeue and verify order
    first = queue_manager.dequeue_task()
    assert first.task_id == "high-priority"
    
    second = queue_manager.dequeue_task()
    assert second.task_id == "normal-priority"
    
    third = queue_manager.dequeue_task()
    assert third.task_id == "low-priority"


@pytest.mark.asyncio
async def test_resource_monitoring_during_execution(test_components):
    """Test that resource monitoring works during task execution."""
    resource_monitor = test_components["resource_monitor"]
    task_executor = test_components["task_executor"]
    
    # Get initial resource usage
    initial_usage = resource_monitor.get_current_usage()
    assert initial_usage.cpu_percent >= 0
    assert initial_usage.memory_percent >= 0
    
    # Check resource availability
    test_workflow = get_test_workflow()
    can_execute, reason = await task_executor.check_resources(
        Task(
            task_id="resource-test",
            prompt_id="prompt-resource",
            workflow_data=test_workflow,
            parameters={"steps": 1}
        )
    )
    
    assert can_execute is True
    assert reason == "Resources available"
    
    # Get resource estimate
    estimate = resource_monitor.get_resource_estimate({
        "total_nodes": 10,
        "width": 512,
        "height": 512,
        "batch_size": 1,
        "steps": 20
    })
    
    assert estimate["estimated_memory_mb"] > 0
    assert estimate["estimated_disk_mb"] > 0
    assert estimate["estimated_time_seconds"] > 0


@pytest.mark.asyncio
async def test_worker_pool_scaling(test_components):
    """Test worker pool auto-scaling based on queue size."""
    worker_service = test_components["worker_service"]
    queue_manager = test_components["queue_manager"]
    worker_pool = worker_service.worker_pool
    
    # Start with minimum workers
    assert len(worker_pool.workers) == 0
    
    # Add initial worker
    await worker_pool.add_worker("test-worker-1")
    assert len(worker_pool.workers) == 1
    
    # Stop the worker immediately to prevent hanging
    worker_pool.workers["test-worker-1"].stop()
    
    # Simulate high queue load
    test_workflow = get_test_workflow()
    for i in range(10):
        task = Task(
            task_id=f"scale-test-{i}",
            prompt_id=f"prompt-scale-{i}",
            workflow_data=test_workflow,
            parameters={"seed": i}
        )
        queue_manager.enqueue_task(task)
    
    # Manually trigger scaling logic (normally done by monitor_and_scale)
    queue_size = queue_manager.get_total_queue_size()
    active_workers = len(worker_pool.workers)
    
    if (queue_size > worker_pool.scale_threshold * active_workers and
        active_workers < worker_pool.max_workers):
        await worker_pool.add_worker("test-worker-2")
        worker_pool.workers["test-worker-2"].stop()
    
    # Should have scaled up
    assert len(worker_pool.workers) == 2
    
    # Clean up
    for worker in worker_pool.workers.values():
        worker.stop()
    await asyncio.sleep(0.1)
    worker_pool.workers.clear()
    worker_pool.worker_tasks.clear()


@pytest.mark.asyncio
async def test_task_retry_on_failure(test_components):
    """Test that failed tasks are retried."""
    queue_manager = test_components["queue_manager"]
    
    # Load real workflow
    import json
    from pathlib import Path
    workflow_path = Path(__file__).parent.parent / "real_workflow.json"
    with open(workflow_path) as f:
        real_workflow = json.load(f)
    
    # Create a task with real workflow
    task = Task(
        task_id="retry-test",
        prompt_id="prompt-retry",
        workflow_data=real_workflow,
        parameters={"steps": 2, "seed": 42}  # Use minimal steps for speed
    )
    
    queue_manager.enqueue_task(task)
    
    # Simulate task processing and failure
    dequeued = queue_manager.dequeue_task()
    assert dequeued is not None
    assert dequeued.task_id == "retry-test"
    
    # Mark as failed
    queue_manager.fail_task("retry-test", "Test failure")
    
    # Check status
    status = queue_manager.get_task_status("retry-test")
    assert status.retry_count == 1
    
    # Task should be re-queued
    requeued = queue_manager.dequeue_task()
    assert requeued is not None
    assert requeued.task_id == "retry-test"
    
    # Fail again
    queue_manager.fail_task("retry-test", "Test failure 2")
    status = queue_manager.get_task_status("retry-test")
    assert status.retry_count == 2
    
    # Third retry
    requeued2 = queue_manager.dequeue_task()
    assert requeued2 is not None
    
    # One more failure should send to dead letter queue (max_retries=3 by default)
    queue_manager.fail_task("retry-test", "Test failure 3")
    status = queue_manager.get_task_status("retry-test")
    assert status.retry_count == 3
    
    # Now it should be in dead letter queue after 4th failure
    requeued3 = queue_manager.dequeue_task()
    if requeued3:
        queue_manager.fail_task("retry-test", "Test failure 4")
        status = queue_manager.get_task_status("retry-test")
        assert status.status.value == "failed"
    
    # Check dead letter queue
    assert queue_manager.dead_letter_queue.size > 0


@pytest.mark.asyncio
async def test_concurrent_task_execution(test_components):
    """Test that multiple tasks can be executed concurrently."""
    queue_manager = test_components["queue_manager"]
    task_executor = test_components["task_executor"]
    
    # Create multiple tasks
    test_workflow = get_test_workflow()
    tasks = []
    for i in range(3):
        task = Task(
            task_id=f"concurrent-{i}",
            prompt_id=f"prompt-concurrent-{i}",
            workflow_data=test_workflow,
            parameters={"steps": 1, "seed": i}
        )
        tasks.append(task)
        queue_manager.enqueue_task(task)
    
    # Check that we can execute multiple tasks
    can_execute1 = await task_executor.can_execute()
    assert can_execute1 is True
    
    # Simulate task in progress
    task_executor.active_tasks["concurrent-0"] = tasks[0]
    
    # Should still be able to execute another
    can_execute2 = await task_executor.can_execute()
    assert can_execute2 is True
    
    # Add another active task
    task_executor.active_tasks["concurrent-1"] = tasks[1]
    
    # Now at max concurrent tasks (2)
    can_execute3 = await task_executor.can_execute()
    assert can_execute3 is False
    
    # Clean up
    task_executor.active_tasks.clear()


@pytest.mark.asyncio
async def test_graceful_shutdown(test_components):
    """Test graceful shutdown of worker service."""
    worker_service = test_components["worker_service"]
    queue_manager = test_components["queue_manager"]
    
    # Enqueue a task
    test_workflow = get_test_workflow()
    task = Task(
        task_id="shutdown-test",
        prompt_id="prompt-shutdown",
        workflow_data=test_workflow,
        parameters={"seed": 999}
    )
    queue_manager.enqueue_task(task)
    
    # Start worker service
    worker_task = asyncio.create_task(worker_service.start())
    await asyncio.sleep(0.5)
    
    # Trigger shutdown
    worker_service._shutdown_event.set()
    
    # Service should stop gracefully
    try:
        await asyncio.wait_for(worker_task, timeout=5.0)
    except asyncio.TimeoutError:
        pytest.fail("Worker service did not shut down gracefully")
    
    # Verify service stopped
    assert worker_service.running is False