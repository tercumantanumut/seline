"""Resource monitoring utilities for task execution."""

import logging
import os
import sys
import tempfile
import time
from dataclasses import dataclass
from typing import Any

import psutil

logger = logging.getLogger(__name__)


@dataclass
class ResourceUsage:
    """Resource usage snapshot."""

    cpu_percent: float
    memory_percent: float
    memory_used_mb: float
    memory_available_mb: float
    disk_usage_percent: float
    gpu_memory_used_mb: float | None = None
    gpu_memory_total_mb: float | None = None
    gpu_utilization: float | None = None
    timestamp: float = 0.0

    def is_within_limits(
        self,
        max_cpu_percent: float = 98.0,
        max_memory_percent: float = 95.0,
        max_disk_percent: float = 99.0,
    ) -> bool:
        """Check if resources are within safe limits."""
        if self.cpu_percent > max_cpu_percent:
            return False
        if self.memory_percent > max_memory_percent:
            return False
        return self.disk_usage_percent <= max_disk_percent

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "cpu_percent": self.cpu_percent,
            "memory_percent": self.memory_percent,
            "memory_used_mb": self.memory_used_mb,
            "memory_available_mb": self.memory_available_mb,
            "disk_usage_percent": self.disk_usage_percent,
            "gpu_memory_used_mb": self.gpu_memory_used_mb,
            "gpu_memory_total_mb": self.gpu_memory_total_mb,
            "gpu_utilization": self.gpu_utilization,
            "timestamp": self.timestamp,
        }


class ResourceMonitor:
    """Monitor system resources."""

    def __init__(
        self,
        check_interval: float = 1.0,
        enable_gpu_monitoring: bool = True,
        output_dir: str = os.path.join(tempfile.gettempdir(), "outputs"),
    ):
        """Initialize resource monitor.

        Args:
            check_interval: How often to check resources (seconds)
            enable_gpu_monitoring: Whether to monitor GPU if available
            output_dir: Directory to monitor for disk usage
        """
        self.check_interval = check_interval
        self.enable_gpu_monitoring = enable_gpu_monitoring
        self.output_dir = output_dir
        self.has_gpu = self._check_gpu_availability()

        # Resource thresholds - relaxed for GPU workloads
        self.thresholds = {
            "cpu_critical": 99.0,
            "cpu_warning": 95.0,
            "memory_critical": 98.0,
            "memory_warning": 90.0,
            "disk_critical": 99.0,
            "disk_warning": 95.0,
            "gpu_memory_critical": 99.0,
            "gpu_memory_warning": 95.0,
        }

        logger.info(f"ResourceMonitor initialized (GPU: {self.has_gpu})")

    def _check_gpu_availability(self) -> bool:
        """Check if GPU monitoring is available."""
        if not self.enable_gpu_monitoring:
            return False

        try:
            # Check for NVIDIA GPU using nvidia-ml-py
            import pynvml

            pynvml.nvmlInit()
            device_count = int(pynvml.nvmlDeviceGetCount())
            pynvml.nvmlShutdown()
            return device_count > 0
        except Exception:
            pass

        # Check for CUDA availability
        try:
            import torch

            return bool(torch.cuda.is_available())
        except Exception:
            pass

        return False

    def get_current_usage(self) -> ResourceUsage:
        """Get current resource usage."""
        # CPU usage (averaged over check_interval)
        cpu_percent = psutil.cpu_percent(interval=self.check_interval)

        # Memory usage
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
        memory_used_mb = memory.used / (1024 * 1024)
        memory_available_mb = memory.available / (1024 * 1024)

        # Disk usage for output directory
        disk = psutil.disk_usage(self.output_dir)
        disk_usage_percent = disk.percent

        # GPU monitoring if available
        gpu_memory_used_mb = None
        gpu_memory_total_mb = None
        gpu_utilization = None

        if self.has_gpu:
            gpu_stats = self._get_gpu_stats()
            if gpu_stats:
                gpu_memory_used_mb = gpu_stats[0]
                gpu_memory_total_mb = gpu_stats[1]
                gpu_utilization = gpu_stats[2]

        return ResourceUsage(
            cpu_percent=cpu_percent,
            memory_percent=memory_percent,
            memory_used_mb=memory_used_mb,
            memory_available_mb=memory_available_mb,
            disk_usage_percent=disk_usage_percent,
            gpu_memory_used_mb=gpu_memory_used_mb,
            gpu_memory_total_mb=gpu_memory_total_mb,
            gpu_utilization=gpu_utilization,
            timestamp=time.time(),
        )

    def _get_gpu_stats(self) -> tuple[float, float, float | None] | None:
        """Get GPU memory and utilization stats.

        Returns:
            Tuple of (used_mb, total_mb, utilization_percent) or None
        """
        try:
            import pynvml

            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)  # First GPU

            # Memory info
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            used_mb = mem_info.used / (1024 * 1024)
            total_mb = mem_info.total / (1024 * 1024)

            # Utilization
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            gpu_util = util.gpu

            pynvml.nvmlShutdown()
            return (used_mb, total_mb, gpu_util)

        except Exception:
            # Fallback to PyTorch if available
            try:
                import torch

                if torch.cuda.is_available():
                    # Get memory stats
                    used = torch.cuda.memory_allocated() / (1024 * 1024)
                    total = torch.cuda.get_device_properties(0).total_memory / (
                        1024 * 1024
                    )
                    # PyTorch doesn't provide utilization directly
                    return (float(used), float(total), None)
            except Exception:
                pass

        return None

    def check_resource_availability(
        self, required_memory_mb: float = 1024, required_disk_mb: float = 1024
    ) -> tuple[bool, str]:
        """Check if resources are available for a task.

        Args:
            required_memory_mb: Required memory in MB
            required_disk_mb: Required disk space in MB

        Returns:
            Tuple of (is_available, reason_if_not)
        """
        usage = self.get_current_usage()

        # Check CPU
        if usage.cpu_percent > self.thresholds["cpu_critical"]:
            return False, f"CPU usage too high: {usage.cpu_percent:.1f}%"

        # Check memory
        if usage.memory_available_mb < required_memory_mb:
            return (
                False,
                f"Insufficient memory: {usage.memory_available_mb:.0f}MB available, {required_memory_mb:.0f}MB required",
            )

        if usage.memory_percent > self.thresholds["memory_critical"]:
            return False, f"Memory usage too high: {usage.memory_percent:.1f}%"

        # Check disk
        disk = psutil.disk_usage(self.output_dir)
        disk_available_mb = disk.free / (1024 * 1024)
        if disk_available_mb < required_disk_mb:
            return (
                False,
                f"Insufficient disk space: {disk_available_mb:.0f}MB available, {required_disk_mb:.0f}MB required",
            )

        if usage.disk_usage_percent > self.thresholds["disk_critical"]:
            return False, f"Disk usage too high: {usage.disk_usage_percent:.1f}%"

        # Check GPU if needed
        if (
            self.has_gpu
            and usage.gpu_memory_used_mb is not None
            and usage.gpu_memory_total_mb is not None
        ):
            gpu_percent = (usage.gpu_memory_used_mb / usage.gpu_memory_total_mb) * 100
            if gpu_percent > self.thresholds["gpu_memory_critical"]:
                return False, f"GPU memory usage too high: {gpu_percent:.1f}%"

        return True, "Resources available"

    def get_resource_estimate(
        self, workflow_complexity: dict[str, Any]
    ) -> dict[str, float]:
        """Estimate resource requirements for a workflow.

        Args:
            workflow_complexity: Workflow complexity metrics

        Returns:
            Dict with estimated requirements
        """
        # Base requirements
        base_memory_mb = 512
        base_disk_mb = 100

        # Scale based on complexity
        nodes = workflow_complexity.get("total_nodes", 1)
        width = workflow_complexity.get("width", 512)
        height = workflow_complexity.get("height", 512)
        batch_size = workflow_complexity.get("batch_size", 1)
        steps = workflow_complexity.get("steps", 20)

        # Memory estimate (rough heuristics)
        # Each node adds overhead
        memory_mb = base_memory_mb + (nodes * 50)

        # Image size affects memory significantly
        pixel_count = width * height * batch_size
        memory_mb += (pixel_count / 1000000) * 100  # ~100MB per megapixel

        # Sampling steps affect temporary memory
        memory_mb += steps * 10

        # Disk estimate (for output images)
        # PNG is roughly 4 bytes per pixel
        disk_mb = base_disk_mb + (pixel_count * 4 * batch_size / 1000000)

        # Add buffer for safety
        memory_mb *= 1.5
        disk_mb *= 2

        return {
            "estimated_memory_mb": round(memory_mb),
            "estimated_disk_mb": round(disk_mb),
            "estimated_time_seconds": round(steps * 0.5 * batch_size),  # Rough estimate
        }

    def monitor_process(self, pid: int) -> dict[str, float] | None:
        """Monitor a specific process.

        Args:
            pid: Process ID to monitor

        Returns:
            Process resource usage or None if process not found
        """
        try:
            process = psutil.Process(pid)

            # Get process stats
            with process.oneshot():
                cpu_percent = process.cpu_percent(interval=0.1)
                memory_info = process.memory_info()
                memory_mb = memory_info.rss / (1024 * 1024)
                memory_percent = process.memory_percent()

                # Get IO counters if available
                try:
                    io_counters = process.io_counters()
                    read_mb = io_counters.read_bytes / (1024 * 1024)
                    write_mb = io_counters.write_bytes / (1024 * 1024)
                except (psutil.AccessDenied, AttributeError):
                    read_mb = 0
                    write_mb = 0

                return {
                    "pid": pid,
                    "cpu_percent": cpu_percent,
                    "memory_mb": memory_mb,
                    "memory_percent": memory_percent,
                    "io_read_mb": read_mb,
                    "io_write_mb": write_mb,
                    "status": process.status(),
                }

        except psutil.NoSuchProcess:
            return None
        except Exception as e:
            logger.error(f"Error monitoring process {pid}: {e}")
            return None

    def get_system_info(self) -> dict[str, Any]:
        """Get system information."""
        info = {
            "cpu_count": psutil.cpu_count(),
            "cpu_count_logical": psutil.cpu_count(logical=True),
            "memory_total_gb": psutil.virtual_memory().total / (1024**3),
            "disk_total_gb": psutil.disk_usage(self.output_dir).total / (1024**3),
            "platform": os.uname().sysname,
            "python_version": sys.version.split()[0],
        }

        if self.has_gpu:
            try:
                import torch

                if torch.cuda.is_available():
                    info["gpu_name"] = torch.cuda.get_device_name(0)
                    info["gpu_count"] = torch.cuda.device_count()
                    info["cuda_version"] = torch.version.cuda
            except Exception:
                pass

        return info

    def cleanup_old_outputs(self, max_age_hours: int = 24) -> None:
        """Clean up old output files to free disk space.

        Args:
            max_age_hours: Maximum age of files to keep
        """
        from pathlib import Path

        try:
            output_path = Path(self.output_dir)
            if not output_path.exists():
                return

            current_time = time.time()
            max_age_seconds = max_age_hours * 3600

            cleaned_count = 0
            cleaned_size = 0

            for file_path in output_path.glob("**/*"):
                if file_path.is_file():
                    file_age = current_time - file_path.stat().st_mtime
                    if file_age > max_age_seconds:
                        file_size = file_path.stat().st_size
                        file_path.unlink()
                        cleaned_count += 1
                        cleaned_size += file_size

            if cleaned_count > 0:
                logger.info(
                    f"Cleaned {cleaned_count} files, freed {cleaned_size / (1024**2):.1f}MB"
                )

        except Exception as e:
            logger.error(f"Error cleaning old outputs: {e}")
