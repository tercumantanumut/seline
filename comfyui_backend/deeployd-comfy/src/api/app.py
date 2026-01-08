"""FastAPI application for ComfyUI workflow API."""

import asyncio
import logging
import time
import typing as t
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from src.api import event_bus
from src.api.exceptions import APIError
from src.api.openapi_generator import OpenAPIGenerator
from src.api.routers import (
    container_router,
    endpoint_router,
    execution_router,
    model_router,
    workflow_router,
)
from src.api.websocket_manager import WebSocketManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Track app start time
APP_START_TIME = datetime.now()


class APISettings(BaseModel):  # type: ignore[no-any-unimported]
    """API configuration settings."""

    api_prefix: str = "/api/v1"
    debug: bool = False
    max_request_size: int = 10 * 1024 * 1024  # 10MB
    rate_limit: int = 100  # requests per minute
    allowed_origins: list[str] = Field(default_factory=lambda: ["*"])
    enable_compression: bool = True
    enable_cors: bool = True


def get_app_settings() -> APISettings:
    """Get application settings.

    Returns:
        APISettings instance
    """
    return APISettings()


@asynccontextmanager
async def lifespan(app: t.Any) -> AsyncGenerator[None, None]:  # noqa: ARG001
    """Application lifespan manager.

    Args:
        app: FastAPI application (required by FastAPI)
    """
    # Startup
    logger.info("Starting ComfyUI Workflow API...")
    logger.info(f"Debug mode: {get_app_settings().debug}")
    yield
    # Shutdown
    logger.info("Shutting down ComfyUI Workflow API...")


def create_app() -> t.Any:
    """Create and configure FastAPI application.

    Returns:
        Configured FastAPI application
    """
    settings = get_app_settings()

    app = FastAPI(
        title="ComfyUI Workflow API",
        version="1.0.0",
        description="API for ComfyUI workflow to container translation",
        lifespan=lifespan,
        debug=settings.debug,
    )

    # Add CORS middleware
    if settings.enable_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Add compression middleware
    if settings.enable_compression:
        app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Add custom middleware
    @app.middleware("http")
    async def add_process_time_header(request: t.Any, call_next: t.Callable) -> t.Any:
        """Add process time header to responses."""
        start_time = time.time()
        request_id = str(uuid.uuid4())

        # Add request ID to request state
        request.state.request_id = request_id

        response = await call_next(request)

        # Add headers
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        response.headers["X-Request-ID"] = request_id

        return response

    # Exception handlers
    @app.exception_handler(APIError)
    async def api_error_handler(request: t.Any, exc: t.Any) -> t.Any:  # noqa: ARG001
        """Handle API errors."""
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(ValueError)
    async def value_error_handler(request: t.Any, exc: ValueError) -> t.Any:  # noqa: ARG001
        """Handle value errors."""
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    # Health check endpoint
    @app.get("/health")
    async def health_check() -> dict[str, t.Any]:
        """Health check endpoint."""
        uptime = (datetime.now() - APP_START_TIME).total_seconds()
        return {"status": "healthy", "version": "1.0.0", "uptime": uptime}

    # API info endpoint
    @app.get(f"{settings.api_prefix}/info")
    async def api_info() -> dict[str, t.Any]:
        """Get API information."""
        return {
            "name": "ComfyUI Workflow API",
            "version": "1.0.0",
            "description": "API for ComfyUI workflow to container translation",
            "workflows_loaded": 0,  # Will be updated when workflows are loaded
        }

    # Instantiate WebSocket manager and attach to event bus
    ws_manager = WebSocketManager(max_connections=100)
    app.state.ws_manager = ws_manager
    event_bus.set_manager(ws_manager)

    # WebSocket endpoint supporting rooms (e.g., room=build:{id})
    @app.websocket("/ws/{client_id}")
    async def ws_endpoint(websocket: t.Any, client_id: str) -> None:
        params = dict(websocket.query_params)
        room = params.get("room")
        # connect and keep alive
        accepted = await ws_manager.connect(websocket, client_id=client_id, room=room)
        if not accepted:
            return
        try:
            while True:
                # Await client messages (optional)
                msg = await websocket.receive_json()
                await ws_manager.handle_client_message(client_id, msg)
        except WebSocketDisconnect:
            await ws_manager.disconnect(client_id)

    # OpenAPI spec endpoint
    @app.get(f"{settings.api_prefix}/openapi.json")
    async def get_openapi_spec() -> dict[str, t.Any]:
        """Get OpenAPI specification."""
        generator = OpenAPIGenerator(app)

        # Load workflows if available
        workflows: dict[str, dict[str, t.Any]] = {}
        # TODO: Load actual workflows from configuration or database

        spec = generator.generate_full_spec(
            title="ComfyUI Workflow API", version="1.0.0", workflows=workflows
        )

        return spec

    # Minimal WebSocket endpoint (stub) to satisfy clients connecting to ws://host/ws/{id}
    @app.websocket("/ws/{client_id}")
    async def ws_stub(websocket: t.Any, client_id: str) -> None:  # noqa: ARG001
        await websocket.accept()
        try:
            # Keep connection alive with occasional heartbeat
            while True:
                await websocket.send_json({"type": "heartbeat", "ts": time.time()})
                await asyncio.sleep(30)
        except WebSocketDisconnect:
            pass

    # Register routers
    app.include_router(
        workflow_router.router,
        prefix=f"{settings.api_prefix}/workflows",
        tags=["workflows"],
    )

    app.include_router(
        container_router.router,
        prefix=f"{settings.api_prefix}/containers",
        tags=["containers"],
    )

    app.include_router(
        execution_router.router,
        prefix=f"{settings.api_prefix}/executions",
        tags=["executions"],
    )

    app.include_router(
        model_router.router, prefix=f"{settings.api_prefix}/models", tags=["models"]
    )

    app.include_router(
        endpoint_router.router,
        prefix=f"{settings.api_prefix}",
        tags=["openapi"],
    )

    return app


# Create default app instance
app = create_app()
