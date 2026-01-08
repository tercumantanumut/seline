"""SQLModel database models for ComfyUI workflow management."""

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, String, func
from sqlmodel import JSON, Column, Field, SQLModel


def generate_uuid() -> str:
    """Generate a UUID string."""
    return str(uuid4())


class WorkflowBase(SQLModel):
    """Base workflow model with common fields."""

    name: str = Field(index=True, description="Workflow name")
    description: str | None = Field(default=None, description="Workflow description")
    definition: dict[str, Any] = Field(
        default={},
        sa_column=Column(JSON),
        description="Complete workflow JSON definition",
    )
    dependencies: dict[str, Any] = Field(
        default={},
        sa_column=Column(JSON),
        description="Extracted dependencies (models, custom nodes, etc)",
    )
    parameters: list[dict[str, Any]] = Field(
        default=[], sa_column=Column(JSON), description="Extracted API parameters"
    )


class Workflow(WorkflowBase, table=True):
    """Workflow model for database storage."""

    __tablename__ = "workflows"

    id: str = Field(
        default_factory=generate_uuid,
        primary_key=True,
        description="Unique workflow ID",
    )
    version: int = Field(default=1, description="Workflow version number")
    comfyui_version: str | None = Field(default=None, description="ComfyUI version")
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
        description="Creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
        ),
        description="Last update timestamp",
    )


class WorkflowVersion(SQLModel, table=True):
    """Tracks workflow version history."""

    __tablename__ = "workflow_versions"

    id: str = Field(
        default_factory=generate_uuid, primary_key=True, description="Version ID"
    )
    workflow_id: str = Field(
        foreign_key="workflows.id", index=True, description="Parent workflow ID"
    )
    version: int = Field(description="Version number")
    commit_hash: str = Field(
        sa_column=Column(String(40)), description="Git-like commit hash"
    )
    parent_hash: str | None = Field(
        default=None, sa_column=Column(String(40)), description="Parent version hash"
    )
    changes: dict[str, Any] = Field(
        default={}, sa_column=Column(JSON), description="Changes from parent version"
    )
    message: str | None = Field(default=None, description="Version commit message")
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
        description="Version creation time",
    )


class ContainerBuild(SQLModel, table=True):
    """Tracks Docker container builds."""

    __tablename__ = "container_builds"

    id: str = Field(
        default_factory=generate_uuid, primary_key=True, description="Build ID"
    )
    workflow_id: str = Field(
        foreign_key="workflows.id", index=True, description="Associated workflow"
    )
    image_name: str = Field(description="Docker image name")
    tag: str = Field(description="Docker image tag")
    registry_url: str | None = Field(default=None, description="Container registry URL")
    build_status: str = Field(
        default="pending",
        description="Build status: pending, building, success, failed",
    )
    dockerfile: str | None = Field(
        default=None, description="Generated Dockerfile content"
    )
    build_logs: str | None = Field(default=None, description="Build output logs")
    resolved_nodes: list[dict[str, Any]] = Field(
        default=[],
        sa_column=Column(JSON),
        description="Resolved custom nodes used in build",
    )
    image_size: int | None = Field(default=None, description="Image size in bytes")
    build_duration: float | None = Field(
        default=None, description="Build time in seconds"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
        description="Build start time",
    )
    completed_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True)),
        description="Build completion time",
    )


class CustomNode(SQLModel, table=True):
    """Registry of custom ComfyUI nodes."""

    __tablename__ = "custom_nodes"

    id: str = Field(
        default_factory=generate_uuid, primary_key=True, description="Node registry ID"
    )
    repository_url: str = Field(index=True, description="Git repository URL")
    commit_hash: str = Field(
        sa_column=Column(String(40)), description="Git commit hash"
    )
    node_types: list[str] = Field(
        default=[],
        sa_column=Column(JSON),
        description="List of node class types provided",
    )
    python_dependencies: list[str] = Field(
        default=[], sa_column=Column(JSON), description="Required Python packages"
    )
    compatible_comfyui_versions: list[str] = Field(
        default=[], sa_column=Column(JSON), description="Compatible ComfyUI versions"
    )
    verified: bool = Field(
        default=False, description="Whether nodes have been verified to work"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
        description="Registry entry creation time",
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
        ),
        description="Last update time",
    )


class APIEndpoint(SQLModel, table=True):
    """Stores API endpoint configurations for workflows."""

    __tablename__ = "api_endpoints"

    id: str = Field(
        default_factory=generate_uuid, primary_key=True, description="Endpoint ID"
    )
    workflow_id: str = Field(
        foreign_key="workflows.id", index=True, description="Associated workflow"
    )
    path: str = Field(unique=True, index=True, description="API endpoint path")
    method: str = Field(default="POST", description="HTTP method")
    parameters: list[dict[str, Any]] = Field(
        default=[], sa_column=Column(JSON), description="Endpoint parameters schema"
    )
    request_schema: dict[str, Any] = Field(
        default={}, sa_column=Column(JSON), description="OpenAPI request schema"
    )
    response_schema: dict[str, Any] = Field(
        default={}, sa_column=Column(JSON), description="OpenAPI response schema"
    )
    rate_limit: int | None = Field(default=100, description="Requests per minute limit")
    is_public: bool = Field(
        default=False, description="Whether endpoint is publicly accessible"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
        description="Endpoint creation time",
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
        ),
        description="Last update time",
    )


class WorkflowExecution(SQLModel, table=True):
    """Tracks workflow execution history."""

    __tablename__ = "workflow_executions"

    id: str = Field(
        default_factory=generate_uuid, primary_key=True, description="Execution ID"
    )
    workflow_id: str = Field(
        foreign_key="workflows.id", index=True, description="Executed workflow"
    )
    prompt_id: str = Field(index=True, description="ComfyUI prompt ID")
    status: str = Field(
        default="pending",
        index=True,
        description="Execution status: pending, running, completed, failed",
    )
    input_parameters: dict[str, Any] = Field(
        default={}, sa_column=Column(JSON), description="Input parameters used"
    )
    output_files: list[str] = Field(
        default=[], sa_column=Column(JSON), description="Generated output files"
    )
    error_message: str | None = Field(
        default=None, description="Error message if failed"
    )
    execution_time: float | None = Field(
        default=None, description="Total execution time in seconds"
    )
    started_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
        description="Execution start time",
    )
    completed_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True)),
        description="Execution completion time",
    )


class BuildLog(SQLModel, table=True):
    """Stores build log lines with sequence for streaming."""

    __tablename__ = "build_logs"

    id: str = Field(default_factory=generate_uuid, primary_key=True)
    build_id: str = Field(foreign_key="container_builds.id", index=True)
    seq: int = Field(index=True, description="Monotonic sequence per build")
    line: str = Field(description="Log line text")
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
        description="Log timestamp",
    )
