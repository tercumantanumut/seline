"""Tests for TaskExecutor with resource monitoring."""

import pytest
import asyncio
import time
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime

from src.api.task_executor import TaskExecutor
from src.api.task_queue import Task, TaskStatus, TaskPriority, TaskQueueManager
from src.api.resource_monitor import ResourceMonitor, ResourceUsage
from src.api.workflow_executor import WorkflowExecutor
from src.api.websocket_manager import WebSocketManager, ProgressTracker


class TestTaskExecutor:
    """Test TaskExecutor functionality."""
    
    @pytest.fixture
    def mock_queue_manager(self):
        """Create mock queue manager."""
        manager = MagicMock(spec=TaskQueueManager)
        manager.complete_task = MagicMock()
        manager.fail_task = MagicMock()
        return manager
    
    @pytest.fixture
    def mock_workflow_executor(self):
        """Create mock workflow executor."""
        executor = MagicMock(spec=WorkflowExecutor)
        executor.execute_workflow = AsyncMock(return_value={
            "prompt_id": "test-prompt",
            "status": "completed",
            "images": ["image1.png"]
        })
        return executor
    
    @pytest.fixture
    def mock_websocket_manager(self):
        """Create mock WebSocket manager."""
        manager = MagicMock(spec=WebSocketManager)
        manager.broadcast_to_prompt = AsyncMock()
        return manager
    
    @pytest.fixture
    def mock_resource_monitor(self):
        """Create mock resource monitor."""
        monitor = MagicMock(spec=ResourceMonitor)
        monitor.get_current_usage = MagicMock(return_value=ResourceUsage(
            cpu_percent=50.0,
            memory_percent=60.0,
            memory_used_mb=4096,
            memory_available_mb=4096,
            disk_usage_percent=70.0,
            timestamp=time.time()
        ))
        monitor.check_resource_availability = MagicMock(return_value=(True, "Resources available"))
        monitor.get_resource_estimate = MagicMock(return_value={
            "estimated_memory_mb": 1024,
            "estimated_disk_mb": 512,
            "estimated_time_seconds": 30
        })
        monitor.cleanup_old_outputs = MagicMock()
        return monitor
    
    @pytest.fixture
    def task_executor(self, mock_queue_manager, mock_workflow_executor, 
                     mock_websocket_manager, mock_resource_monitor):
        """Create TaskExecutor instance."""
        return TaskExecutor(
            queue_manager=mock_queue_manager,
            workflow_executor=mock_workflow_executor,
            websocket_manager=mock_websocket_manager,
            resource_monitor=mock_resource_monitor,
            max_concurrent_tasks=2,
            default_timeout=60.0
        )
    
    @pytest.fixture
    def sample_task(self):
        """Create sample task."""
        return Task(
            task_id="test-task-1",
            prompt_id="prompt-1",
            workflow_data={"test": "workflow"},
            parameters={
                "positive_prompt": "test image",
                "width": 512,
                "height": 512,
                "steps": 20,
                "batch_size": 1
            },
            priority=TaskPriority.NORMAL
        )
    
    @pytest.mark.asyncio
    async def test_execute_task_success(self, task_executor, sample_task, 
                                       mock_queue_manager, mock_workflow_executor):
        """Test successful task execution."""
        result = await task_executor.execute_task(sample_task)
        
        assert result["status"] == "completed"
        assert result["images"] == ["image1.png"]
        
        # Check queue manager was updated
        mock_queue_manager.complete_task.assert_called_once_with(
            "test-task-1", result
        )
        
        # Check workflow executor was called
        mock_workflow_executor.execute_workflow.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_execute_task_with_progress_tracking(self, task_executor, sample_task,
                                                      mock_websocket_manager):
        """Test task execution with progress tracking."""
        # Execute task
        await task_executor.execute_task(sample_task)
        
        # Check WebSocket broadcasts
        assert mock_websocket_manager.broadcast_to_prompt.called
    
    @pytest.mark.asyncio
    async def test_execute_task_timeout(self, task_executor, sample_task,
                                       mock_workflow_executor, mock_queue_manager):
        """Test task execution timeout."""
        # Make execution take too long
        async def slow_execution(*args, **kwargs):
            await asyncio.sleep(10)
            return {"status": "completed"}
        
        mock_workflow_executor.execute_workflow = slow_execution
        task_executor.default_timeout = 0.1  # Very short timeout
        
        with pytest.raises(TimeoutError):
            await task_executor.execute_task(sample_task)
        
        # Check task was marked as failed
        mock_queue_manager.fail_task.assert_called_once_with(
            "test-task-1", "Execution timeout"
        )
    
    @pytest.mark.asyncio
    async def test_execute_task_error(self, task_executor, sample_task,
                                     mock_workflow_executor, mock_queue_manager):
        """Test task execution with error."""
        # Make execution fail
        mock_workflow_executor.execute_workflow = AsyncMock(
            side_effect=Exception("Test error")
        )
        
        with pytest.raises(Exception, match="Test error"):
            await task_executor.execute_task(sample_task)
        
        # Check task was marked as failed
        mock_queue_manager.fail_task.assert_called_once_with(
            "test-task-1", "Test error"
        )
    
    @pytest.mark.asyncio
    async def test_check_resources(self, task_executor, sample_task):
        """Test resource checking."""
        can_execute, reason = await task_executor.check_resources(sample_task)
        
        assert can_execute is True
        assert reason == "Resources available"
        
        # Check resource estimate was calculated
        assert "test-task-1" in task_executor.task_resources
    
    @pytest.mark.asyncio
    async def test_check_resources_insufficient(self, task_executor, sample_task,
                                               mock_resource_monitor):
        """Test resource checking with insufficient resources."""
        mock_resource_monitor.check_resource_availability = MagicMock(
            return_value=(False, "Insufficient memory")
        )
        
        can_execute, reason = await task_executor.check_resources(sample_task)
        
        assert can_execute is False
        assert reason == "Insufficient memory"
    
    @pytest.mark.asyncio
    async def test_max_concurrent_tasks(self, task_executor, sample_task):
        """Test max concurrent tasks limit."""
        # Fill up active tasks
        task_executor.active_tasks = {
            "task-1": sample_task,
            "task-2": sample_task
        }
        
        can_execute, reason = await task_executor.check_resources(sample_task)
        
        assert can_execute is False
        assert "Max concurrent tasks" in reason
    
    @pytest.mark.asyncio
    async def test_monitor_task_resources(self, task_executor, sample_task,
                                         mock_resource_monitor, mock_websocket_manager):
        """Test resource monitoring during execution."""
        task_executor.active_tasks["test-task-1"] = sample_task
        task_executor.task_resources["test-task-1"] = {
            "start_usage": mock_resource_monitor.get_current_usage(),
            "requirements": {"estimated_memory_mb": 1024}
        }
        
        # Run monitoring for a short time
        monitor_task = asyncio.create_task(
            task_executor.monitor_task_resources("test-task-1")
        )
        await asyncio.sleep(0.1)
        
        # Stop monitoring
        del task_executor.active_tasks["test-task-1"]
        monitor_task.cancel()
        try:
            await monitor_task
        except asyncio.CancelledError:
            pass
        
        # Check resource monitor was called
        assert mock_resource_monitor.get_current_usage.called
    
    @pytest.mark.asyncio
    async def test_can_execute(self, task_executor, mock_resource_monitor):
        """Test can_execute check."""
        # With good resources
        assert await task_executor.can_execute() is True
        
        # With high CPU usage
        mock_resource_monitor.get_current_usage = MagicMock(return_value=ResourceUsage(
            cpu_percent=95.0,
            memory_percent=60.0,
            memory_used_mb=4096,
            memory_available_mb=4096,
            disk_usage_percent=70.0,
            timestamp=time.time()
        ))
        assert await task_executor.can_execute() is False
    
    def test_get_task_status(self, task_executor, sample_task):
        """Test getting task status."""
        # No task
        status = task_executor.get_task_status("unknown-task")
        assert status is None
        
        # Active task
        task_executor.active_tasks["test-task-1"] = sample_task
        task_executor.task_resources["test-task-1"] = {
            "start_time": time.time(),
            "current_usage": ResourceUsage(
                cpu_percent=50.0,
                memory_percent=60.0,
                memory_used_mb=4096,
                memory_available_mb=4096,
                disk_usage_percent=70.0,
                timestamp=time.time()
            )
        }
        
        status = task_executor.get_task_status("test-task-1")
        
        assert status is not None
        assert status["task_id"] == "test-task-1"
        assert status["prompt_id"] == "prompt-1"
        assert status["resource_usage"] is not None
        assert status["resource_usage"]["cpu_percent"] == 50.0
    
    def test_get_active_tasks(self, task_executor, sample_task):
        """Test getting active tasks list."""
        # No tasks
        tasks = task_executor.get_active_tasks()
        assert len(tasks) == 0
        
        # Add tasks
        task_executor.active_tasks["task-1"] = sample_task
        task_executor.task_resources["task-1"] = {"start_time": time.time()}
        
        task2 = Task(
            task_id="task-2",
            prompt_id="prompt-2",
            workflow_data={},
            parameters={}
        )
        task_executor.active_tasks["task-2"] = task2
        task_executor.task_resources["task-2"] = {"start_time": time.time()}
        
        tasks = task_executor.get_active_tasks()
        assert len(tasks) == 2
        assert any(t["task_id"] == "task-1" for t in tasks)
        assert any(t["task_id"] == "task-2" for t in tasks)
    
    def test_cleanup_resources(self, task_executor, sample_task, 
                              mock_queue_manager, mock_resource_monitor):
        """Test resource cleanup."""
        # Add active tasks
        task_executor.active_tasks["task-1"] = sample_task
        task_executor.task_resources["task-1"] = {"start_time": time.time()}
        
        # Cleanup
        task_executor.cleanup_resources()
        
        # Check everything was cleaned
        assert len(task_executor.active_tasks) == 0
        assert len(task_executor.task_resources) == 0
        
        # Check queue manager was notified
        mock_queue_manager.fail_task.assert_called_once_with(
            "task-1", "Executor shutdown"
        )
        
        # Check old outputs cleanup
        mock_resource_monitor.cleanup_old_outputs.assert_called_once()
    
    def test_extract_complexity(self, task_executor, sample_task):
        """Test complexity extraction from task."""
        complexity = task_executor._extract_complexity(sample_task)
        
        assert complexity["width"] == 512
        assert complexity["height"] == 512
        assert complexity["batch_size"] == 1
        assert complexity["steps"] == 20
        assert complexity["total_nodes"] == 1  # Small test workflow
    
    @pytest.mark.asyncio
    async def test_execute_with_callback(self, task_executor, sample_task):
        """Test task execution with progress callback."""
        callback_called = False
        
        async def progress_callback(node_id, progress):
            nonlocal callback_called
            callback_called = True
        
        result = await task_executor.execute_with_callback(
            sample_task,
            progress_callback
        )
        
        assert result["status"] == "completed"
    
    @pytest.mark.asyncio
    async def test_resource_limits(self, task_executor, sample_task):
        """Test resource limit configuration."""
        # Modify limits
        task_executor.resource_limits["max_cpu_percent"] = 50.0
        
        # Mock high CPU usage
        task_executor.resource_monitor.get_current_usage = MagicMock(
            return_value=ResourceUsage(
                cpu_percent=60.0,
                memory_percent=40.0,
                memory_used_mb=2048,
                memory_available_mb=6144,
                disk_usage_percent=50.0,
                timestamp=time.time()
            )
        )
        
        # Should not be able to execute
        assert await task_executor.can_execute() is False
    
    @pytest.mark.asyncio
    async def test_concurrent_execution(self, task_executor, mock_workflow_executor):
        """Test concurrent task execution."""
        # Create multiple tasks
        tasks = []
        for i in range(3):
            task = Task(
                task_id=f"task-{i}",
                prompt_id=f"prompt-{i}",
                workflow_data={},
                parameters={"steps": 1}
            )
            tasks.append(task)
        
        # Execute concurrently (limited by max_concurrent_tasks=2)
        results = []
        
        async def execute_and_store(task):
            try:
                result = await task_executor.execute_task(task)
                results.append(result)
            except Exception:
                pass
        
        await asyncio.gather(
            *[execute_and_store(task) for task in tasks],
            return_exceptions=True
        )
        
        # Should have executed some tasks
        assert len(results) > 0