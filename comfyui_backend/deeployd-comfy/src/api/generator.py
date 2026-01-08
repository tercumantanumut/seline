"""Workflow to API generator."""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, create_model
from pydantic import Field as PydanticField

from src.workflows.converter import WorkflowConverter


class ParameterType(Enum):
    """Parameter data types."""

    STRING = "string"
    INTEGER = "integer"
    FLOAT = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    FILE = "file"


@dataclass
class Parameter:
    """API parameter definition."""

    name: str
    type: ParameterType
    description: str = ""
    required: bool = False
    default: Any = None
    enum: list[Any] | None = None
    minimum: float | None = None
    maximum: float | None = None


@dataclass
class EndpointConfig:
    """API endpoint configuration."""

    path: str
    method: str
    name: str
    description: str
    request_schema: Optional["RequestSchema"] = None
    response_schema: Optional["ResponseSchema"] = None


@dataclass
class RequestSchema:
    """Request schema definition."""

    properties: dict[str, dict[str, Any]]
    required: list[str]
    examples: dict[str, Any] | None = None


@dataclass
class ResponseSchema:
    """Response schema definition."""

    properties: dict[str, dict[str, Any]]
    examples: dict[str, Any] | None = None


class WorkflowAPIGenerator:
    """Generator for creating APIs from workflows."""

    # Known sampler names for KSampler nodes
    SAMPLER_NAMES = [
        "euler",
        "euler_ancestral",
        "heun",
        "dpm_2",
        "dpm_2_ancestral",
        "lms",
        "dpm_fast",
        "dpm_adaptive",
        "dpmpp_2s_ancestral",
        "dpmpp_sde",
        "dpmpp_2m",
        "dpmpp_3m_sde",
        "ddim",
        "uni_pc",
    ]

    # Known schedulers
    SCHEDULERS = [
        "normal",
        "karras",
        "exponential",
        "sgm_uniform",
        "simple",
        "ddim_uniform",
    ]

    def __init__(self):
        """Initialize generator with converter."""
        self.converter = WorkflowConverter()

    def generate_endpoint_config(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> EndpointConfig:
        """Generate endpoint configuration from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            EndpointConfig instance
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        # Analyze workflow to determine endpoint type
        has_image_output = any(
            node.get("class_type") in ["SaveImage", "PreviewImage"]
            for node in nodes.values()
        )

        if has_image_output:
            path = "/generate"
            name = "generate_image"
            description = "Generate image from workflow"
        else:
            path = "/process"
            name = "process_workflow"
            description = "Process workflow"

        return EndpointConfig(
            path=path,
            method="POST",
            name=name,
            description=description,
            request_schema=self.generate_request_schema(workflow),
            response_schema=self.generate_response_schema(workflow),
        )

    def extract_input_parameters(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> list[Parameter]:
        """Extract input parameters from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            List of Parameter objects
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        parameters = []
        seen_params = set()

        for _, node_data in nodes.items():
            class_type = node_data.get("class_type", "")
            inputs = node_data.get("inputs", {})

            for input_name, input_value in inputs.items():
                # Skip connections (references to other nodes)
                if isinstance(input_value, list) and len(input_value) == 2:
                    continue

                # Create parameter name
                if class_type == "CLIPTextEncode" and input_name == "text":
                    param_name = "prompt"
                elif class_type == "EmptyLatentImage":
                    param_name = input_name  # width, height, batch_size
                elif class_type == "KSampler":
                    param_name = input_name  # seed, steps, cfg, etc.
                elif class_type == "LoadImage" and input_name == "image":
                    param_name = "image"
                elif class_type == "TestNode":  # For testing
                    param_name = input_name
                else:
                    param_name = f"{class_type.lower()}_{input_name}"

                # Skip if already seen
                if param_name in seen_params:
                    continue
                seen_params.add(param_name)

                # Detect parameter type
                param_type = self.detect_parameter_type(input_value)

                # Check if file upload
                if class_type == "LoadImage" and input_name == "image":
                    param_type = ParameterType.FILE

                # Determine if required
                required = param_name in [
                    "prompt",
                    "required_param",
                ]  # Prompt is usually required

                # Get enum values for known parameters
                enum_values = None
                if param_name == "sampler_name":
                    enum_values = self.SAMPLER_NAMES
                elif param_name == "scheduler":
                    enum_values = self.SCHEDULERS

                # Set min/max for numeric parameters
                minimum = None
                maximum = None
                if param_name == "width" or param_name == "height":
                    minimum = 64
                    maximum = 8192
                elif param_name == "steps":
                    minimum = 1
                    maximum = 1000
                elif param_name == "cfg":
                    minimum = 1.0
                    maximum = 30.0

                parameters.append(
                    Parameter(
                        name=param_name,
                        type=param_type,
                        description=f"{class_type} {input_name}",
                        required=required,
                        default=input_value if not required else None,
                        enum=enum_values,
                        minimum=minimum,
                        maximum=maximum,
                    )
                )

        return parameters

    def detect_parameter_type(self, value: Any) -> ParameterType:
        """Detect parameter type from value.

        Args:
            value: Parameter value

        Returns:
            ParameterType enum value
        """
        if isinstance(value, bool):
            return ParameterType.BOOLEAN
        elif isinstance(value, int):
            return ParameterType.INTEGER
        elif isinstance(value, float):
            return ParameterType.FLOAT
        elif isinstance(value, str):
            return ParameterType.STRING
        elif isinstance(value, list):
            return ParameterType.ARRAY
        elif isinstance(value, dict):
            return ParameterType.OBJECT
        else:
            return ParameterType.STRING

    def generate_request_schema(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> RequestSchema:
        """Generate request schema from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            RequestSchema instance
        """
        parameters = self.extract_input_parameters(workflow)
        properties = {}
        required = []

        for param in parameters:
            prop = {"type": param.type.value, "description": param.description}

            if param.default is not None:
                prop["default"] = param.default

            if param.enum:
                prop["enum"] = param.enum

            if param.minimum is not None:
                prop["minimum"] = param.minimum

            if param.maximum is not None:
                prop["maximum"] = param.maximum

            properties[param.name] = prop

            if param.required:
                required.append(param.name)

        return RequestSchema(properties=properties, required=required)

    def generate_response_schema(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> ResponseSchema:
        """Generate response schema from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            ResponseSchema instance
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        properties = {}

        # Check for image outputs
        has_image_output = any(
            node.get("class_type") in ["SaveImage", "PreviewImage"]
            for node in nodes.values()
        )

        if has_image_output:
            properties["images"] = {
                "type": "array",
                "items": {"type": "string", "format": "base64"},
                "description": "Generated images in base64 format",
            }

        # Add metadata
        properties["metadata"] = {
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string"},
                "execution_time": {"type": "number"},
                "node_count": {"type": "integer"},
            },
        }

        # Add status
        properties["status"] = {
            "type": "string",
            "enum": ["success", "error", "processing"],
        }

        return ResponseSchema(properties=properties)

    def create_pydantic_model(
        self, name: str, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> type[BaseModel]:
        """Create Pydantic model from workflow.

        Args:
            name: Model class name
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            Pydantic model class
        """
        parameters = self.extract_input_parameters(workflow)
        fields = {}

        for param in parameters:
            # Map parameter type to Python type
            if param.type == ParameterType.STRING:
                field_type = str
            elif param.type == ParameterType.INTEGER:
                field_type = int
            elif param.type == ParameterType.FLOAT:
                field_type = float
            elif param.type == ParameterType.BOOLEAN:
                field_type = bool
            elif param.type == ParameterType.ARRAY:
                field_type = list[Any]
            elif param.type == ParameterType.OBJECT:
                field_type = dict[str, Any]
            elif param.type == ParameterType.FILE:
                continue  # Skip file fields for Pydantic models
            else:
                field_type = Any

            # Create field with validation
            field_kwargs = {"description": param.description}

            if param.minimum is not None:
                field_kwargs["ge"] = param.minimum
            if param.maximum is not None:
                field_kwargs["le"] = param.maximum

            if param.required:
                fields[param.name] = (field_type, PydanticField(**field_kwargs))
            else:
                default_value = param.default if param.default is not None else ...
                fields[param.name] = (
                    field_type | None,
                    PydanticField(default_value, **field_kwargs),
                )

        return create_model(name, **fields)

    def map_workflow_to_api_params(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> dict[str, dict[str, str]]:
        """Map workflow inputs to API parameters.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            Mapping of parameter names to node IDs and input fields
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        mapping = {}

        for node_id, node_data in nodes.items():
            class_type = node_data.get("class_type", "")
            inputs = node_data.get("inputs", {})

            for input_name, input_value in inputs.items():
                # Skip connections
                if isinstance(input_value, list) and len(input_value) == 2:
                    continue

                # Create parameter mapping
                if class_type == "CLIPTextEncode" and input_name == "text":
                    param_name = "prompt"
                elif class_type in ["EmptyLatentImage", "KSampler"]:
                    param_name = input_name
                else:
                    continue

                mapping[param_name] = {"node_id": node_id, "input_field": input_name}

        return mapping

    def generate_router(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any], workflow_id: str
    ) -> APIRouter:
        """Generate FastAPI router from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)
            workflow_id: Workflow identifier

        Returns:
            Configured APIRouter
        """
        router = APIRouter()
        config = self.generate_endpoint_config(workflow)
        request_model = self.create_pydantic_model(
            f"Workflow{workflow_id}Request", workflow
        )

        # Create endpoint function
        async def process_workflow(request: request_model):  # noqa: ARG001
            """Process workflow with given parameters."""
            return {
                "status": "success",
                "metadata": {
                    "workflow_id": workflow_id,
                    "execution_time": 0.0,
                    "node_count": len(workflow),
                },
            }

        # Add route
        router.add_api_route(
            config.path,
            process_workflow,
            methods=[config.method],
            name=config.name,
            description=config.description,
            response_model=dict[str, Any],
        )

        return router

    def generate_validation_rules(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> dict[str, dict[str, Any]]:
        """Generate validation rules for parameters.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            Dictionary of validation rules
        """
        rules = {}
        parameters = self.extract_input_parameters(workflow)

        for param in parameters:
            rule = {}

            if param.minimum is not None:
                rule["min"] = param.minimum
            if param.maximum is not None:
                rule["max"] = param.maximum
            if param.enum:
                rule["choices"] = param.enum
            if param.required:
                rule["required"] = True
            if param.type == ParameterType.STRING:
                rule["type"] = "string"
            elif param.type in [ParameterType.INTEGER, ParameterType.FLOAT]:
                rule["type"] = "number"

            if rule:
                rules[param.name] = rule

        return rules

    def generate_openapi_schema(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> dict[str, Any]:
        """Generate OpenAPI schema from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            OpenAPI schema dictionary
        """
        config = self.generate_endpoint_config(workflow)
        request_schema = self.generate_request_schema(workflow)
        response_schema = self.generate_response_schema(workflow)

        return {
            "openapi": "3.0.0",
            "info": {
                "title": "Workflow API",
                "version": "1.0.0",
                "description": "Generated API from ComfyUI workflow",
            },
            "paths": {
                config.path: {
                    "post": {
                        "summary": config.description,
                        "operationId": config.name,
                        "requestBody": {
                            "required": True,
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": request_schema.properties,
                                        "required": request_schema.required,
                                    }
                                }
                            },
                        },
                        "responses": {
                            "200": {
                                "description": "Successful response",
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "object",
                                            "properties": response_schema.properties,
                                        }
                                    }
                                },
                            }
                        },
                    }
                }
            },
        }

    def generate_example_request(self, workflow: dict[str, Any]) -> dict[str, Any]:
        """Generate example request for workflow.

        Args:
            workflow: Workflow dictionary

        Returns:
            Example request dictionary
        """
        example = {}
        parameters = self.extract_input_parameters(workflow)

        for param in parameters:
            if param.name == "prompt":
                example["prompt"] = "a beautiful landscape"
            elif param.name == "seed":
                example["seed"] = 123456
            elif param.name == "steps":
                example["steps"] = 20
            elif param.name == "cfg":
                example["cfg"] = 7.0
            elif param.name == "width":
                example["width"] = 512
            elif param.name == "height":
                example["height"] = 512
            elif param.name == "sampler_name":
                example["sampler_name"] = "euler"
            elif param.name == "scheduler":
                example["scheduler"] = "simple"
            elif param.default is not None:
                example[param.name] = param.default

        return example
