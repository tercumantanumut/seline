"""Workflow execution API router.

Integrates with ComfyUI via the WorkflowExecutor when creating executions.
"""

import asyncio
import logging
import os
import threading
import typing as t
from contextlib import suppress
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from src.api import event_bus
from src.api.workflow_executor import WorkflowExecutor
from src.db.database import init_db
from src.db.repositories import (
    BuildRepository,
    ExecutionRepository,
    WorkflowRepository,
)
from src.workflows.converter import WorkflowConverter

router = APIRouter()

db = init_db()


# Module logger
logger = logging.getLogger(__name__)


def get_session() -> t.Generator[Any, None, None]:
    """Yield a database session for request lifetime."""
    with db.get_session() as session:
        yield session


@router.get("/")
async def list_executions(
    limit: int = Query(default=50, ge=1, le=500),
    session: Any = Depends(get_session),
) -> list[Any]:
    """List recent workflow executions."""
    repo = ExecutionRepository(session)
    return t.cast(list[Any], repo.list(limit=limit))


class ExecutionCreateRequest(BaseModel):  # type: ignore[no-any-unimported]
    """Request payload to start an execution for a workflow."""

    workflow_id: str
    parameters: dict[str, Any] | None = None


@router.post("/")
async def create_execution(
    payload: ExecutionCreateRequest,
    session: Any = Depends(get_session),
) -> Any:
    """Create a new workflow execution and run it in the background."""
    repo = ExecutionRepository(session)
    wrepo = WorkflowRepository(session)
    wf = wrepo.get(payload.workflow_id)
    if not wf:
        return {"detail": "Workflow not found"}

    # Create pending record
    execution = repo.create(
        workflow_id=payload.workflow_id,
        prompt_id=f"pending-{payload.workflow_id}",
        status="pending",
        input_parameters=payload.parameters or {},
    )

    # Emit pending status
    try:
        import anyio

        anyio.run(
            event_bus.emit_execution_event,
            execution.id,
            "execution_status",
            {"status": "pending"},
        )
    except Exception:
        pass

    # Resolve ComfyUI endpoint: env override or ensure local container with port binding
    env_url = os.getenv("COMFYUI_URL")

    # Run actual execution in background thread (non-blocking for API)
    def _run() -> None:
        local_db = init_db()
        try:
            # Determine ComfyUI base URL
            comfy_base = env_url
            if not comfy_base:
                # Ensure a container is running and exposed on localhost
                comfy_base = _ensure_comfy_service(local_db, payload.workflow_id)

            parsed = urlparse(comfy_base)
            ex = WorkflowExecutor(
                comfyui_host=parsed.hostname or "127.0.0.1",
                comfyui_port=parsed.port or 8188,
            )
            # Load workflow fresh inside this thread to avoid detached instance
            with local_db.get_session() as s1:
                wf_obj = WorkflowRepository(s1).get(payload.workflow_id)
                if not wf_obj:
                    raise RuntimeError("Workflow not found")
                wf_def_raw = wf_obj.definition or {}
            # Convert stored workflow to API format, then inject params
            try:
                wf_api = WorkflowConverter().convert(wf_def_raw)
            except Exception:
                wf_api = wf_def_raw
            injected = ex.inject_parameters(wf_api, payload.parameters or {})

            # Submit and wait for completion
            async def _do() -> tuple[str, dict[str, Any]]:
                prompt_id = await ex.submit_workflow(injected)
                return prompt_id, await ex.wait_for_completion(prompt_id, timeout=600.0)

            prompt_id, result = asyncio.run(_do())

            # Update execution as running -> completed/failed
            with local_db.get_session() as s2:
                erepo = ExecutionRepository(s2)
                current = erepo.get(execution.id)
                if not current:
                    return
                current.prompt_id = prompt_id
                status = str(result.get("status") or "completed")
                current.status = status
                if status == "failed":
                    # Capture an error message if available
                    err = (
                        result.get("error")
                        or result.get("messages")
                        or result.get("detail")
                    )
                    with suppress(Exception):
                        current.error_message = (
                            err
                            if isinstance(err, str)
                            else ("; ".join(err) if isinstance(err, list) else str(err))
                        )
                # Capture produced images if available
                outputs = []
                imgs = result.get("images") or []
                if isinstance(imgs, list):
                    # Expect list of URLs or dicts with 'url'
                    for item in imgs:
                        if isinstance(item, str):
                            outputs.append(item)
                        elif isinstance(item, dict) and item.get("url"):
                            outputs.append(str(item["url"]))
                current.output_files = outputs
                from datetime import datetime as _dt

                current.completed_at = _dt.utcnow()
                # execution_time may be included in result
                et = result.get("time") or result.get("execution_time")
                with suppress(Exception):
                    current.execution_time = float(et) if et is not None else None
                s2r = s2
                s2r.add(current)
                s2r.commit()
                s2r.refresh(current)
                # Emit event
                try:
                    import anyio

                    anyio.run(
                        event_bus.emit_execution_event,
                        current.id,
                        "execution_status",
                        {"status": current.status},
                    )
                except Exception:
                    pass
        except Exception as e:  # update as failed
            with local_db.get_session() as s2:
                erepo = ExecutionRepository(s2)
                current = erepo.get(execution.id)
                if not current:
                    return
                current.status = "failed"
                current.error_message = str(e)
                from datetime import datetime as _dt

                current.completed_at = _dt.utcnow()
                s2r = s2
                s2r.add(current)
                s2r.commit()
                try:
                    import anyio

                    anyio.run(
                        event_bus.emit_execution_event,
                        current.id,
                        "execution_status",
                        {"status": "failed"},
                    )
                except Exception:
                    pass

    threading.Thread(target=_run, daemon=True).start()

    return execution


def _ensure_comfy_service(local_db: Any, workflow_id: str) -> str:
    """Ensure a ComfyUI container for the workflow is running and reachable on localhost.

    Starts a container from the latest successful build if not running. Binds 8188/tcp to a free host port.

    Returns the base URL (e.g., http://127.0.0.1:49188)
    """
    from time import sleep, time

    try:
        import docker
    except Exception as e:  # pragma: no cover
        raise RuntimeError(f"Docker SDK not available: {e}") from e

    with local_db.get_session() as s:
        brepo = BuildRepository(s)
        build = brepo.get_latest_successful_build(workflow_id)
        if not build:
            raise RuntimeError(
                "No successful container build found for this workflow. Build the container first."
            )

    client = docker.from_env()
    label_key = "comfy.workflow_id"
    label_val = workflow_id

    # Try to find existing containers for this workflow
    containers = client.containers.list(
        all=True, filters={"label": f"{label_key}={label_val}"}
    )
    desired_image = f"{build.image_name}:{build.tag}"

    # Select a candidate container that already uses the latest image and is running
    container = None
    for c in containers:
        try:
            c.reload()
            tags = c.image.tags or []
            if desired_image in tags and c.status == "running":
                container = c
                break
        except Exception:
            pass

    def _host_port(c: Any) -> str | None:
        try:
            c.reload()
            ports = c.attrs.get("NetworkSettings", {}).get("Ports", {})
            mapping = ports.get("8188/tcp")
            if mapping and len(mapping) > 0:
                return t.cast(str | None, mapping[0].get("HostPort"))
        except Exception:
            pass
        return None

    if container and container.status == "running":
        # Ensure it exposes a host port
        hp = _host_port(container)
        if hp:
            return f"http://127.0.0.1:{hp}"
        # No port mapping; recreate with mapping
        with suppress(Exception):
            container.stop(timeout=3)
        with suppress(Exception):
            container.remove()
        container = None

    if not container:
        image = desired_image
        # Bind to random free host port
        ports = {"8188/tcp": ("127.0.0.1", None)}
        # Add GPU support if available
        device_requests = []
        try:  # best-effort; continue without GPU if unavailable
            import docker

            runtimes = t.cast(dict[str, t.Any], client.info().get("Runtimes", {}))
            if "nvidia" in runtimes:
                device_requests = [
                    docker.types.DeviceRequest(
                        device_ids=["all"], capabilities=[["gpu"]]
                    )
                ]
        except Exception:
            pass

        container = client.containers.run(
            image=image,
            detach=True,
            labels={label_key: label_val},
            ports=ports,
            device_requests=device_requests,
        )

        # Stop and remove any other stale containers for this workflow
        try:
            others = client.containers.list(
                all=True, filters={"label": f"{label_key}={label_val}"}
            )
            for oc in others:
                if oc.id != container.id:
                    with suppress(Exception):
                        oc.stop(timeout=2)
                    with suppress(Exception):
                        oc.remove()
        except Exception:
            pass

    # Wait for readiness
    host_port = None
    t0 = time()
    while time() - t0 < 60:
        host_port = _host_port(container)
        if host_port:
            # Simple HTTP GET ping without asyncio to avoid warnings
            try:
                import http.client

                conn = http.client.HTTPConnection(
                    "127.0.0.1", int(host_port), timeout=1.5
                )
                conn.request("GET", "/")
                resp = conn.getresponse()
                if 200 <= resp.status < 500:
                    return f"http://127.0.0.1:{host_port}"
                conn.close()
            except Exception:
                pass
        # Check if container exited with error; surface logs
        container.reload()
        if container.status in ("exited", "dead"):
            try:
                logs = container.logs(tail=200).decode("utf-8", errors="ignore")
            except Exception:
                logs = ""
            # Instead of throwing here (causes 500), return a sentinel URL with error embedded
            raise RuntimeError("ComfyUI container exited during startup.\n" + logs)
        sleep(1)

    # Fallback return if we have a port but readiness not confirmed
    if host_port:
        return f"http://127.0.0.1:{host_port}"
    # Final status check and logs
    try:
        container.reload()
        if container.status in ("exited", "dead"):
            try:
                logs = container.logs(tail=200).decode("utf-8", errors="ignore")
            except Exception:
                logs = ""
            raise RuntimeError("ComfyUI container exited during startup.\n" + logs)
    except Exception:
        pass
    raise RuntimeError(
        "ComfyUI container failed to expose port 8188 on host within timeout"
    )


@router.get("/{execution_id}/container/logs")
async def get_execution_container_logs(
    execution_id: str, tail: int = 200, session: Any = Depends(get_session)
) -> dict[str, Any]:
    """Fetch recent logs from the ComfyUI container associated with this workflow execution.

    Uses the workflow label to select the container that serves executions for that workflow.
    """
    exe_repo = ExecutionRepository(session)
    e = exe_repo.get(execution_id)
    if not e:
        return {"logs": "", "detail": "Execution not found"}
    try:
        import docker

        client = docker.from_env()
        label_key = "comfy.workflow_id"
        containers = client.containers.list(
            all=True, filters={"label": f"{label_key}={e.workflow_id}"}
        )
        if not containers:
            return {"logs": "", "detail": "No container found for workflow"}
        logs = containers[0].logs(tail=tail).decode("utf-8", errors="ignore")
        return {"logs": logs}
    except Exception as err:
        return {"logs": "", "detail": f"{err}"}


@router.get("/comfy/resolve")
async def resolve_comfy_url(workflow_id: str, start: bool = True) -> dict[str, Any]:
    """Resolve the ComfyUI base URL for a workflow.

    If COMFYUI_URL is set, returns it. Otherwise, if start=true, ensures a container
    is running for this workflow and returns the mapped localhost URL.
    """
    import os

    env_url = os.getenv("COMFYUI_URL")
    if env_url:
        return {"base_url": env_url, "source": "env"}
    local_db = init_db()
    if not start:
        # Try to find an already running container
        try:
            import docker

            client = docker.from_env()
            label_key = "comfy.workflow_id"
            containers = client.containers.list(
                all=True, filters={"label": f"{label_key}={workflow_id}"}
            )
            if containers:
                c = containers[0]
                c.reload()
                ports = c.attrs.get("NetworkSettings", {}).get("Ports", {})
                m = ports.get("8188/tcp")
                if m and len(m) > 0:
                    return {
                        "base_url": f"http://127.0.0.1:{m[0].get('HostPort')}",
                        "source": "container",
                    }
        except Exception:
            pass
        return {"base_url": None, "source": "none"}
    try:
        base = _ensure_comfy_service(local_db, workflow_id)
        return {"base_url": base, "source": "auto"}
    except Exception as e:
        return {"base_url": None, "error": str(e)}


@router.get("/comfy/status")
async def comfy_status(workflow_id: str) -> dict[str, Any]:
    """Return details about containers for this workflow and which image/tag they run."""
    try:
        import docker

        client = docker.from_env()
        label_key = "comfy.workflow_id"
        containers = client.containers.list(
            all=True, filters={"label": f"{label_key}={workflow_id}"}
        )
        out = []
        for c in containers:
            try:
                c.reload()
                ports = c.attrs.get("NetworkSettings", {}).get("Ports", {})
                m = ports.get("8188/tcp")
                host_port = m[0].get("HostPort") if m else None
                out.append(
                    {
                        "id": c.id,
                        "name": c.name,
                        "status": c.status,
                        "image": (c.image.tags or [c.image.id])[0],
                        "host_port": host_port,
                    }
                )
            except Exception:
                pass
        return {"containers": out}
    except Exception as e:
        return {"containers": [], "error": str(e)}


@router.post("/comfy/restart")
async def comfy_restart(workflow_id: str) -> dict[str, Any]:
    """Force restart the ComfyUI container for a workflow using its latest built image."""
    local_db = init_db()
    # Stop/remove all existing labeled containers, then ensure service
    try:
        import docker

        client = docker.from_env()
        label_key = "comfy.workflow_id"
        containers = client.containers.list(
            all=True, filters={"label": f"{label_key}={workflow_id}"}
        )
        for c in containers:
            with suppress(Exception):
                c.stop(timeout=2)
            with suppress(Exception):
                c.remove()
    except Exception:
        pass

    try:
        base = _ensure_comfy_service(local_db, workflow_id)
        return {"base_url": base, "status": "restarted"}
    except Exception as e:
        # Return JSON error (200) so CORS/simple clients can read details
        return {"base_url": None, "status": "error", "error": str(e)}


@router.get("/{execution_id}")
async def get_execution(execution_id: str, session: Any = Depends(get_session)) -> Any:
    """Fetch a single execution by ID."""
    repo = ExecutionRepository(session)
    result = repo.get(execution_id)
    return result or {"detail": "Not found"}


@router.post("/cleanup")
async def cleanup_executions(session: Any = Depends(get_session)) -> dict[str, int]:
    """Cancel all pending/running executions."""
    repo = ExecutionRepository(session)
    count = repo.cancel_all()
    return {"cancelled": count}


@router.post("/{execution_id}/cancel")
async def cancel_execution(
    execution_id: str, session: Any = Depends(get_session)
) -> dict[str, Any]:
    """Cancel a running/pending execution by ID."""
    repo = ExecutionRepository(session)
    exe = repo.get(execution_id)
    if not exe:
        return {"detail": "Not found"}
    if exe.status not in ("completed", "failed", "cancelled"):
        exe.status = "cancelled"
        from datetime import datetime as _dt

        exe.completed_at = _dt.utcnow()
        session.add(exe)
        session.commit()
        session.refresh(exe)
        try:
            import anyio

            anyio.run(
                event_bus.emit_execution_event,
                exe.id,
                "execution_status",
                {"status": "cancelled"},
            )
        except Exception:
            pass
    return {"status": "cancelled", "execution_id": execution_id}
