"""Workflow API router with database integration."""

import json
import typing as t
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException
from pydantic import BaseModel

from src.api.exceptions import InvalidWorkflowError, WorkflowNotFoundError
from src.api.generator import WorkflowAPIGenerator
from src.db.database import init_db
from src.db.repositories import WorkflowRepository
from src.workflows.dependencies import DependencyExtractor
from src.workflows.node_resolver import ComfyUIJsonResolver
from src.workflows.parser import WorkflowParser
from src.workflows.validator import WorkflowValidator

router = APIRouter()

# Initialize database
db = init_db()


def get_session() -> t.Generator[Any, None, None]:
    """Get database session."""
    with db.get_session() as session:
        yield session


class WorkflowResponse(BaseModel):  # type: ignore[no-any-unimported]
    """Workflow response model."""

    id: str
    name: str
    description: str | None
    definition: dict
    dependencies: dict
    parameters: list[dict]
    version: int
    created_at: str
    updated_at: str


@router.post("/", response_model=WorkflowResponse)
async def create_workflow(
    file: Any = File(...),
    name: str | None = None,
    description: str | None = None,
    session: Any = Depends(get_session),
) -> WorkflowResponse:
    """Create a new workflow from uploaded file.

    Args:
        file: Uploaded workflow JSON file
        name: Optional workflow name
        description: Optional workflow description

    Returns:
        Created workflow
    """
    if not file.filename.endswith(".json"):
        raise InvalidWorkflowError("File must be a JSON file")

    # Read and parse workflow
    content = await file.read()
    try:
        workflow_data = json.loads(content)
    except json.JSONDecodeError as e:
        raise InvalidWorkflowError(f"Invalid JSON: {e}") from e

    # Extract name from filename if not provided
    if not name:
        name = Path(file.filename).stem

    # Parse and validate workflow
    parser = WorkflowParser()
    try:
        parser.parse(workflow_data)
    except Exception as e:
        raise InvalidWorkflowError(f"Invalid workflow: {e}") from e

    # Extract dependencies
    extractor = DependencyExtractor()
    dependencies = extractor.extract_all(workflow_data)

    # Convert sets to lists for JSON serialization
    if isinstance(dependencies.get("custom_nodes"), set):
        dependencies["custom_nodes"] = list(dependencies["custom_nodes"])
    if isinstance(dependencies.get("python_packages"), set):
        dependencies["python_packages"] = list(dependencies["python_packages"])
    for key in dependencies.get("models", {}):
        if isinstance(dependencies["models"][key], set):
            dependencies["models"][key] = list(dependencies["models"][key])

    # Extract parameters
    api_generator = WorkflowAPIGenerator()
    parameters = api_generator.extract_input_parameters(workflow_data)
    param_dicts = [
        {
            "name": p.name,
            "type": p.type.value if hasattr(p.type, "value") else str(p.type),
            "default": p.default,
            "required": p.required,
            "description": p.description,
        }
        for p in parameters
    ]

    # Save to database
    repo = WorkflowRepository(session)
    workflow = repo.create(
        name=name,
        definition=workflow_data,
        dependencies=dependencies,
        parameters=param_dicts,
        description=description,
    )

    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        definition=workflow.definition,
        dependencies=workflow.dependencies,
        parameters=workflow.parameters,
        version=workflow.version,
        created_at=workflow.created_at.isoformat() if workflow.created_at else "",
        updated_at=workflow.updated_at.isoformat() if workflow.updated_at else "",
    )


@router.post("/validate")
async def validate_workflow(file: Any = File(...)) -> dict[str, t.Any]:
    """Validate an uploaded workflow without saving it.

    Returns validation status, errors, warnings, dependencies and parameters.
    """
    if not file.filename.endswith(".json"):
        raise InvalidWorkflowError("File must be a JSON file")

    content = await file.read()
    try:
        workflow_data = json.loads(content)
    except json.JSONDecodeError as e:
        return {"valid": False, "errors": [f"Invalid JSON: {e}"], "warnings": []}

    errors: list[str] = []
    warnings: list[str] = []

    # Parse and validate
    parser = WorkflowParser()
    try:
        parser.parse(workflow_data)
    except Exception as e:
        errors.append(f"Invalid workflow: {e}")

    validator = WorkflowValidator()
    result = validator.validate(workflow_data)
    if not result.is_valid:
        errors.extend(result.errors)
    if result.warnings:
        warnings.extend(result.warnings)

    extractor = DependencyExtractor()
    dependencies = extractor.extract_all(workflow_data)
    # Normalize sets to lists
    if isinstance(dependencies.get("custom_nodes"), set):
        dependencies["custom_nodes"] = list(dependencies["custom_nodes"])
    if isinstance(dependencies.get("python_packages"), set):
        dependencies["python_packages"] = list(dependencies["python_packages"])
    for key in dependencies.get("models", {}):
        if isinstance(dependencies["models"][key], set):
            dependencies["models"][key] = list(dependencies["models"][key])

    api_generator = WorkflowAPIGenerator()
    parameters = api_generator.extract_input_parameters(workflow_data)
    param_dicts = [
        {
            "name": p.name,
            "type": p.type.value if hasattr(p.type, "value") else str(p.type),
            "default": p.default,
            "required": p.required,
            "description": p.description,
        }
        for p in parameters
    ]

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "dependencies": dependencies,
        "parameters": param_dicts,
    }


class ResolveNodesRequest(BaseModel):  # type: ignore[no-any-unimported]
    """Optional overrides for node class -> repo URL when resolving."""

    manual_repos: dict[str, str] | None = None


@router.post("/{workflow_id}/resolve_nodes")
async def resolve_nodes(
    workflow_id: str,
    body: ResolveNodesRequest | None = None,
    session: Any = Depends(get_session),
) -> list[dict[str, t.Any]]:
    """Resolve custom nodes for a workflow using the same strategy as CLI."""
    repo = WorkflowRepository(session)
    wf = repo.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    # Resolve via comfyui-json (authoritative), including injected extensions
    resolver = ComfyUIJsonResolver()
    # Write workflow to a temp file for the Node bridge
    import json as _json
    import tempfile

    try:
        with tempfile.NamedTemporaryFile(
            mode="w+", suffix=".json", delete=False
        ) as tmp:
            _json.dump(wf.definition or {}, tmp)
            tmp.flush()
            data = resolver.get_comprehensive_resolution(Path(tmp.name))
    except Exception as err:
        # Strict behavior: comfyui-json is required; surface precise error to the client
        raise HTTPException(
            status_code=502, detail=f"comfyui-json resolution failed: {err}"
        ) from err

    # Apply manual overrides (merge/override url entries by url)
    nodes = data.get("custom_nodes", {})
    manual = body.manual_repos if body and body.manual_repos else {}
    # Manual repos keyed by class name -> turn into url entries
    for _class, url in manual.items():
        nodes[url] = {
            "url": url,
            "name": _class,
            "hash": None,
            "pip": [],
            "files": [],
            "install_type": "git-clone",
            "warning": "manual override",
        }

    # Return compact list for UI
    out = []
    for url, info in nodes.items():
        out.append(
            {
                "name": info.get("name") or url.rsplit("/", 1)[-1],
                "repository": url,
                "commit": info.get("hash"),
                "pip": info.get("pip", []),
            }
        )
    return out


@router.get("/", response_model=list[WorkflowResponse])
async def list_workflows(
    limit: int = 100,
    offset: int = 0,
    name_filter: str | None = None,
    session: Any = Depends(get_session),
) -> list[WorkflowResponse]:
    """List all workflows.

    Args:
        limit: Maximum number of results
        offset: Number of results to skip
        name_filter: Optional name filter

    Returns:
        List of workflows
    """
    repo = WorkflowRepository(session)
    workflows = repo.list(limit=limit, offset=offset, name_filter=name_filter)

    return [
        WorkflowResponse(
            id=w.id,
            name=w.name,
            description=w.description,
            definition=w.definition,
            dependencies=w.dependencies,
            parameters=w.parameters,
            version=w.version,
            created_at=w.created_at.isoformat() if w.created_at else "",
            updated_at=w.updated_at.isoformat() if w.updated_at else "",
        )
        for w in workflows
    ]


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str, session: Any = Depends(get_session)
) -> WorkflowResponse:
    """Get workflow by ID.

    Args:
        workflow_id: Workflow identifier

    Returns:
        Workflow data
    """
    repo = WorkflowRepository(session)
    workflow = repo.get(workflow_id)

    if not workflow:
        raise WorkflowNotFoundError(workflow_id)

    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        definition=workflow.definition,
        dependencies=workflow.dependencies,
        parameters=workflow.parameters,
        version=workflow.version,
        created_at=workflow.created_at.isoformat() if workflow.created_at else "",
        updated_at=workflow.updated_at.isoformat() if workflow.updated_at else "",
    )


@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str, session: Any = Depends(get_session)
) -> dict[str, str]:
    """Delete workflow by ID.

    Args:
        workflow_id: Workflow identifier

    Returns:
        Deletion status
    """
    repo = WorkflowRepository(session)
    deleted = repo.delete(workflow_id)

    if not deleted:
        raise WorkflowNotFoundError(workflow_id)

    return {"status": "deleted", "workflow_id": workflow_id}
