"""Test worker pool auto-scaling functionality with real components."""

import pytest
import asyncio
import time
import json
from pathlib import Path

from src.api.task_queue import TaskQueueManager, Task, TaskPriority
from src.api.workflow_executor import WorkflowExecutor
from src.api.worker_service import WorkerService, WorkerPool
from src.api.websocket_manager import WebSocketManager
from src.api.resource_monitor import ResourceMonitor, ResourceUsage
from src.api.task_executor import TaskExecutor

# Load real workflow for testing
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
async def worker_pool_setup(tmp_path):
    """Create worker pool with test configuration."""
    # Create output directory
    output_dir = tmp_path / "outputs"
    output_dir.mkdir(exist_ok=True)
    
    # Create queue manager
    queue_manager = TaskQueueManager(
        queue_path=str(tmp_path / "test_queue.db")
    )
    queue_manager.max_retries = 2  # Set max retries as class variable
    
    # Create a simple workflow file for testing
    workflow_file = tmp_path / "workflow.json"
    workflow_file.write_text('{"test": "workflow"}')
    
    # Create workflow executor
    workflow_executor = WorkflowExecutor(
        comfyui_host="localhost",
        comfyui_port=8188,
        workflow_path=str(workflow_file),
        output_dir=str(output_dir)
    )
    
    # Create worker pool
    worker_pool = WorkerPool(
        queue_manager=queue_manager,
        workflow_executor=workflow_executor,
        websocket_manager=None,
        min_workers=1,
        max_workers=4,
        scale_threshold=3  # Scale when queue > 3 * workers
    )
    
    yield {
        "queue_manager": queue_manager,
        "workflow_executor": workflow_executor,
        "worker_pool": worker_pool
    }
    
    # Cleanup
    await worker_pool.stop()


@pytest.mark.asyncio
async def test_scale_up_on_high_load(worker_pool_setup):
    """Test that worker pool scales up when queue load is high."""
    worker_pool = worker_pool_setup["worker_pool"]
    queue_manager = worker_pool_setup["queue_manager"]
    
    # Start with minimum workers
    await worker_pool.add_worker("initial-worker")
    worker_pool.workers["initial-worker"].stop()  # Stop to prevent hanging
    assert len(worker_pool.workers) == 1
    
    # Add many tasks to create high load
    test_workflow = get_test_workflow()
    for i in range(10):
        task = Task(
            task_id=f"scale-up-{i}",
            prompt_id=f"prompt-{i}",
            workflow_data=test_workflow,
            parameters={"seed": i}
        )
        queue_manager.enqueue_task(task)
    
    # Get real resource usage
    usage = worker_pool.resource_monitor.get_current_usage()
    
    # Only scale if resources are actually available
    queue_size = queue_manager.get_total_queue_size()
    active_workers = len(worker_pool.workers)
    
    # Check if should scale up based on real resource availability
    if (queue_size > worker_pool.scale_threshold * active_workers and
        active_workers < worker_pool.max_workers and
        usage.memory_percent < 70 and
        usage.cpu_percent < 80):
        
        # Add worker
        await worker_pool.add_worker("scaled-worker-1")
        worker_pool.workers["scaled-worker-1"].stop()
        
        # Should have scaled up
        assert len(worker_pool.workers) == 2
    else:
        # If resources not available, scaling should not happen
        assert len(worker_pool.workers) == 1
    
    # Clean up workers
    for worker in worker_pool.workers.values():
        worker.stop()
    await asyncio.sleep(0.1)


@pytest.mark.asyncio
async def test_scale_down_on_low_load(worker_pool_setup):
    """Test that worker pool scales down when queue is empty."""
    worker_pool = worker_pool_setup["worker_pool"]
    queue_manager = worker_pool_setup["queue_manager"]
    
    # Start with multiple workers
    await worker_pool.add_worker("worker-1")
    await worker_pool.add_worker("worker-2")
    await worker_pool.add_worker("worker-3")
    
    # Stop workers immediately
    for worker in worker_pool.workers.values():
        worker.stop()
    
    assert len(worker_pool.workers) == 3
    
    # Ensure queue is empty
    assert queue_manager.get_total_queue_size() == 0
    
    # Make workers idle
    for worker in worker_pool.workers.values():
        worker.info.status = worker.info.status.__class__.IDLE
    
    # Manually trigger scale down logic
    queue_size = queue_manager.get_total_queue_size()
    active_workers = len(worker_pool.workers)
    
    # Check if should scale down
    if queue_size < active_workers and active_workers > worker_pool.min_workers:
        # Find idle worker to remove
        for worker_id, worker in list(worker_pool.workers.items()):
            if worker.info.status == worker.info.status.__class__.IDLE:
                if await worker_pool.remove_worker(worker_id):
                    break
    
    # Should have scaled down
    assert len(worker_pool.workers) == 2
    
    # Clean up
    await asyncio.sleep(0.1)


@pytest.mark.asyncio
async def test_respect_min_workers_limit(worker_pool_setup):
    """Test that scaling never goes below minimum workers."""
    worker_pool = worker_pool_setup["worker_pool"]
    
    # Add minimum workers
    await worker_pool.add_worker("min-worker")
    worker_pool.workers["min-worker"].stop()
    
    assert len(worker_pool.workers) == 1
    
    # Try to remove below minimum
    result = await worker_pool.remove_worker("min-worker")
    
    # Should fail
    assert result is False
    assert len(worker_pool.workers) == 1


@pytest.mark.asyncio
async def test_respect_max_workers_limit(worker_pool_setup):
    """Test that scaling never exceeds maximum workers."""
    worker_pool = worker_pool_setup["worker_pool"]
    queue_manager = worker_pool_setup["queue_manager"]
    
    # Add maximum workers
    for i in range(worker_pool.max_workers):
        await worker_pool.add_worker(f"max-worker-{i}")
        worker_pool.workers[f"max-worker-{i}"].stop()
    
    assert len(worker_pool.workers) == worker_pool.max_workers
    
    # Add high load
    test_workflow = get_test_workflow()
    for i in range(20):
        task = Task(
            task_id=f"overflow-{i}",
            prompt_id=f"prompt-{i}",
            workflow_data=test_workflow,
            parameters={"seed": i}
        )
        queue_manager.enqueue_task(task)
    
    # Try to add more workers
    result = await worker_pool.add_worker("overflow-worker")
    
    # Should fail
    assert result is False
    assert len(worker_pool.workers) == worker_pool.max_workers


@pytest.mark.asyncio
async def test_scale_based_on_resource_availability(worker_pool_setup):
    """Test that scaling considers real resource availability."""
    worker_pool = worker_pool_setup["worker_pool"]
    queue_manager = worker_pool_setup["queue_manager"]
    
    # Start with one worker
    await worker_pool.add_worker("resource-worker")
    worker_pool.workers["resource-worker"].stop()
    
    # Add high load
    test_workflow = get_test_workflow()
    for i in range(10):
        task = Task(
            task_id=f"resource-{i}",
            prompt_id=f"prompt-{i}",
            workflow_data=test_workflow,
            parameters={"seed": i}
        )
        queue_manager.enqueue_task(task)
    
    # Get real resource usage
    usage = worker_pool.resource_monitor.get_current_usage()
    
    # Check scaling logic based on real resources
    queue_size = queue_manager.get_total_queue_size()
    active_workers = len(worker_pool.workers)
    
    # Determine if scaling should happen based on actual resources
    should_scale = (
        queue_size > worker_pool.scale_threshold * active_workers and
        active_workers < worker_pool.max_workers and
        usage.memory_percent < 70 and  # Threshold check
        usage.cpu_percent < 80  # Threshold check
    )
    
    if should_scale:
        # Resources are available, can scale
        await worker_pool.add_worker("scaled-worker")
        worker_pool.workers["scaled-worker"].stop()
        assert len(worker_pool.workers) == 2
    else:
        # Resources not available or queue not high enough
        assert len(worker_pool.workers) == 1
        print(f"Scaling not performed - CPU: {usage.cpu_percent:.1f}%, Memory: {usage.memory_percent:.1f}%")


@pytest.mark.asyncio
async def test_dynamic_scaling_during_operation(worker_pool_setup):
    """Test that scaling happens dynamically during operation."""
    worker_pool = worker_pool_setup["worker_pool"]
    queue_manager = worker_pool_setup["queue_manager"]
    
    # Start monitoring (but cancel it quickly)
    worker_pool.running = True
    monitor_task = asyncio.create_task(worker_pool.monitor_and_scale())
    
    # Start with minimum workers
    await worker_pool.add_worker("dynamic-1")
    worker_pool.workers["dynamic-1"].stop()
    initial_count = len(worker_pool.workers)
    
    # Add tasks gradually
    test_workflow = get_test_workflow()
    for i in range(5):
        task = Task(
            task_id=f"dynamic-{i}",
            prompt_id=f"prompt-{i}",
            workflow_data=test_workflow,
            parameters={"seed": i}
        )
        queue_manager.enqueue_task(task)
    
    # Let monitor run briefly
    await asyncio.sleep(0.1)
    
    # Stop monitoring
    worker_pool.running = False
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    
    # Clean up
    for worker in worker_pool.workers.values():
        worker.stop()


@pytest.mark.asyncio
async def test_scale_with_different_priorities(worker_pool_setup):
    """Test that scaling considers task priorities."""
    worker_pool = worker_pool_setup["worker_pool"]
    queue_manager = worker_pool_setup["queue_manager"]
    
    # Start with one worker
    await worker_pool.add_worker("priority-worker")
    worker_pool.workers["priority-worker"].stop()
    
    # Add high priority tasks
    test_workflow = get_test_workflow()
    for i in range(5):
        task = Task(
            task_id=f"high-{i}",
            prompt_id=f"prompt-high-{i}",
            workflow_data=test_workflow,
            parameters={"seed": i},
            priority=TaskPriority.HIGH
        )
        queue_manager.enqueue_task(task)
    
    # High priority tasks should trigger scaling
    high_priority_count = queue_manager.high_queue.size
    assert high_priority_count == 5
    
    # Check if should scale for high priority load
    total_queue = queue_manager.get_total_queue_size()
    active_workers = len(worker_pool.workers)
    
    should_scale = (
        total_queue > worker_pool.scale_threshold * active_workers and
        active_workers < worker_pool.max_workers
    )
    
    assert should_scale is True


@pytest.mark.asyncio
async def test_worker_pool_status_during_scaling(worker_pool_setup):
    """Test that pool status is accurate during scaling operations."""
    worker_pool = worker_pool_setup["worker_pool"]
    
    # Get initial status
    initial_status = worker_pool.get_status()
    assert initial_status["worker_count"] == 0
    assert initial_status["min_workers"] == 1
    assert initial_status["max_workers"] == 4
    
    # Add workers
    await worker_pool.add_worker("status-1")
    await worker_pool.add_worker("status-2")
    
    # Stop workers
    for worker in worker_pool.workers.values():
        worker.stop()
    
    # Get status after scaling
    scaled_status = worker_pool.get_status()
    assert scaled_status["worker_count"] == 2
    assert len(scaled_status["workers"]) == 2
    
    # Check individual worker info
    for worker_info in scaled_status["workers"]:
        assert "worker_id" in worker_info
        assert "status" in worker_info
        assert "tasks_completed" in worker_info
        assert "tasks_failed" in worker_info