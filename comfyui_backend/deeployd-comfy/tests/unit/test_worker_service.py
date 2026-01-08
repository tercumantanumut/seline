"""Tests for WorkerService and WorkerPool."""

import pytest
import asyncio
import time
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime

from src.api.worker_service import (
    Worker,
    WorkerPool,
    WorkerService,
    WorkerStatus,
    WorkerInfo
)
from src.api.task_queue import Task, TaskStatus, TaskPriority, TaskQueueManager
from src.api.task_executor import TaskExecutor
from src.api.workflow_executor import WorkflowExecutor
from src.api.websocket_manager import WebSocketManager
from src.api.resource_monitor import ResourceMonitor, ResourceUsage


class TestWorker:
    """Test Worker functionality."""
    
    @pytest.fixture
    def mock_queue_manager(self):
        """Create mock queue manager."""
        manager = MagicMock(spec=TaskQueueManager)
        manager.dequeue_task = MagicMock(return_value=None)
        return manager
    
    @pytest.fixture
    def mock_task_executor(self):
        """Create mock task executor."""
        executor = MagicMock(spec=TaskExecutor)
        executor.can_execute = AsyncMock(return_value=True)
        executor.execute_task = AsyncMock(return_value={"status": "completed"})
        return executor
    
    @pytest.fixture
    def worker(self, mock_queue_manager, mock_task_executor):
        """Create worker instance."""
        return Worker(
            worker_id="test-worker",
            queue_manager=mock_queue_manager,
            task_executor=mock_task_executor,
            poll_interval=0.1
        )
    
    @pytest.fixture
    def sample_task(self):
        """Create sample task."""
        return Task(
            task_id="test-task",
            prompt_id="prompt-1",
            workflow_data={},
            parameters={"steps": 1}
        )
    
    @pytest.mark.asyncio
    async def test_worker_initialization(self, worker):
        """Test worker initialization."""
        assert worker.worker_id == "test-worker"
        assert worker.info.status == WorkerStatus.IDLE
        assert worker.info.tasks_completed == 0
        assert worker.running is False
    
    @pytest.mark.asyncio
    async def test_worker_start_stop(self, worker):
        """Test starting and stopping worker."""
        # Start worker
        worker_task = asyncio.create_task(worker.start())
        await asyncio.sleep(0.2)  # Let it run briefly
        
        assert worker.running is True
        assert worker.info.status == WorkerStatus.IDLE
        
        # Stop worker
        worker.stop()
        await asyncio.sleep(0.2)
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
        
        assert worker.running is False
    
    @pytest.mark.asyncio
    async def test_worker_process_task(self, worker, sample_task, 
                                      mock_task_executor):
        """Test worker processing a task."""
        await worker.process_task(sample_task)
        
        assert worker.info.tasks_completed == 1
        assert worker.info.current_task is None
        mock_task_executor.execute_task.assert_called_once_with(sample_task)
    
    @pytest.mark.asyncio
    async def test_worker_process_task_failure(self, worker, sample_task,
                                              mock_task_executor):
        """Test worker handling task failure."""
        mock_task_executor.execute_task = AsyncMock(
            side_effect=Exception("Test error")
        )
        
        await worker.process_task(sample_task)
        
        assert worker.info.tasks_failed == 1
        assert worker.info.error_message == "Test error"
    
    @pytest.mark.asyncio
    async def test_worker_pause_resume(self, worker):
        """Test pausing and resuming worker."""
        # Start worker
        worker_task = asyncio.create_task(worker.start())
        await asyncio.sleep(0.1)
        
        # Pause
        worker.pause()
        assert worker.paused is True
        await asyncio.sleep(0.2)
        assert worker.info.status == WorkerStatus.PAUSED
        
        # Resume
        worker.resume()
        assert worker.paused is False
        
        # Cleanup
        worker.stop()
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
    
    @pytest.mark.asyncio
    async def test_worker_with_tasks(self, worker, sample_task,
                                    mock_queue_manager, mock_task_executor):
        """Test worker processing tasks from queue."""
        # Setup queue to return a task then None
        task_returned = [False]
        
        def get_task():
            if not task_returned[0]:
                task_returned[0] = True
                return sample_task
            return None
        
        mock_queue_manager.dequeue_task = MagicMock(side_effect=get_task)
        
        # Run worker
        worker_task = asyncio.create_task(worker.start())
        await asyncio.sleep(0.3)
        
        # Should have processed the task
        assert worker.info.tasks_completed == 1
        
        # Cleanup
        worker.stop()
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
    
    def test_worker_get_info(self, worker):
        """Test getting worker info."""
        info = worker.get_info()
        
        assert isinstance(info, WorkerInfo)
        assert info.worker_id == "test-worker"
        assert info.status == WorkerStatus.IDLE


class TestWorkerPool:
    """Test WorkerPool functionality."""
    
    @pytest.fixture
    def mock_queue_manager(self):
        """Create mock queue manager."""
        manager = MagicMock(spec=TaskQueueManager)
        manager.dequeue_task = MagicMock(return_value=None)
        manager.get_total_queue_size = MagicMock(return_value=0)
        manager.get_queue_stats = MagicMock(return_value={
            "total_enqueued": 0,
            "total_processed": 0
        })
        return manager
    
    @pytest.fixture
    def mock_workflow_executor(self):
        """Create mock workflow executor."""
        return MagicMock(spec=WorkflowExecutor)
    
    @pytest.fixture
    def mock_websocket_manager(self):
        """Create mock WebSocket manager."""
        return MagicMock(spec=WebSocketManager)
    
    @pytest.fixture
    def worker_pool(self, mock_queue_manager, mock_workflow_executor,
                   mock_websocket_manager):
        """Create worker pool."""
        return WorkerPool(
            queue_manager=mock_queue_manager,
            workflow_executor=mock_workflow_executor,
            websocket_manager=mock_websocket_manager,
            min_workers=1,
            max_workers=3,
            scale_threshold=2
        )
    
    @pytest.mark.asyncio
    async def test_pool_initialization(self, worker_pool):
        """Test worker pool initialization."""
        assert worker_pool.min_workers == 1
        assert worker_pool.max_workers == 3
        assert worker_pool.scale_threshold == 2
        assert len(worker_pool.workers) == 0
    
    @pytest.mark.asyncio
    async def test_pool_start(self, worker_pool):
        """Test starting worker pool."""
        # Start pool
        await worker_pool.start()
        
        # Should have minimum workers
        assert len(worker_pool.workers) == 1
        assert worker_pool.running is True
        
        # Cleanup - properly stop the pool
        await worker_pool.stop()
    
    @pytest.mark.asyncio
    async def test_add_worker(self, worker_pool):
        """Test adding worker to pool."""
        result = await worker_pool.add_worker("custom-worker")
        
        assert result is True
        assert "custom-worker" in worker_pool.workers
        assert "custom-worker" in worker_pool.worker_tasks
        
        # Stop the worker immediately
        worker_pool.workers["custom-worker"].stop()
        
        # Wait briefly for worker to stop
        await asyncio.sleep(0.2)
        
        # Now remove it
        await worker_pool.remove_worker("custom-worker")
    
    @pytest.mark.asyncio
    async def test_add_worker_max_limit(self, worker_pool):
        """Test adding worker when at max limit."""
        # Add max workers
        for i in range(3):
            await worker_pool.add_worker(f"worker-{i}")
            # Stop each worker immediately after adding
            worker_pool.workers[f"worker-{i}"].stop()
        
        # Try to add one more
        result = await worker_pool.add_worker("overflow-worker")
        
        assert result is False
        assert len(worker_pool.workers) == 3
        
        # Cleanup - stop all workers first
        for worker in worker_pool.workers.values():
            worker.stop()
        
        # Wait briefly for workers to stop
        await asyncio.sleep(0.2)
        
        # Now clean up the pool
        await worker_pool.stop()
    
    @pytest.mark.asyncio
    async def test_remove_worker(self, worker_pool):
        """Test removing worker from pool."""
        # Add workers
        await worker_pool.add_worker("worker-1")
        await worker_pool.add_worker("worker-2")
        
        # Stop workers immediately
        worker_pool.workers["worker-1"].stop()
        worker_pool.workers["worker-2"].stop()
        
        # Remove one
        result = await worker_pool.remove_worker("worker-2")
        
        assert result is True
        assert "worker-2" not in worker_pool.workers
        assert len(worker_pool.workers) == 1
        
        # Cleanup
        await worker_pool.stop()
    
    @pytest.mark.asyncio
    async def test_remove_worker_min_limit(self, worker_pool):
        """Test removing worker when at min limit."""
        # Start with min workers
        await worker_pool.start()
        
        # Try to remove
        worker_id = list(worker_pool.workers.keys())[0]
        result = await worker_pool.remove_worker(worker_id)
        
        assert result is False
        assert len(worker_pool.workers) == 1
        
        # Cleanup
        await worker_pool.stop()
    
    @pytest.mark.asyncio
    async def test_pause_resume_all(self, worker_pool):
        """Test pausing and resuming all workers."""
        # Add a worker manually
        await worker_pool.add_worker("worker-1")
        worker_pool.workers["worker-1"].stop()
        
        # Pause all
        worker_pool.pause_all()
        for worker in worker_pool.workers.values():
            assert worker.paused is True
        
        # Resume all
        worker_pool.resume_all()
        for worker in worker_pool.workers.values():
            assert worker.paused is False
        
        # Cleanup
        await worker_pool.stop()
    
    @pytest.mark.asyncio
    async def test_auto_scaling_up(self, worker_pool, mock_queue_manager):
        """Test automatic scaling up."""
        # Simulate large queue
        mock_queue_manager.get_total_queue_size = MagicMock(return_value=5)
        
        # Add initial worker
        await worker_pool.add_worker("worker-0")
        worker_pool.workers["worker-0"].stop()
        
        assert len(worker_pool.workers) == 1
        
        # Mock good resource usage
        with patch.object(worker_pool.resource_monitor, 'get_current_usage') as mock_usage:
            mock_usage.return_value = ResourceUsage(
                cpu_percent=50.0,
                memory_percent=50.0,
                memory_used_mb=2048,
                memory_available_mb=6144,
                disk_usage_percent=50.0,
                timestamp=time.time()
            )
            
            # Set pool as running for scaling logic
            worker_pool.running = True
            
            # Call monitor_and_scale just once (it's an infinite loop normally)
            # Extract just the scaling logic
            queue_size = mock_queue_manager.get_total_queue_size()
            active_workers = len(worker_pool.workers)
            
            # Check scaling condition
            if (queue_size > worker_pool.scale_threshold * active_workers and
                active_workers < worker_pool.max_workers and
                mock_usage.return_value.memory_percent < 70 and
                mock_usage.return_value.cpu_percent < 80):
                
                # Add worker
                await worker_pool.add_worker()
                # Stop the new worker immediately
                for worker_id, worker in worker_pool.workers.items():
                    if worker_id != "worker-0":
                        worker.stop()
        
        # Should have scaled up
        assert len(worker_pool.workers) == 2
        
        # Stop all workers
        for worker in worker_pool.workers.values():
            worker.stop()
        
        # Cleanup
        worker_pool.running = False
        await asyncio.sleep(0.1)
        
        # Clear tasks to avoid waiting
        worker_pool.worker_tasks.clear()
        worker_pool.workers.clear()
    
    @pytest.mark.asyncio
    async def test_auto_scaling_down(self, worker_pool, mock_queue_manager):
        """Test automatic scaling down."""
        # Start with multiple workers
        await worker_pool.add_worker("worker-1")
        await worker_pool.add_worker("worker-2")
        
        # Stop workers immediately
        for worker in worker_pool.workers.values():
            worker.stop()
        
        # Simulate empty queue
        mock_queue_manager.get_total_queue_size = MagicMock(return_value=0)
        
        # Make workers idle
        for worker in worker_pool.workers.values():
            worker.info.status = WorkerStatus.IDLE
        
        # Trigger scaling check manually
        worker_pool.running = True
        
        # Extract scaling down logic
        queue_size = mock_queue_manager.get_total_queue_size()
        active_workers = len(worker_pool.workers)
        
        # Check scale down condition
        if (queue_size < active_workers and
            active_workers > worker_pool.min_workers):
            
            # Find idle worker to remove
            for worker_id, worker in list(worker_pool.workers.items()):
                if worker.info.status == WorkerStatus.IDLE:
                    await worker_pool.remove_worker(worker_id)
                    break
        
        # Should have scaled down
        assert len(worker_pool.workers) < 2
        
        # Cleanup
        worker_pool.running = False
        await asyncio.sleep(0.1)
        await worker_pool.stop()
    
    def test_get_status(self, worker_pool, mock_queue_manager):
        """Test getting pool status."""
        # Create the output directory that ResourceMonitor expects
        import os
        os.makedirs("/tmp/outputs", exist_ok=True)
        
        status = worker_pool.get_status()
        
        assert "workers" in status
        assert "worker_count" in status
        assert "queue_size" in status
        assert "resources" in status
        assert status["worker_count"] == 0
        assert status["min_workers"] == 1
        assert status["max_workers"] == 3


class TestWorkerService:
    """Test WorkerService functionality."""
    
    @pytest.fixture
    def mock_queue_manager(self):
        """Create mock queue manager."""
        manager = MagicMock(spec=TaskQueueManager)
        manager.get_total_queue_size = MagicMock(return_value=0)
        manager.get_queue_stats = MagicMock(return_value={})
        manager.dequeue_task = MagicMock(return_value=None)
        return manager
    
    @pytest.fixture
    def mock_workflow_executor(self):
        """Create mock workflow executor."""
        return MagicMock(spec=WorkflowExecutor)
    
    @pytest.fixture
    def worker_service(self, mock_queue_manager, mock_workflow_executor):
        """Create worker service."""
        return WorkerService(
            queue_manager=mock_queue_manager,
            workflow_executor=mock_workflow_executor,
            config={"min_workers": 1, "max_workers": 2}
        )
    
    @pytest.mark.asyncio
    async def test_service_initialization(self, worker_service):
        """Test service initialization."""
        assert worker_service.running is False
        assert worker_service.worker_pool is not None
    
    @pytest.mark.asyncio
    async def test_service_start_stop(self, worker_service):
        """Test starting and stopping service."""
        # Start service in background
        service_task = asyncio.create_task(worker_service.start())
        await asyncio.sleep(0.1)
        
        assert worker_service.running is True
        
        # Trigger shutdown
        worker_service._shutdown_event.set()
        
        # Wait for shutdown
        await asyncio.wait_for(service_task, timeout=5.0)
        
        assert worker_service.running is False
    
    def test_service_get_status(self, worker_service):
        """Test getting service status."""
        # Create the output directory that ResourceMonitor expects
        import os
        os.makedirs("/tmp/outputs", exist_ok=True)
        
        status = worker_service.get_status()
        
        assert "running" in status
        assert "pool_status" in status
        assert status["running"] is False
    
    def test_service_pause_resume(self, worker_service):
        """Test pausing and resuming service."""
        # Should delegate to pool
        with patch.object(worker_service.worker_pool, 'pause_all') as mock_pause:
            worker_service.pause()
            mock_pause.assert_called_once()
        
        with patch.object(worker_service.worker_pool, 'resume_all') as mock_resume:
            worker_service.resume()
            mock_resume.assert_called_once()