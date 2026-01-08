"""OpenAPI schema generator for ComfyUI workflows."""

import json
from pathlib import Path
from typing import Any

from src.api.generator import (
    ParameterType,
    WorkflowAPIGenerator,
)


class OpenAPIGenerator:
    """Generate OpenAPI documentation for workflow APIs."""

    def __init__(self, app: Any | None = None):
        """Initialize OpenAPI generator.

        Args:
            app: FastAPI application instance
        """
        self.app = app
        self.workflow_generator = WorkflowAPIGenerator()

    def generate_workflow_schema(
        self, workflow: dict[str, Any], workflow_id: str = "workflow"
    ) -> dict[str, Any]:
        """Generate OpenAPI schema for a workflow.

        Args:
            workflow: ComfyUI workflow definition
            workflow_id: Unique identifier for the workflow

        Returns:
            OpenAPI schema dictionary
        """
        # Extract parameters from workflow
        parameters = self.workflow_generator.extract_input_parameters(workflow)

        # Create request schema
        request_schema = self._create_request_schema(parameters, workflow_id)

        # Create response schema
        response_schema = self._create_response_schema(workflow_id)

        # Create example
        example = self._create_example(parameters)

        # Build OpenAPI path item
        path_item = {
            "post": {
                "summary": f"Execute {workflow_id} workflow",
                "description": self._generate_description(workflow, parameters),
                "operationId": f"execute_{workflow_id}",
                "tags": ["workflows"],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": request_schema,
                            "example": example,
                        }
                    },
                },
                "responses": {
                    "200": {
                        "description": "Successful execution",
                        "content": {
                            "application/json": {
                                "schema": response_schema,
                                "example": {
                                    "status": "completed",
                                    "prompt_id": "abc-123",
                                    "images": [
                                        {
                                            "filename": "output_001.png",
                                            "url": "/api/images/output_001.png",
                                        }
                                    ],
                                },
                            }
                        },
                    },
                    "202": {
                        "description": "Async execution started",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {
                                            "type": "string",
                                            "enum": ["processing"],
                                        },
                                        "prompt_id": {"type": "string"},
                                        "status_url": {"type": "string"},
                                    },
                                }
                            }
                        },
                    },
                    "400": {
                        "description": "Invalid request",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {"detail": {"type": "string"}},
                                }
                            }
                        },
                    },
                    "500": {
                        "description": "Server error",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {"detail": {"type": "string"}},
                                }
                            }
                        },
                    },
                },
            }
        }

        return path_item

    def _create_request_schema(
        self, parameters: list[Any], workflow_id: str
    ) -> dict[str, Any]:
        """Create request schema from parameters.

        Args:
            parameters: List of workflow parameters
            workflow_id: Workflow identifier

        Returns:
            JSON schema dictionary
        """
        properties = {}
        required = []

        for param in parameters:
            # Map parameter type to JSON schema type
            json_type = self._map_parameter_type(param.type)

            # Build property schema
            prop_schema = {"type": json_type, "description": param.description}

            # Add constraints
            if param.minimum is not None:
                prop_schema["minimum"] = param.minimum
            if param.maximum is not None:
                prop_schema["maximum"] = param.maximum
            if param.enum:
                prop_schema["enum"] = param.enum
            if param.default is not None:
                prop_schema["default"] = param.default

            properties[param.name] = prop_schema

            if param.required:
                required.append(param.name)

        return {
            "type": "object",
            "properties": properties,
            "required": required,
            "title": f"{workflow_id.capitalize()}Request",
        }

    def _create_response_schema(self, workflow_id: str) -> dict[str, Any]:
        """Create response schema.

        Args:
            workflow_id: Workflow identifier

        Returns:
            JSON schema dictionary
        """
        return {
            "type": "object",
            "title": f"{workflow_id.capitalize()}Response",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["completed", "failed", "processing"],
                    "description": "Execution status",
                },
                "prompt_id": {"type": "string", "description": "Unique execution ID"},
                "images": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string"},
                            "url": {"type": "string"},
                            "width": {"type": "integer"},
                            "height": {"type": "integer"},
                        },
                    },
                    "description": "Generated images",
                },
                "error": {"type": "string", "description": "Error message if failed"},
            },
            "required": ["status", "prompt_id"],
        }

    def _create_example(self, parameters: list[Any]) -> dict[str, Any]:
        """Create example request.

        Args:
            parameters: List of workflow parameters

        Returns:
            Example request dictionary
        """
        example = {}

        for param in parameters:
            if param.default is not None:
                example[param.name] = param.default
            elif param.enum:
                example[param.name] = param.enum[0]
            elif param.type == ParameterType.STRING:
                if "prompt" in param.name.lower():
                    example[param.name] = "a beautiful sunset over mountains"
                else:
                    example[param.name] = "example text"
            elif param.type == ParameterType.INTEGER:
                if param.minimum is not None:
                    example[param.name] = param.minimum
                else:
                    example[param.name] = 1
            elif param.type == ParameterType.FLOAT:
                if param.minimum is not None:
                    example[param.name] = param.minimum
                else:
                    example[param.name] = 1.0
            elif param.type == ParameterType.BOOLEAN:
                example[param.name] = True

        return example

    def _map_parameter_type(self, param_type: Any) -> str:
        """Map parameter type to JSON schema type.

        Args:
            param_type: Parameter type enum

        Returns:
            JSON schema type string
        """
        mapping = {
            ParameterType.STRING: "string",
            ParameterType.INTEGER: "integer",
            ParameterType.FLOAT: "number",
            ParameterType.BOOLEAN: "boolean",
            ParameterType.ARRAY: "array",
            ParameterType.OBJECT: "object",
        }
        return mapping.get(param_type, "string")

    def _generate_description(
        self, _workflow: dict[str, Any], parameters: list[Any]
    ) -> str:
        """Generate endpoint description.

        Args:
            _workflow: Workflow definition (unused)
            parameters: List of parameters

        Returns:
            Description string
        """
        lines = ["Execute ComfyUI workflow with the following parameters:"]
        lines.append("")

        # Group parameters by category
        prompts = []
        dimensions = []
        settings = []

        for param in parameters:
            if "prompt" in param.name.lower():
                prompts.append(param)
            elif param.name in ["width", "height", "batch_size"]:
                dimensions.append(param)
            else:
                settings.append(param)

        if prompts:
            lines.append("**Text Prompts:**")
            for p in prompts:
                lines.append(f"- `{p.name}`: {p.description}")
            lines.append("")

        if dimensions:
            lines.append("**Image Dimensions:**")
            for p in dimensions:
                range_str = ""
                if p.minimum and p.maximum:
                    range_str = f" ({p.minimum}-{p.maximum})"
                lines.append(f"- `{p.name}`: {p.description}{range_str}")
            lines.append("")

        if settings:
            lines.append("**Generation Settings:**")
            for p in settings:
                lines.append(f"- `{p.name}`: {p.description}")

        return "\n".join(lines)

    def generate_full_spec(
        self,
        title: str = "ComfyUI Workflow API",
        version: str = "1.0.0",
        workflows: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Generate complete OpenAPI specification.

        Args:
            title: API title
            version: API version
            workflows: Dictionary of workflow_id -> workflow definition

        Returns:
            Complete OpenAPI specification
        """
        spec = {
            "openapi": "3.0.2",
            "info": {
                "title": title,
                "version": version,
                "description": "API for executing ComfyUI workflows",
                "contact": {"name": "API Support", "email": "support@example.com"},
            },
            "servers": [
                {
                    "url": "http://localhost:8000",
                    "description": "Local development server",
                },
                {"url": "https://api.example.com", "description": "Production server"},
            ],
            "paths": {},
            "components": {
                "securitySchemes": {
                    "ApiKeyAuth": {
                        "type": "apiKey",
                        "in": "header",
                        "name": "X-API-Key",
                    }
                }
            },
            "security": [{"ApiKeyAuth": []}],
            "tags": [
                {"name": "workflows", "description": "Workflow execution endpoints"},
                {"name": "status", "description": "Status and monitoring endpoints"},
                {"name": "images", "description": "Image retrieval endpoints"},
            ],
        }

        # Add workflow endpoints
        if workflows:
            paths = spec.get("paths", {})
            if not isinstance(paths, dict):
                paths = {}
                spec["paths"] = paths
            for workflow_id, workflow in workflows.items():
                path = f"/api/workflows/{workflow_id}"
                paths[path] = self.generate_workflow_schema(workflow, workflow_id)

        # Add common endpoints
        paths = spec.get("paths", {})
        if not isinstance(paths, dict):
            paths = {}
            spec["paths"] = paths
        paths["/health"] = {
            "get": {
                "summary": "Health check",
                "tags": ["status"],
                "responses": {
                    "200": {
                        "description": "Service is healthy",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {"type": "string"},
                                        "version": {"type": "string"},
                                    },
                                }
                            }
                        },
                    }
                },
            }
        }

        paths["/api/status/{prompt_id}"] = {
            "get": {
                "summary": "Get execution status",
                "tags": ["status"],
                "parameters": [
                    {
                        "name": "prompt_id",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"},
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Status retrieved",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {"type": "string"},
                                        "progress": {"type": "number"},
                                        "current_node": {"type": "string"},
                                    },
                                }
                            }
                        },
                    }
                },
            }
        }

        return spec

    def save_spec(self, spec: dict[str, Any], output_path: str) -> None:
        """Save OpenAPI specification to file.

        Args:
            spec: OpenAPI specification
            output_path: Output file path
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w") as f:
            json.dump(spec, f, indent=2)
