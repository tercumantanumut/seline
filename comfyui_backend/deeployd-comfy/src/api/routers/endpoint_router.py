"""API Endpoint configuration router for per-workflow OpenAPI mapping."""

import typing as t
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from src.api.generator import WorkflowAPIGenerator
from src.db.database import init_db
from src.db.models import APIEndpoint
from src.db.repositories import WorkflowRepository

router = APIRouter()

db = init_db()


def get_session() -> t.Generator[Any, None, None]:
    """Yield a database session for request lifetime."""
    with db.get_session() as session:
        yield session


class ParameterConfig(BaseModel):  # type: ignore[no-any-unimported]
    """Describes a single request parameter for an endpoint."""

    name: str
    type: str
    description: str | None = None
    required: bool = False
    default: Any = None
    enum: list[Any] | None = None
    minimum: float | None = None
    maximum: float | None = None
    # Optional mapping back to workflow
    node_id: str | None = None
    input_field: str | None = None


class EndpointConfigPayload(BaseModel):  # type: ignore[no-any-unimported]
    """Payload for setting a workflow's API endpoint configuration."""

    path: str = "/generate"
    method: str = "POST"
    is_public: bool = False
    rate_limit: int | None = 100
    parameters: list[ParameterConfig] = []
    request_schema: dict[str, Any] = {}
    response_schema: dict[str, Any] = {}


@router.get("/workflows/{workflow_id}/openapi-config")
async def get_openapi_config(
    workflow_id: str, session: Any = Depends(get_session)
) -> dict[str, Any]:
    """Return stored endpoint config if any; otherwise generate defaults."""
    wrepo = WorkflowRepository(session)
    wf = wrepo.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Fetch stored endpoint (first one per workflow)
    ep = session.exec(
        select(APIEndpoint).where(APIEndpoint.workflow_id == workflow_id)
    ).first()

    if ep:
        return {
            "path": ep.path,
            "method": ep.method,
            "is_public": ep.is_public,
            "rate_limit": ep.rate_limit,
            "parameters": ep.parameters,
            "request_schema": ep.request_schema,
            "response_schema": ep.response_schema,
        }

    # Generate defaults
    gen = WorkflowAPIGenerator()
    params = gen.extract_input_parameters(wf.definition or {})
    request_schema = gen.generate_request_schema(wf.definition or {})
    response_schema = gen.generate_response_schema(wf.definition or {})
    endpoint = gen.generate_endpoint_config(wf.definition or {})

    return {
        "path": endpoint.path,
        "method": endpoint.method,
        "is_public": False,
        "rate_limit": 100,
        "parameters": [
            {
                "name": p.name,
                "type": p.type.value if hasattr(p.type, "value") else str(p.type),
                "description": p.description,
                "required": p.required,
                "default": p.default,
                "enum": p.enum,
                "minimum": p.minimum,
                "maximum": p.maximum,
            }
            for p in params
        ],
        "request_schema": {
            "properties": request_schema.properties,
            "required": request_schema.required,
        },
        "response_schema": {
            "properties": response_schema.properties,
        },
    }


@router.put("/workflows/{workflow_id}/openapi-config")
async def set_openapi_config(
    workflow_id: str,
    payload: EndpointConfigPayload,
    session: Any = Depends(get_session),
) -> dict[str, str]:
    """Persist or update an endpoint configuration for the given workflow."""
    wrepo = WorkflowRepository(session)
    wf = wrepo.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Upsert per workflow (single endpoint)
    ep = session.exec(
        select(APIEndpoint).where(APIEndpoint.workflow_id == workflow_id)
    ).first()
    if not ep:
        ep = APIEndpoint(
            workflow_id=workflow_id,
            path=payload.path,
            method=payload.method,
            parameters=[p.model_dump() for p in payload.parameters],
            request_schema=payload.request_schema,
            response_schema=payload.response_schema,
            is_public=payload.is_public,
            rate_limit=payload.rate_limit or 100,
        )
    else:
        ep.path = payload.path
        ep.method = payload.method
        ep.parameters = [p.model_dump() for p in payload.parameters]
        ep.request_schema = payload.request_schema
        ep.response_schema = payload.response_schema
        ep.is_public = payload.is_public
        ep.rate_limit = payload.rate_limit or 100

    session.add(ep)
    session.commit()
    session.refresh(ep)
    return {"status": "ok"}
