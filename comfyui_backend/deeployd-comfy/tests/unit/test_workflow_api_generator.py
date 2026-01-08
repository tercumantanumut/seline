"""Unit tests for WorkflowAPIGenerator."""

import pytest
from fastapi import APIRouter
from pydantic import BaseModel

from src.api.generator import (
    EndpointConfig,
    ParameterType,
    RequestSchema,
    ResponseSchema,
    WorkflowAPIGenerator,
)


class TestWorkflowAPIGenerator:
    """Test cases for WorkflowAPIGenerator."""

    @pytest.fixture
    def generator(self):
        """Create WorkflowAPIGenerator instance."""
        return WorkflowAPIGenerator()

    @pytest.fixture
    def sample_workflow(self):
        """Sample workflow for testing."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "a beautiful landscape", "clip": ["1", 0]},
            },
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 123456,
                    "steps": 20,
                    "cfg": 7.0,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["2", 0],
                    "latent_image": ["4", 0],
                },
            },
            "4": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 512, "height": 512, "batch_size": 1},
            },
            "5": {
                "class_type": "SaveImage",
                "inputs": {"filename_prefix": "output", "images": ["3", 0]},
            },
        }

    def test_generate_endpoint_config(self, generator, sample_workflow):
        """Test generating endpoint configuration."""
        config = generator.generate_endpoint_config(sample_workflow)

        assert isinstance(config, EndpointConfig)
        assert config.path == "/generate"
        assert config.method == "POST"
        assert config.name == "generate_image"
        assert config.description is not None

    def test_extract_input_parameters(self, generator, sample_workflow):
        """Test extracting input parameters from workflow."""
        params = generator.extract_input_parameters(sample_workflow)

        assert len(params) > 0
        assert any(p.name == "prompt" for p in params)
        assert any(p.name == "seed" for p in params)
        assert any(p.name == "steps" for p in params)
        assert any(p.name == "width" for p in params)
        assert any(p.name == "height" for p in params)

    def test_generate_request_schema(self, generator, sample_workflow):
        """Test generating request schema."""
        schema = generator.generate_request_schema(sample_workflow)

        assert isinstance(schema, RequestSchema)
        assert "prompt" in schema.properties
        assert "seed" in schema.properties
        assert schema.properties["prompt"]["type"] == "string"
        assert schema.properties["seed"]["type"] == "integer"
        assert schema.required == ["prompt"]  # Prompt should be required

    def test_generate_response_schema(self, generator, sample_workflow):
        """Test generating response schema."""
        schema = generator.generate_response_schema(sample_workflow)

        assert isinstance(schema, ResponseSchema)
        assert "image" in schema.properties or "images" in schema.properties
        assert "metadata" in schema.properties
        assert schema.properties["metadata"]["type"] == "object"

    def test_create_pydantic_model(self, generator, sample_workflow):
        """Test creating Pydantic model from workflow."""
        model_class = generator.create_pydantic_model(
            "GenerateImageRequest", sample_workflow
        )

        assert issubclass(model_class, BaseModel)
        assert hasattr(model_class, "__fields__")

        # Test instantiation
        instance = model_class(
            prompt="test prompt", seed=42, steps=20, width=512, height=512
        )
        assert instance.prompt == "test prompt"
        assert instance.seed == 42

    def test_map_workflow_to_api_params(self, generator, sample_workflow):
        """Test mapping workflow inputs to API parameters."""
        mapping = generator.map_workflow_to_api_params(sample_workflow)

        assert "prompt" in mapping
        assert mapping["prompt"]["node_id"] == "2"
        assert mapping["prompt"]["input_field"] == "text"

        assert "seed" in mapping
        assert mapping["seed"]["node_id"] == "3"
        assert mapping["seed"]["input_field"] == "seed"

    def test_generate_router(self, generator, sample_workflow):
        """Test generating FastAPI router from workflow."""
        router = generator.generate_router(sample_workflow, "workflow_123")

        assert isinstance(router, APIRouter)
        assert len(router.routes) > 0

        # Find the main endpoint
        main_route = next((r for r in router.routes if r.path == "/generate"), None)
        assert main_route is not None
        assert main_route.methods == {"POST"}

    def test_handle_optional_parameters(self, generator):
        """Test handling optional parameters."""
        workflow = {
            "1": {
                "class_type": "TestNode",
                "inputs": {
                    "required_param": "value",
                    "optional_param": None,
                    "numeric_param": 1.5,
                },
            }
        }

        params = generator.extract_input_parameters(workflow)

        required = [p for p in params if p.required]
        optional = [p for p in params if not p.required]

        assert len(required) > 0
        assert len(optional) > 0

    def test_parameter_type_detection(self, generator):
        """Test automatic parameter type detection."""
        test_cases = [
            ("test string", ParameterType.STRING),
            (123, ParameterType.INTEGER),
            (1.5, ParameterType.FLOAT),
            (True, ParameterType.BOOLEAN),
            (["a", "b"], ParameterType.ARRAY),
            ({"key": "value"}, ParameterType.OBJECT),
        ]

        for value, expected_type in test_cases:
            detected = generator.detect_parameter_type(value)
            assert detected == expected_type

    def test_generate_openapi_schema(self, generator, sample_workflow):
        """Test generating OpenAPI schema."""
        schema = generator.generate_openapi_schema(sample_workflow)

        assert "openapi" in schema
        assert "info" in schema
        assert "paths" in schema
        assert "/generate" in schema["paths"]
        assert "post" in schema["paths"]["/generate"]

    def test_handle_file_upload_parameters(self, generator):
        """Test handling file upload parameters."""
        workflow = {"1": {"class_type": "LoadImage", "inputs": {"image": "input.png"}}}

        params = generator.extract_input_parameters(workflow)
        file_params = [p for p in params if p.type == ParameterType.FILE]

        assert len(file_params) > 0
        assert file_params[0].name == "image"

    def test_generate_validation_rules(self, generator, sample_workflow):
        """Test generating validation rules."""
        rules = generator.generate_validation_rules(sample_workflow)

        assert "width" in rules
        assert rules["width"]["min"] >= 64
        assert rules["width"]["max"] <= 8192

        assert "steps" in rules
        assert rules["steps"]["min"] >= 1
        assert rules["steps"]["max"] <= 1000

    def test_handle_enum_parameters(self, generator):
        """Test handling enum parameters."""
        workflow = {
            "1": {
                "class_type": "KSampler",
                "inputs": {"sampler_name": "euler", "scheduler": "normal"},
            }
        }

        params = generator.extract_input_parameters(workflow)

        sampler_param = next(p for p in params if p.name == "sampler_name")
        assert sampler_param.enum is not None
        assert "euler" in sampler_param.enum

    def test_generate_example_request(self, generator, sample_workflow):
        """Test generating example request."""
        example = generator.generate_example_request(sample_workflow)

        assert isinstance(example, dict)
        assert "prompt" in example
        assert "seed" in example
        assert isinstance(example["prompt"], str)
        assert isinstance(example["seed"], int)
