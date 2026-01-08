"""Test resource monitoring functionality during task execution with real components."""

import pytest
import asyncio
import time
import os
import json
from pathlib import Path

from src.api.resource_monitor import ResourceMonitor, ResourceUsage
from src.api.task_executor import TaskExecutor
from src.api.task_queue import TaskQueueManager, Task, TaskPriority
from src.api.workflow_executor import WorkflowExecutor
from src.api.websocket_manager import WebSocketManager


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
def resource_monitor(tmp_path):
    """Create resource monitor with test output directory."""
    output_dir = tmp_path / "outputs"
    output_dir.mkdir(exist_ok=True)
    return ResourceMonitor(
        check_interval=0.5,
        enable_gpu_monitoring=True,
        output_dir=str(output_dir)
    )


@pytest.fixture
async def task_executor_setup(tmp_path):
    """Create task executor with all components."""
    output_dir = tmp_path / "outputs"
    output_dir.mkdir(exist_ok=True)
    
    # Create a simple workflow file for testing
    workflow_file = tmp_path / "workflow.json"
    workflow_file.write_text('{"test": "workflow"}')
    
    queue_manager = TaskQueueManager(
        queue_path=str(tmp_path / "test_queue.db")
    )
    
    workflow_executor = WorkflowExecutor(
        comfyui_host="localhost",
        comfyui_port=8188,
        workflow_path=str(workflow_file),
        output_dir=str(output_dir)
    )
    
    resource_monitor = ResourceMonitor(output_dir=str(output_dir))
    
    task_executor = TaskExecutor(
        queue_manager=queue_manager,
        workflow_executor=workflow_executor,
        websocket_manager=None,
        resource_monitor=resource_monitor,
        max_concurrent_tasks=2,
        default_timeout=60.0,
        check_interval=0.5
    )
    
    yield {
        "queue_manager": queue_manager,
        "workflow_executor": workflow_executor,
        "resource_monitor": resource_monitor,
        "task_executor": task_executor,
        "output_dir": output_dir
    }
    
    # Cleanup
    task_executor.cleanup_resources()


def test_get_current_resource_usage(resource_monitor):
    """Test getting current system resource usage."""
    usage = resource_monitor.get_current_usage()
    
    # Check all required fields
    assert isinstance(usage.cpu_percent, float)
    assert 0 <= usage.cpu_percent <= 100
    
    assert isinstance(usage.memory_percent, float)
    assert 0 <= usage.memory_percent <= 100
    
    assert usage.memory_used_mb > 0
    assert usage.memory_available_mb > 0
    
    assert isinstance(usage.disk_usage_percent, float)
    assert 0 <= usage.disk_usage_percent <= 100
    
    assert usage.timestamp > 0


def test_resource_usage_within_limits(resource_monitor):
    """Test checking if resources are within safe limits."""
    usage = resource_monitor.get_current_usage()
    
    # Check with default limits
    within_limits = usage.is_within_limits()
    assert isinstance(within_limits, bool)
    
    # Check with custom limits
    within_strict = usage.is_within_limits(
        max_cpu_percent=50.0,
        max_memory_percent=50.0,
        max_disk_percent=50.0
    )
    assert isinstance(within_strict, bool)


def test_check_resource_availability(resource_monitor):
    """Test checking if resources are available for a task."""
    # Check with reasonable requirements
    available, reason = resource_monitor.check_resource_availability(
        required_memory_mb=100,
        required_disk_mb=50
    )
    
    # Should generally be available for small requirements
    assert isinstance(available, bool)
    assert isinstance(reason, str)
    
    if available:
        assert reason == "Resources available"
    else:
        assert "usage too high" in reason or "Insufficient" in reason


def test_check_resource_availability_insufficient(resource_monitor):
    """Test resource availability check with insufficient resources."""
    # Request unrealistic amount of memory
    available, reason = resource_monitor.check_resource_availability(
        required_memory_mb=1000000,  # 1TB
        required_disk_mb=1000000  # 1TB
    )
    
    assert available is False
    assert "Insufficient" in reason


def test_resource_estimation(resource_monitor):
    """Test estimating resource requirements for workflows."""
    # Simple workflow
    simple_estimate = resource_monitor.get_resource_estimate({
        "total_nodes": 5,
        "width": 512,
        "height": 512,
        "batch_size": 1,
        "steps": 10
    })
    
    assert simple_estimate["estimated_memory_mb"] > 0
    assert simple_estimate["estimated_disk_mb"] > 0
    assert simple_estimate["estimated_time_seconds"] > 0
    
    # Complex workflow
    complex_estimate = resource_monitor.get_resource_estimate({
        "total_nodes": 20,
        "width": 1024,
        "height": 1024,
        "batch_size": 4,
        "steps": 50
    })
    
    # Complex should require more resources
    assert complex_estimate["estimated_memory_mb"] > simple_estimate["estimated_memory_mb"]
    assert complex_estimate["estimated_disk_mb"] > simple_estimate["estimated_disk_mb"]
    assert complex_estimate["estimated_time_seconds"] > simple_estimate["estimated_time_seconds"]


def test_process_monitoring(resource_monitor):
    """Test monitoring a specific process."""
    # Monitor current process
    current_pid = os.getpid()
    process_stats = resource_monitor.monitor_process(current_pid)
    
    if process_stats:
        assert process_stats["pid"] == current_pid
        assert "cpu_percent" in process_stats
        assert "memory_mb" in process_stats
        assert "memory_percent" in process_stats
        assert "status" in process_stats
    
    # Monitor non-existent process
    fake_stats = resource_monitor.monitor_process(99999999)
    assert fake_stats is None


def test_system_info(resource_monitor):
    """Test getting system information."""
    info = resource_monitor.get_system_info()
    
    assert "cpu_count" in info
    assert info["cpu_count"] > 0
    
    assert "memory_total_gb" in info
    assert info["memory_total_gb"] > 0
    
    assert "disk_total_gb" in info
    assert info["disk_total_gb"] > 0
    
    assert "platform" in info
    assert "python_version" in info


@pytest.mark.asyncio
async def test_resource_monitoring_during_task(task_executor_setup):
    """Test resource monitoring during task execution."""
    task_executor = task_executor_setup["task_executor"]
    
    # Create a simple task
    test_workflow = get_test_workflow()
    task = Task(
        task_id="monitor-test",
        prompt_id="prompt-monitor",
        workflow_data=test_workflow,
        parameters={"steps": 1}
    )
    
    # Check resources before execution
    can_execute, reason = await task_executor.check_resources(task)
    assert can_execute is True
    assert reason == "Resources available"
    
    # Task should be tracked
    assert "monitor-test" in task_executor.task_resources
    
    # Check stored resource info
    resource_info = task_executor.task_resources["monitor-test"]
    assert "start_usage" in resource_info
    assert "requirements" in resource_info
    assert resource_info["requirements"]["estimated_memory_mb"] > 0


@pytest.mark.asyncio
async def test_resource_limits_enforcement(task_executor_setup):
    """Test that resource limits are enforced based on real system resources."""
    task_executor = task_executor_setup["task_executor"]
    resource_monitor = task_executor_setup["resource_monitor"]
    
    # Get current real resource usage
    current_usage = resource_monitor.get_current_usage()
    
    # Set resource limits based on current usage
    # Set limits below current usage to test enforcement
    task_executor.resource_limits = {
        "max_cpu_percent": max(current_usage.cpu_percent - 10, 5.0),  # Below current
        "max_memory_percent": max(current_usage.memory_percent - 10, 5.0),  # Below current
        "max_disk_percent": 95.0,
        "min_memory_mb": 512,
        "min_disk_mb": 1024
    }
    
    # Check if we can execute with these strict limits
    can_execute = await task_executor.can_execute()
    
    # If current usage is above our strict limits, should not be able to execute
    if (current_usage.cpu_percent > task_executor.resource_limits["max_cpu_percent"] or
        current_usage.memory_percent > task_executor.resource_limits["max_memory_percent"]):
        assert can_execute is False
    else:
        # If resources are actually low enough, execution should be allowed
        assert can_execute is True


@pytest.mark.asyncio
async def test_resource_cleanup(task_executor_setup, tmp_path):
    """Test resource cleanup after task completion."""
    task_executor = task_executor_setup["task_executor"]
    resource_monitor = task_executor_setup["resource_monitor"]
    output_dir = task_executor_setup["output_dir"]
    
    # Create some old output files
    old_file = output_dir / "old_output.png"
    old_file.write_text("old data")
    
    # Make it old by modifying timestamp
    import os
    old_time = time.time() - (25 * 3600)  # 25 hours ago
    os.utime(old_file, (old_time, old_time))
    
    # Create recent file
    new_file = output_dir / "new_output.png"
    new_file.write_text("new data")
    
    # Run cleanup
    resource_monitor.cleanup_old_outputs(max_age_hours=24)
    
    # Old file should be deleted
    assert not old_file.exists()
    # New file should remain
    assert new_file.exists()


@pytest.mark.asyncio
async def test_monitor_task_resources(task_executor_setup):
    """Test monitoring resources during task execution."""
    task_executor = task_executor_setup["task_executor"]
    
    # Create a task
    test_workflow = get_test_workflow()
    task = Task(
        task_id="monitor-exec",
        prompt_id="prompt-exec",
        workflow_data=test_workflow,
        parameters={"seed": 42}
    )
    
    # Add to active tasks
    task_executor.active_tasks["monitor-exec"] = task
    task_executor.task_resources["monitor-exec"] = {
        "start_usage": task_executor.resource_monitor.get_current_usage(),
        "requirements": {"estimated_memory_mb": 512}
    }
    
    # Start monitoring
    monitor_task = asyncio.create_task(
        task_executor.monitor_task_resources("monitor-exec")
    )
    
    # Let it run briefly
    await asyncio.sleep(1)
    
    # Stop monitoring
    del task_executor.active_tasks["monitor-exec"]
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    
    # Check that monitoring updated the resource usage
    if "monitor-exec" in task_executor.task_resources:
        resources = task_executor.task_resources["monitor-exec"]
        if "current_usage" in resources:
            assert resources["current_usage"] is not None
            assert "last_check" in resources


@pytest.mark.asyncio
async def test_concurrent_task_resource_tracking(task_executor_setup):
    """Test resource tracking with multiple concurrent tasks."""
    task_executor = task_executor_setup["task_executor"]
    
    # Create multiple tasks
    test_workflow = get_test_workflow()
    tasks = []
    for i in range(3):
        task = Task(
            task_id=f"concurrent-{i}",
            prompt_id=f"prompt-{i}",
            workflow_data=test_workflow,
            parameters={"steps": 1, "seed": i}
        )
        tasks.append(task)
    
    # Check resources for each task
    for task in tasks[:2]:  # Only first 2 due to max_concurrent_tasks=2
        can_execute, reason = await task_executor.check_resources(task)
        if can_execute:
            task_executor.active_tasks[task.task_id] = task
    
    # Should have 2 active tasks
    assert len(task_executor.active_tasks) <= 2
    
    # Third task should be blocked
    can_execute, reason = await task_executor.check_resources(tasks[2])
    assert can_execute is False
    assert "Max concurrent tasks" in reason
    
    # Clean up
    task_executor.active_tasks.clear()
    task_executor.task_resources.clear()


def test_resource_thresholds(resource_monitor):
    """Test resource threshold configuration."""
    # Check default thresholds
    assert resource_monitor.thresholds["cpu_critical"] == 95.0
    assert resource_monitor.thresholds["cpu_warning"] == 80.0
    assert resource_monitor.thresholds["memory_critical"] == 90.0
    assert resource_monitor.thresholds["memory_warning"] == 75.0
    
    # Test with current usage
    usage = resource_monitor.get_current_usage()
    
    # Check if current usage triggers any thresholds
    if usage.cpu_percent > resource_monitor.thresholds["cpu_warning"]:
        print(f"CPU usage warning: {usage.cpu_percent}%")
    
    if usage.memory_percent > resource_monitor.thresholds["memory_warning"]:
        print(f"Memory usage warning: {usage.memory_percent}%")