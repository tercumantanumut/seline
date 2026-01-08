"""Tests for OpenAPI documentation generator."""

import json
from pathlib import Path

import pytest

from src.api.openapi_generator import OpenAPIGenerator
from src.api.generator import Parameter as WorkflowParameter, ParameterType


class TestOpenAPIGenerator:
    """Test OpenAPI documentation generation."""
    
    @pytest.fixture
    def generator(self):
        """Create generator instance."""
        return OpenAPIGenerator()
    
    @pytest.fixture
    def sample_workflow(self):
        """Create sample workflow."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"}
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "positive prompt",
                    "clip": ["1", 1]
                }
            },
            "3": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": 512,
                    "height": 512,
                    "batch_size": 1
                }
            }
        }
    
    @pytest.fixture
    def sample_parameters(self):
        """Create sample parameters."""
        return [
            WorkflowParameter(
                name="positive_prompt",
                type=ParameterType.STRING,
                required=True,
                description="Positive text prompt"
            ),
            WorkflowParameter(
                name="negative_prompt",
                type=ParameterType.STRING,
                required=False,
                default="",
                description="Negative text prompt"
            ),
            WorkflowParameter(
                name="width",
                type=ParameterType.INTEGER,
                required=False,
                default=512,
                minimum=64,
                maximum=2048,
                description="Image width"
            ),
            WorkflowParameter(
                name="height",
                type=ParameterType.INTEGER,
                required=False,
                default=512,
                minimum=64,
                maximum=2048,
                description="Image height"
            ),
            WorkflowParameter(
                name="steps",
                type=ParameterType.INTEGER,
                required=False,
                default=20,
                minimum=1,
                maximum=150,
                description="Sampling steps"
            ),
            WorkflowParameter(
                name="seed",
                type=ParameterType.INTEGER,
                required=False,
                default=-1,
                description="Random seed (-1 for random)"
            )
        ]
    
    def test_generate_workflow_schema(self, generator, sample_workflow):
        """Test generating OpenAPI schema for a workflow."""
        schema = generator.generate_workflow_schema(sample_workflow, "test_workflow")
        
        # Check structure
        assert "post" in schema
        post_op = schema["post"]
        
        assert "summary" in post_op
        assert "description" in post_op
        assert "operationId" in post_op
        assert post_op["operationId"] == "execute_test_workflow"
        
        # Check request body
        assert "requestBody" in post_op
        assert post_op["requestBody"]["required"] is True
        assert "application/json" in post_op["requestBody"]["content"]
        
        # Check responses
        assert "responses" in post_op
        assert "200" in post_op["responses"]
        assert "202" in post_op["responses"]
        assert "400" in post_op["responses"]
    
    def test_create_request_schema(self, generator, sample_parameters):
        """Test creating request schema from parameters."""
        schema = generator._create_request_schema(sample_parameters, "test")
        
        assert schema["type"] == "object"
        assert "properties" in schema
        assert "required" in schema
        
        # Check properties
        props = schema["properties"]
        assert "positive_prompt" in props
        assert props["positive_prompt"]["type"] == "string"
        
        assert "width" in props
        assert props["width"]["type"] == "integer"
        assert props["width"]["minimum"] == 64
        assert props["width"]["maximum"] == 2048
        
        # Check required fields
        assert "positive_prompt" in schema["required"]
        assert "negative_prompt" not in schema["required"]
    
    def test_create_response_schema(self, generator):
        """Test creating response schema."""
        schema = generator._create_response_schema("test")
        
        assert schema["type"] == "object"
        assert "properties" in schema
        
        props = schema["properties"]
        assert "status" in props
        assert "prompt_id" in props
        assert "images" in props
        
        # Check status enum
        assert props["status"]["enum"] == ["completed", "failed", "processing"]
        
        # Check images array
        assert props["images"]["type"] == "array"
        assert "items" in props["images"]
    
    def test_create_example(self, generator, sample_parameters):
        """Test creating example request."""
        example = generator._create_example(sample_parameters)
        
        # Should have default values
        assert example["width"] == 512
        assert example["height"] == 512
        assert example["steps"] == 20
        assert example["seed"] == -1
        
        # Should generate example for required string
        assert "positive_prompt" in example
        assert isinstance(example["positive_prompt"], str)
        
        # Should include optional with default
        assert example["negative_prompt"] == ""
    
    def test_map_parameter_type(self, generator):
        """Test mapping parameter types to JSON schema types."""
        assert generator._map_parameter_type(ParameterType.STRING) == "string"
        assert generator._map_parameter_type(ParameterType.INTEGER) == "integer"
        assert generator._map_parameter_type(ParameterType.FLOAT) == "number"
        assert generator._map_parameter_type(ParameterType.BOOLEAN) == "boolean"
        assert generator._map_parameter_type(ParameterType.ARRAY) == "array"
    
    def test_generate_description(self, generator, sample_workflow, sample_parameters):
        """Test generating endpoint description."""
        description = generator._generate_description(sample_workflow, sample_parameters)
        
        assert "Execute ComfyUI workflow" in description
        assert "Text Prompts:" in description
        assert "Image Dimensions:" in description
        assert "Generation Settings:" in description
        
        # Check parameter descriptions are included
        assert "positive_prompt" in description
        assert "width" in description
        assert "steps" in description
    
    def test_generate_full_spec(self, generator, sample_workflow):
        """Test generating complete OpenAPI specification."""
        workflows = {
            "test1": sample_workflow,
            "test2": sample_workflow
        }
        
        spec = generator.generate_full_spec(
            title="Test API",
            version="1.0.0",
            workflows=workflows
        )
        
        # Check OpenAPI version
        assert spec["openapi"] == "3.0.2"
        
        # Check info
        assert spec["info"]["title"] == "Test API"
        assert spec["info"]["version"] == "1.0.0"
        
        # Check paths
        assert "/api/workflows/test1" in spec["paths"]
        assert "/api/workflows/test2" in spec["paths"]
        assert "/health" in spec["paths"]
        assert "/api/status/{prompt_id}" in spec["paths"]
        
        # Check security
        assert "components" in spec
        assert "securitySchemes" in spec["components"]
        assert "ApiKeyAuth" in spec["components"]["securitySchemes"]
        
        # Check tags
        assert "tags" in spec
        tag_names = [tag["name"] for tag in spec["tags"]]
        assert "workflows" in tag_names
        assert "status" in tag_names
    
    def test_save_spec(self, generator, tmp_path):
        """Test saving OpenAPI specification to file."""
        spec = {
            "openapi": "3.0.2",
            "info": {"title": "Test", "version": "1.0.0"},
            "paths": {}
        }
        
        output_file = tmp_path / "openapi.json"
        generator.save_spec(spec, str(output_file))
        
        assert output_file.exists()
        
        # Load and verify
        with open(output_file) as f:
            loaded_spec = json.load(f)
        
        assert loaded_spec == spec
    
    def test_workflow_with_enum_parameter(self, generator):
        """Test handling enum parameters."""
        params = [
            WorkflowParameter(
                name="sampler",
                type=ParameterType.STRING,
                required=True,
                enum=["euler", "euler_a", "ddim"],
                default="euler",
                description="Sampling method"
            )
        ]
        
        schema = generator._create_request_schema(params, "test")
        
        assert "sampler" in schema["properties"]
        assert schema["properties"]["sampler"]["enum"] == ["euler", "euler_a", "ddim"]
        assert schema["properties"]["sampler"]["default"] == "euler"
    
    def test_example_with_enum(self, generator):
        """Test example generation with enum parameter."""
        params = [
            WorkflowParameter(
                name="scheduler",
                type=ParameterType.STRING,
                required=False,
                enum=["normal", "karras", "exponential"],
                description="Scheduler type"
            )
        ]
        
        example = generator._create_example(params)
        
        # Should use first enum value
        assert example["scheduler"] == "normal"