#!/usr/bin/env python3
"""Standalone worker service for processing ComfyUI tasks."""

import asyncio
import logging
import os
import signal
import sys
import tempfile
import typing as t
from pathlib import Path

import typer
from rich import box
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.logging import RichHandler
from rich.panel import Panel
from rich.table import Table

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.api.resource_monitor import ResourceMonitor
from src.api.task_queue import TaskQueueManager
from src.api.websocket_manager import WebSocketManager
from src.api.worker_service import WorkerService
from src.api.workflow_executor import WorkflowExecutor

# Configure logging with Rich
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=True)],
)
logger = logging.getLogger(__name__)

# CLI app
app = typer.Typer(help="ComfyUI Worker Service - Process tasks from queue")
console = Console()

# Global worker service for signal handling
worker_service: WorkerService | None = None
shutdown_event = asyncio.Event()


def handle_shutdown(sig: int, _frame: t.Any) -> None:
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {sig}, initiating graceful shutdown...")
    shutdown_event.set()


async def display_status(
    worker_service: WorkerService, refresh_rate: float = 2.0
) -> None:
    """Display live status dashboard."""
    layout = Layout()

    with Live(layout, console=console, refresh_per_second=1 / refresh_rate):
        while not shutdown_event.is_set():
            try:
                # Get current status
                status = worker_service.get_status()
                pool_status = status["pool_status"]

                # Create status table
                table = Table(
                    title="Worker Service Status",
                    box=box.ROUNDED,
                    show_header=True,
                    header_style="bold magenta",
                )

                table.add_column("Metric", style="cyan")
                table.add_column("Value", style="green")

                # Service status
                table.add_row(
                    "Service Running", "✅ Yes" if status["running"] else "❌ No"
                )
                table.add_row("Active Workers", str(pool_status["worker_count"]))
                table.add_row("Min Workers", str(pool_status["min_workers"]))
                table.add_row("Max Workers", str(pool_status["max_workers"]))

                # Queue status
                table.add_row("Queue Size", str(pool_status["queue_size"]))
                queue_stats = pool_status.get("queue_stats", {})
                table.add_row(
                    "Total Enqueued", str(queue_stats.get("total_enqueued", 0))
                )
                table.add_row(
                    "Total Processed", str(queue_stats.get("total_processed", 0))
                )
                table.add_row("Total Failed", str(queue_stats.get("total_failed", 0)))

                # Resource usage
                resources = pool_status.get("resources", {})
                table.add_row("CPU Usage", f"{resources.get('cpu_percent', 0):.1f}%")
                table.add_row(
                    "Memory Usage", f"{resources.get('memory_percent', 0):.1f}%"
                )
                table.add_row(
                    "Memory Available",
                    f"{resources.get('memory_available_mb', 0):.0f} MB",
                )

                # Worker details
                if pool_status.get("workers"):
                    worker_table = Table(
                        title="Worker Details", box=box.SIMPLE, show_header=True
                    )
                    worker_table.add_column("Worker ID")
                    worker_table.add_column("Status")
                    worker_table.add_column("Current Task")
                    worker_table.add_column("Completed")
                    worker_table.add_column("Failed")

                    for worker in pool_status["workers"]:
                        worker_table.add_row(
                            worker["worker_id"],
                            worker["status"],
                            worker.get("current_task", "-"),
                            str(worker.get("tasks_completed", 0)),
                            str(worker.get("tasks_failed", 0)),
                        )

                    # Update layout with both tables
                    layout.split_column(
                        Panel(table, title="System Status"),
                        Panel(worker_table, title="Workers"),
                    )
                else:
                    layout.update(Panel(table, title="System Status"))

                await asyncio.sleep(refresh_rate)

            except Exception as e:
                logger.error(f"Error updating status display: {e}")
                await asyncio.sleep(refresh_rate)


@app.command()
def start(
    comfyui_host: str = typer.Option(
        "localhost", "--host", help="ComfyUI server hostname"
    ),
    comfyui_port: int = typer.Option(8188, "--port", help="ComfyUI server port"),
    workflow_path: str = typer.Option(
        "/app/workflow.json", "--workflow", help="Path to workflow JSON"
    ),
    output_dir: str = typer.Option(
        "/app/outputs", "--output", help="Output directory for images"
    ),
    queue_path: str = typer.Option(
        os.getenv("QUEUE_PATH", os.path.join(tempfile.gettempdir(), "task_queue.db")),
        "--queue",
        help="Queue database path",
    ),
    min_workers: int = typer.Option(
        1, "--min-workers", help="Minimum number of workers"
    ),
    max_workers: int = typer.Option(
        4, "--max-workers", help="Maximum number of workers"
    ),
    scale_threshold: int = typer.Option(
        5, "--scale-threshold", help="Queue size per worker before scaling"
    ),
    _max_retries: int = typer.Option(
        3, "--max-retries", help="Maximum task retry attempts"
    ),
    show_dashboard: bool = typer.Option(
        True, "--dashboard/--no-dashboard", help="Show live status dashboard"
    ),
    debug: bool = typer.Option(False, "--debug", help="Enable debug logging"),
) -> None:
    """Start the worker service to process tasks from queue."""
    global worker_service

    # Set logging level
    if debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Setup signal handlers
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    console.print(
        Panel.fit(
            f"[bold green]Starting ComfyUI Worker Service[/bold green]\n"
            f"ComfyUI: {comfyui_host}:{comfyui_port}\n"
            f"Workers: {min_workers}-{max_workers}\n"
            f"Queue: {queue_path}",
            title="Worker Service",
            border_style="green",
        )
    )

    async def run_service() -> None:
        global worker_service

        try:
            # Initialize components
            console.print("[yellow]Initializing components...[/yellow]")

            # Queue manager
            queue_manager = TaskQueueManager(queue_path=queue_path)
            console.print("✅ Queue manager initialized")

            # Workflow executor
            workflow_executor = WorkflowExecutor(
                comfyui_host=comfyui_host,
                comfyui_port=comfyui_port,
                workflow_path=workflow_path,
                output_dir=output_dir,
            )
            console.print("✅ Workflow executor initialized")

            # WebSocket manager (optional)
            websocket_manager = None
            if os.getenv("ENABLE_WEBSOCKET", "false").lower() == "true":
                websocket_manager = WebSocketManager()
                console.print("✅ WebSocket manager initialized")

            # Worker service
            worker_service = WorkerService(
                queue_manager=queue_manager,
                workflow_executor=workflow_executor,
                websocket_manager=websocket_manager,
                config={
                    "min_workers": min_workers,
                    "max_workers": max_workers,
                    "scale_threshold": scale_threshold,
                },
            )
            console.print("✅ Worker service initialized")

            # Start service
            console.print(
                f"\n[bold green]Starting {min_workers} worker(s)...[/bold green]"
            )

            # Create tasks
            tasks = []

            # Worker service task
            service_task = asyncio.create_task(worker_service.start())
            tasks.append(service_task)

            # Status display task (if enabled)
            if show_dashboard:
                display_task = asyncio.create_task(
                    display_status(worker_service, refresh_rate=2.0)
                )
                tasks.append(display_task)
            else:
                console.print("[green]Worker service started successfully![/green]")
                console.print("[yellow]Press Ctrl+C to stop[/yellow]\n")

            # Wait for shutdown
            await shutdown_event.wait()

            # Graceful shutdown
            console.print("\n[yellow]Shutting down worker service...[/yellow]")

            # Cancel tasks
            for task in tasks:
                task.cancel()

            # Stop worker service
            if worker_service:
                await worker_service.stop()

            console.print("[green]Worker service stopped successfully![/green]")

        except Exception as e:
            console.print(f"[red]Error: {e}[/red]")
            logger.exception("Worker service error")
            sys.exit(1)

    # Run the service
    try:
        asyncio.run(run_service())
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted by user[/yellow]")
    except Exception as e:
        console.print(f"[red]Fatal error: {e}[/red]")
        sys.exit(1)


@app.command()
def status(
    queue_path: str = typer.Option(
        os.getenv("QUEUE_PATH", os.path.join(tempfile.gettempdir(), "task_queue.db")),
        "--queue",
        help="Queue database path",
    ),
) -> None:
    """Check the status of the task queue."""
    try:
        queue_manager = TaskQueueManager(queue_path=queue_path)
        stats = queue_manager.get_queue_stats()

        # Create status table
        table = Table(
            title="Task Queue Status",
            box=box.ROUNDED,
            show_header=True,
            header_style="bold cyan",
        )

        table.add_column("Metric", style="yellow")
        table.add_column("Value", style="green")

        table.add_row("Total Enqueued", str(stats.get("total_enqueued", 0)))
        table.add_row("Total Processed", str(stats.get("total_processed", 0)))
        table.add_row("Total Failed", str(stats.get("total_failed", 0)))
        table.add_row("Total Retried", str(stats.get("total_retried", 0)))
        table.add_row("Current Queue Size", str(queue_manager.get_total_queue_size()))
        table.add_row(
            "Dead Letter Queue Size", str(queue_manager.dead_letter_queue.size)
        )

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error checking queue status: {e}[/red]")
        sys.exit(1)


@app.command()
def health(
    comfyui_host: str = typer.Option(
        "localhost", "--host", help="ComfyUI server hostname"
    ),
    comfyui_port: int = typer.Option(8188, "--port", help="ComfyUI server port"),
) -> None:
    """Check health of ComfyUI server and system resources."""
    import aiohttp

    async def check_health() -> None:
        # Check ComfyUI
        comfyui_url = f"http://{comfyui_host}:{comfyui_port}"
        comfyui_healthy = False

        try:
            async with (
                aiohttp.ClientSession() as session,
                session.get(f"{comfyui_url}/system_stats") as response,
            ):
                if response.status == 200:
                    comfyui_healthy = True
        except Exception as e:
            logger.debug(f"ComfyUI health check failed: {e}")

        # Check resources
        resource_monitor = ResourceMonitor()
        usage = resource_monitor.get_current_usage()
        system_info = resource_monitor.get_system_info()

        # Create health table
        table = Table(
            title="System Health Check",
            box=box.ROUNDED,
            show_header=True,
            header_style="bold cyan",
        )

        table.add_column("Component", style="yellow")
        table.add_column("Status", style="green")
        table.add_column("Details")

        # ComfyUI status
        table.add_row(
            "ComfyUI Server",
            "✅ Healthy" if comfyui_healthy else "❌ Unhealthy",
            f"{comfyui_host}:{comfyui_port}",
        )

        # Resource status
        cpu_ok = usage.cpu_percent < 90
        table.add_row(
            "CPU Usage",
            "✅ OK" if cpu_ok else "⚠️ High",
            f"{usage.cpu_percent:.1f}% ({system_info.get('cpu_count', 'N/A')} cores)",
        )

        mem_ok = usage.memory_percent < 85
        table.add_row(
            "Memory Usage",
            "✅ OK" if mem_ok else "⚠️ High",
            f"{usage.memory_percent:.1f}% ({usage.memory_available_mb:.0f} MB available)",
        )

        disk_ok = usage.disk_usage_percent < 90
        table.add_row(
            "Disk Usage",
            "✅ OK" if disk_ok else "⚠️ High",
            f"{usage.disk_usage_percent:.1f}%",
        )

        # GPU status (if available)
        if usage.gpu_memory_used_mb is not None and usage.gpu_memory_total_mb:
            gpu_percent = usage.gpu_memory_used_mb / usage.gpu_memory_total_mb * 100
            gpu_ok = gpu_percent < 90
            table.add_row(
                "GPU Memory",
                "✅ OK" if gpu_ok else "⚠️ High",
                f"{gpu_percent:.1f}% ({system_info.get('gpu_name', 'Unknown GPU')})",
            )

        console.print(table)

        # Overall health
        all_healthy = comfyui_healthy and cpu_ok and mem_ok and disk_ok
        if all_healthy:
            console.print("\n[bold green]✅ All systems healthy![/bold green]")
        else:
            console.print(
                "\n[bold yellow]⚠️ Some components need attention[/bold yellow]"
            )

    asyncio.run(check_health())


if __name__ == "__main__":
    app()
