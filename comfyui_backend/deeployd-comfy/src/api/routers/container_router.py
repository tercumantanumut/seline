"""Container API router with build tracking endpoints."""

import json
import tempfile
import threading
import typing as t
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

try:  # pydantic v2
    from pydantic import ConfigDict as _ConfigDict
except Exception:  # pragma: no cover
    _ConfigDict = None

from src.api import event_bus
from src.containers.custom_node_installer import NodeMetadata
from src.containers.docker_manager import DockerBuildError, DockerManager
from src.containers.dockerfile_builder import DockerfileBuilder
from src.db.database import init_db
from src.db.repositories import BuildRepository, WorkflowRepository

router = APIRouter()

# Initialize database
db = init_db()


def get_session() -> t.Generator[Any, None, None]:
    """Yield a database session for request lifetime."""
    with db.get_session() as session:
        yield session


class ManualNode(BaseModel):  # type: ignore[no-any-unimported]
    """Manual custom node definition for inclusion during build."""

    name: str
    repository: str
    commit: str | None = None


class BuildCreateRequest(BaseModel):  # type: ignore[no-any-unimported]
    """Payload to initiate a container build for a workflow."""

    # Allow fields starting with `model_` (e.g., model_assets)
    # Pydantic v2 uses model_config to control protected namespaces
    model_config = _ConfigDict(protected_namespaces=()) if _ConfigDict else None
    workflow_id: str
    image_name: str | None = None
    tag: str = "latest"
    no_cache: bool = False
    python_version: str | None = None  # e.g., "3.11", "3.12", "3.13"
    runtime_mode: str | None = None  # 'cpu' | 'gpu'
    torch_version: str | None = None  # e.g., '2.7.1'
    cuda_variant: str | None = None  # e.g., 'cu118','cu121','cu124','cu126','cu128'
    install_nunchaku: bool | None = None
    nunchaku_version: str | None = None
    nunchaku_wheel_url: str | None = None
    manual_repos: dict[str, str] | None = None  # name -> repo override
    manual_nodes: list[ManualNode] | None = None  # extra nodes to include
    model_assets: list[dict[str, Any]] | None = None  # {type, filename, url}
    # Accelerator options (optional)
    safe_mode: bool | None = None  # when True, disables accelerators even on GPU
    accelerators: list[str] | None = None  # e.g., ["xformers","triton","flash","sage"]
    compile_fallback: bool | None = (
        None  # allow compile fallback for unsupported combos
    )


@router.post("/builds")
async def create_build(
    request: BuildCreateRequest,
    session: Any = Depends(get_session),
) -> Any:
    """Create a build record for a workflow."""
    repo = BuildRepository(session)
    image_name = request.image_name or "comfyui-workflow"
    build = repo.create_build(
        workflow_id=request.workflow_id,
        image_name=image_name,
        tag=request.tag,
    )
    # Start real Docker build in background
    thread = threading.Thread(
        target=_run_docker_build,
        args=(
            build.id,
            request.workflow_id,
            image_name,
            request.tag,
            request.no_cache,
            request.python_version,
            request.runtime_mode,
            request.torch_version,
            request.cuda_variant,
            bool(request.install_nunchaku or False),
            request.nunchaku_version,
            request.nunchaku_wheel_url,
            request.manual_repos or {},
            request.manual_nodes or [],
            request.model_assets or [],
            request.safe_mode,
            request.accelerators,
            request.compile_fallback,
        ),
        daemon=True,
    )
    thread.start()
    return build


@router.get("/builds")
async def list_builds(
    limit: int = Query(default=25, ge=1, le=200),
    workflow_id: str | None = None,
    session: Any = Depends(get_session),
) -> Any:
    """List recent builds."""
    repo = BuildRepository(session)
    return repo.get_build_history(workflow_id=workflow_id, limit=limit)


@router.get("/builds/{build_id}")
async def get_build(build_id: str, session: Any = Depends(get_session)) -> Any:
    """Get build by id (direct lookup)."""
    repo = BuildRepository(session)
    b = repo.get_by_id(build_id)
    if not b:
        raise HTTPException(status_code=404, detail="Build not found")
    return b


@router.get("/builds/{build_id}/logs")
async def get_build_logs(
    build_id: str,
    since: int | None = Query(
        default=None, description="Return lines with seq > since"
    ),
    limit: int = Query(default=200, ge=1, le=1000),
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    """Get incremental build logs by id."""
    repo = BuildRepository(session)
    logs = repo.get_build_logs(build_id, since=since, limit=limit)
    return {
        "build_id": build_id,
        "logs": [
            {
                "seq": log.seq,
                "line": log.line,
                "created_at": (
                    None if (log.created_at is None) else log.created_at.isoformat()
                ),
            }
            for log in logs
        ],
        "next_since": logs[-1].seq if logs else (since or 0),
    }


@router.post("/builds/{build_id}/cancel")
async def cancel_build(build_id: str, session: Any = Depends(get_session)) -> Any:
    """Cancel a running or pending build."""
    repo = BuildRepository(session)
    builds = repo.get_build_history(limit=500)
    for b in builds:
        if b.id == build_id:
            status = b.build_status
            if status not in ("success", "failed"):
                repo.update_build_status(
                    build_id,
                    status="failed",
                    logs=(b.build_logs or "") + "\nCANCELLED: Build cancelled by user",
                )
            return repo.get_by_id(build_id)
    raise HTTPException(status_code=404, detail="Build not found")


@router.get("/images")
async def list_images() -> dict[str, Any]:
    """List images from the registry (placeholder)."""
    return {"images": [], "total": 0}


@router.delete("/images/{image_id}")
async def delete_image(image_id: str) -> dict[str, Any]:
    """Delete an image by ID (placeholder)."""
    return {"status": "deleted", "image_id": image_id}


@router.post("/builds/cleanup")
async def cleanup_builds(session: Any = Depends(get_session)) -> dict[str, int]:
    """Mark all non-terminal builds as failed and clear them from active view."""
    repo = BuildRepository(session)
    count = repo.cleanup_incomplete()
    return {"cleaned": count}


def _run_docker_build(
    build_id: str,
    workflow_id: str,
    image_name: str,
    tag: str,
    no_cache: bool = False,
    python_version: str | None = None,
    runtime_mode: str | None = None,
    torch_version: str | None = None,
    cuda_variant: str | None = None,
    install_nunchaku: bool = False,
    nunchaku_version: str | None = None,
    nunchaku_wheel_url: str | None = None,
    manual_repos: dict[str, str] | None = None,
    manual_nodes: list[ManualNode] | None = None,
    model_assets: list[dict[str, Any]] | None = None,
    safe_mode: bool | None = None,
    accelerators: list[str] | None = None,
    compile_fallback: bool | None = None,
) -> None:
    """Run a real Docker build and stream logs to DB and WS."""
    local_db = init_db()
    docker_manager = DockerManager()
    full_tag = f"{image_name}:{tag}"

    # Mark as building
    with local_db.get_session() as session:
        BuildRepository(session).update_build_status(
            build_id, status="building", logs="Starting build..."
        )
    try:
        import anyio

        anyio.run(
            event_bus.emit_build_event, build_id, "build_status", {"status": "building"}
        )
    except Exception:
        pass

    # Check Docker availability
    if not docker_manager.is_available():
        with local_db.get_session() as session:
            BuildRepository(session).update_build_status(
                build_id, status="failed", logs="ERROR: Docker daemon not available"
            )
        try:
            import anyio

            anyio.run(
                event_bus.emit_build_event,
                build_id,
                "build_complete",
                {"status": "failed"},
            )
        except Exception:
            pass
        return

    # Prepare temp build context and Dockerfile
    with local_db.get_session() as session:
        wrepo = WorkflowRepository(session)
        wf = wrepo.get(workflow_id)
        if not wf:
            with local_db.get_session() as s2:
                BuildRepository(s2).update_build_status(
                    build_id, status="failed", logs="Workflow not found"
                )
            return

    tmp_dir = Path(tempfile.mkdtemp(prefix="build_ctx_"))
    dockerfile_path = tmp_dir / "Dockerfile"

    builder = DockerfileBuilder()
    # Choose base image based on runtime mode
    # Validate Python version
    valid_versions = {"3.10", "3.11", "3.12", "3.13"}
    effective_python_version = (
        python_version if python_version in valid_versions else "3.12"
    )

    # For GPU mode, use CUDA image; for CPU mode, use python slim
    if str(runtime_mode).lower() == "gpu":
        # Use devel image when Nunchaku is enabled (requires CUDA dev libraries)
        if install_nunchaku:
            base_image = "nvidia/cuda:12.8.0-devel-ubuntu22.04"
        else:
            base_image = "nvidia/cuda:12.8.0-runtime-ubuntu22.04"
    else:
        base_image = f"python:{effective_python_version}-slim"
    # Resolve custom nodes via comfyui-json (authoritative), including injected extensions
    deps = wf.dependencies or {}
    resolved_nodes = []
    try:
        from src.workflows.node_resolver import ComfyUIJsonResolver

        cache_dir = tmp_dir / ".cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        # Write workflow to disk for resolver
        wf_path = tmp_dir / "workflow.json"
        wf_path.write_text(json.dumps(wf.definition or {}))
        data = ComfyUIJsonResolver(cache_dir=cache_dir).get_comprehensive_resolution(
            wf_path
        )
        nodes = data.get("custom_nodes", {})
        # Apply manual overrides
        for k, v in (manual_repos or {}).items():
            nodes[v] = {
                "url": v,
                "name": k,
                "hash": None,
                "pip": [],
                "install_type": "git-clone",
            }

        # Convert to simple metadata objects (name/repository/commit/pip)
        for url, info in nodes.items():
            resolved_nodes.append(
                NodeMetadata(
                    name=(info.get("name") or url.rstrip("/").split("/")[-1]),
                    repository=url,
                    commit_hash=info.get("hash"),
                    python_dependencies=info.get("pip", []),
                )
            )
        # Persist resolved nodes for audit
        with local_db.get_session() as session:
            BuildRepository(session).set_resolved_nodes(
                build_id,
                [
                    {
                        "name": n.name,
                        "repository": n.repository,
                        "commit": n.commit_hash,
                        "pip": n.python_dependencies,
                    }
                    for n in resolved_nodes
                ],
            )
    except Exception as e:
        # Proceed without resolved nodes if resolution fails
        try:
            import anyio

            anyio.run(
                event_bus.emit_build_event,
                build_id,
                "build_log",
                {"line": f"Warning: comfyui-json resolution failed: {e}"},
            )
        except Exception:
            pass

    # Build manual NodeMetadata list
    extra_nodes: list[Any] = []
    for mn in manual_nodes or []:
        if not mn.repository:
            continue
        name = mn.name or mn.repository.rstrip("/").split("/")[-1].replace(".git", "")
        extra_nodes.append(
            NodeMetadata(name=name, repository=mn.repository, commit_hash=mn.commit)
        )
    # Append extra nodes to resolved
    if extra_nodes:
        resolved_nodes = (resolved_nodes or []) + extra_nodes
        # Update persisted list to include extras as well
        with local_db.get_session() as session:
            BuildRepository(session).set_resolved_nodes(
                build_id,
                [
                    {
                        "name": n.name,
                        "repository": n.repository,
                        "commit": n.commit_hash,
                        "pip": getattr(n, "python_dependencies", []),
                    }
                    for n in resolved_nodes
                ],
            )

    # Generate Dockerfile: include resolved custom nodes and model downloads
    try:
        # Enable accelerators when GPU and not explicitly in safe mode
        enable_acc = (str(runtime_mode).lower() == "gpu") and not bool(safe_mode)
        # Use requested accelerator list or default lite set
        accel_set = (
            accelerators
            if (enable_acc and accelerators)
            else (["xformers", "triton", "flash", "sage"] if enable_acc else [])
        )
        # Lock to supported matrix if accelerators are enabled
        eff_python = effective_python_version
        eff_torch = torch_version
        eff_cuda = cuda_variant
        if enable_acc:
            try:
                from src.containers.accelerator_manager import AcceleratorManager

                plan = AcceleratorManager().resolve(
                    python_version=effective_python_version,
                    torch_version=torch_version,
                    cuda_variant=cuda_variant,
                    accelerators=accel_set,
                )
                if not plan.supported:
                    eff_torch = "2.8.0"
                    eff_cuda = "cu129"
                    # Don't force Python version - trust auto-detection
            except Exception:
                pass
        # Note: base_image already set above based on runtime_mode

        dockerfile_content = builder.build_for_workflow(
            dependencies=deps,
            custom_nodes=resolved_nodes if resolved_nodes else None,
            base_image=base_image,
            use_cuda=(str(runtime_mode).lower() == "gpu"),
            torch_version=eff_torch,
            cuda_variant=eff_cuda,
            python_version=eff_python,
            enable_accelerators=enable_acc,
            accelerators=accel_set,
            compile_fallback=bool(compile_fallback)
            if compile_fallback is not None
            else True,
            enable_nunchaku=install_nunchaku,
            nunchaku_version=nunchaku_version,
            nunchaku_wheel_url=nunchaku_wheel_url,
            extra_commands=builder.add_model_url_downloads(model_assets or []),
        )
        dockerfile_path.write_text(dockerfile_content)
    except Exception as e:
        # Fail fast if Dockerfile generation fails
        with local_db.get_session() as session:
            BuildRepository(session).update_build_status(
                build_id, status="failed", logs=f"ERROR generating Dockerfile: {e}"
            )
        try:
            import anyio

            anyio.run(
                event_bus.emit_build_event,
                build_id,
                "build_complete",
                {"status": "failed"},
            )
        except Exception:
            pass
        return

    # Stream logs
    try:
        for chunk in docker_manager.stream_build(
            dockerfile_path=str(dockerfile_path),
            context_path=str(tmp_dir),
            tag=full_tag,
            use_cache=not no_cache,
        ):
            # chunks are decoded dicts from Docker build API
            line = chunk.get("stream") or chunk.get("status") or ""
            line = line.rstrip("\n")
            if not line:
                continue
            with local_db.get_session() as session:
                BuildRepository(session).append_build_log(build_id, line)
            try:
                import anyio

                anyio.run(
                    event_bus.emit_build_event, build_id, "build_log", {"line": line}
                )
            except Exception:
                pass

        # Success
        size = docker_manager.get_image_size(full_tag)
        with local_db.get_session() as session:
            BuildRepository(session).update_build_status(
                build_id,
                status="success",
                logs="Build completed successfully",
                image_size=size,
            )
        try:
            import anyio

            anyio.run(
                event_bus.emit_build_event,
                build_id,
                "build_complete",
                {"status": "success"},
            )
        except Exception:
            pass
    except DockerBuildError as e:
        with local_db.get_session() as session:
            BuildRepository(session).update_build_status(
                build_id, status="failed", logs=f"ERROR: {e}"
            )
        try:
            import anyio

            anyio.run(
                event_bus.emit_build_event,
                build_id,
                "build_complete",
                {"status": "failed"},
            )
        except Exception:
            pass


class VerifyNodesRequest(BaseModel):  # type: ignore[no-any-unimported]
    """Request model for verifying custom nodes installation."""

    nodes: list[str] | None = None  # names of directories or repos to look for


@router.post("/builds/{build_id}/verify_nodes")
async def verify_custom_nodes(
    build_id: str,
    request: VerifyNodesRequest | None = None,
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    """Run a short container to list /app/ComfyUI/custom_nodes and verify presence.

    Body can include {"nodes": ["ComfyUI-KJNodes", "ComfyUI_IPAdapter_plus", "ComfyUI-GGUF"]}
    If omitted, attempts to derive expected nodes from stored workflow dependencies.
    """
    repo = BuildRepository(session)
    build = repo.get_by_id(build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    image = f"{build.image_name}:{build.tag}"

    # Derive default expected nodes from workflow dependencies
    expect: set[str] = set()
    if not request or not request.nodes:
        wrepo = WorkflowRepository(session)
        wf = wrepo.get(build.workflow_id)
        deps = (wf.dependencies or {}) if wf else {}
        for item in deps.get("custom_nodes", []) or []:
            if isinstance(item, dict):
                # Try repository or class_type
                url = item.get("repository") or ""
                if url:
                    expect.add(url.rstrip("/").split("/")[-1].replace(".git", ""))
                elif item.get("class_type"):
                    expect.add(
                        str(item["class_type"]).replace("|", "_").replace(" ", "_")
                    )
            elif isinstance(item, str):
                expect.add(item.replace("|", "_").replace(" ", "_"))
    else:
        expect = set(request.nodes)

    # Run a lightweight container to list custom_nodes directory
    try:
        import docker

        client = docker.from_env()
        cmd = (
            "python - <<'PY'\n"
            "import os, json; d='/app/ComfyUI/custom_nodes';\n"
            "print(json.dumps(sorted([x for x in os.listdir(d) if os.path.isdir(os.path.join(d,x))])))\n"
            "PY"
        )
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

        output: bytes = client.containers.run(
            image=image,
            command=["bash", "-lc", cmd],
            remove=True,
            device_requests=device_requests,
        )
        listing = json.loads(output.decode().strip() or "[]")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Verification container error: {e}"
        ) from e

    listing_set = set(listing)
    present = sorted(
        [
            name
            for name in expect
            if any(name in entry or entry in name for entry in listing_set)
        ]
    )
    missing = sorted(expect.difference(set(present)))

    return {
        "image": image,
        "custom_nodes_dir": listing,
        "expected": sorted(expect),
        "present": present,
        "missing": missing,
        "ok": len(missing) == 0,
    }
