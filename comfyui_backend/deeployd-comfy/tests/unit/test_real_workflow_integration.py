"""Integration tests with real ComfyUI workflow."""

import json
from pathlib import Path

import pytest

from src.api.generator import WorkflowAPIGenerator
from src.containers.dockerfile_builder import DockerfileBuilder
from src.workflows.analyzer import NodeAnalyzer
from src.workflows.dependencies import DependencyExtractor
from src.workflows.parser import WorkflowParser
from src.workflows.validator import WorkflowValidator


class TestRealWorkflowIntegration:
    """Test with real ComfyUI workflow."""

    @pytest.fixture
    def real_workflow_path(self):
        """Path to real workflow file."""
        return Path(__file__).parent.parent / "real_workflow.json"

    @pytest.fixture
    def real_workflow_api(self, real_workflow_path):
        """Load real workflow in API format."""
        with open(real_workflow_path) as f:
            return json.load(f)

    def test_parse_real_workflow(self, real_workflow_api):
        """Test parsing real workflow."""
        parser = WorkflowParser()
        result = parser.parse(real_workflow_api)

        assert result.is_valid
        assert len(result.nodes) > 0
        assert len(result.get_custom_nodes()) > 0  # Has custom nodes

        # Check for expected node types
        node_types = {node["class_type"] for node in result.nodes.values()}
        assert "UNETLoader" in node_types
        assert "VAELoader" in node_types
        assert "CLIPLoader" in node_types
        assert "KSamplerAdvanced" in node_types
        assert "SaveImage" in node_types

    def test_analyze_real_workflow(self, real_workflow_api):
        """Test analyzing real workflow."""
        analyzer = NodeAnalyzer()
        analysis = analyzer.analyze(real_workflow_api)

        assert analysis["total_nodes"] > 20  # Complex workflow
        assert analysis["custom_nodes"] > 0
        assert len(analysis["custom_node_types"]) > 0

        # Check for custom nodes we expect
        custom_types = analysis["custom_node_types"]
        assert any(
            "easy seed" in t or "ShowText" in t or "TextInput" in t or "MagCache" in t
            for t in custom_types
        )

    def test_extract_dependencies_from_real_workflow(self, real_workflow_api):
        """Test extracting dependencies from real workflow."""
        extractor = DependencyExtractor()
        deps = extractor.extract_all(real_workflow_api)

        # Check models
        assert len(deps["models"]["checkpoints"]) == 0  # Uses UNET instead
        assert len(deps["models"]["vaes"]) > 0
        assert "wan_2.1_vae.safetensors" in deps["models"]["vaes"]

        # Check for LoRA models
        assert len(deps["models"]["loras"]) > 0
        assert any("adapter_model" in lora for lora in deps["models"]["loras"])

        # Check custom nodes
        assert len(deps["custom_nodes"]) > 0
        custom_node_types = [node["class_type"] for node in deps["custom_nodes"]]
        assert any(
            "easy seed" in t or "ShowText" in t or "TextInput" in t or "MagCache" in t
            for t in custom_node_types
        )

    def test_validate_real_workflow(self, real_workflow_api):
        """Test validating real workflow."""
        validator = WorkflowValidator()
        result = validator.validate(real_workflow_api)

        assert result.is_valid or len(result.warnings) > 0  # May have warnings

        # Check complexity
        assert result.metadata["complexity"]["level"] in ["complex", "moderate"]
        assert result.metadata["complexity"]["score"] > 50  # Complex workflow

    def test_generate_api_from_real_workflow(self, real_workflow_api):
        """Test generating API from real workflow."""
        generator = WorkflowAPIGenerator()

        # Generate endpoint config
        config = generator.generate_endpoint_config(real_workflow_api)
        assert config.path == "/generate"
        assert config.method == "POST"

        # Extract parameters
        params = generator.extract_input_parameters(real_workflow_api)
        param_names = [p.name for p in params]

        # Should extract key parameters
        assert (
            "prompt" in param_names
            or "text" in param_names
            or "textinput__text" in param_names
        )
        assert "width" in param_names
        assert "height" in param_names
        assert any("seed" in p or "noise_seed" in p for p in param_names)
        assert any("steps" in p for p in param_names)
        # Note: This workflow uses KSamplerAdvanced which doesn't have cfg parameter

        # Generate request schema
        schema = generator.generate_request_schema(real_workflow_api)
        assert len(schema.properties) > 5  # Should have multiple parameters

        # Generate OpenAPI spec
        openapi = generator.generate_openapi_schema(real_workflow_api)
        assert "paths" in openapi
        assert "/generate" in openapi["paths"]

    def test_generate_dockerfile_for_real_workflow(self, real_workflow_api):
        """Test generating Dockerfile for real workflow."""
        # Extract dependencies
        extractor = DependencyExtractor()
        deps = extractor.extract_all(real_workflow_api)

        # Build Dockerfile
        builder = DockerfileBuilder()
        dockerfile = builder.build_for_workflow(
            dependencies=deps, base_image="python:3.11-slim"
        )

        assert "FROM python:3.11-slim" in dockerfile
        assert "WORKDIR /app" in dockerfile
        assert "EXPOSE 8188" in dockerfile  # ComfyUI default port
        # Check for custom nodes section if custom nodes are present
        if deps["custom_nodes"]:
            # The dockerfile should at least have a section for custom nodes
            assert (
                "custom" in dockerfile.lower() or "Install custom nodes" in dockerfile
            )

    def test_real_workflow_node_connections(self, real_workflow_api):
        """Test node connections in real workflow."""
        analyzer = NodeAnalyzer()

        # Build dependency graph
        graph = analyzer.build_dependency_graph(real_workflow_api)

        # Check that nodes have dependencies
        nodes_with_deps = [n for n, data in graph.items() if data["dependencies"]]
        assert len(nodes_with_deps) > 10  # Most nodes should be connected

        # Find execution order
        execution_order = analyzer.find_execution_order(real_workflow_api)
        assert len(execution_order) > 0

        # Loaders should come early in execution
        loader_positions = []
        for i, node_id in enumerate(execution_order):
            node = real_workflow_api.get(node_id, {})
            if "Loader" in node.get("class_type", ""):
                loader_positions.append(i)

        if loader_positions:
            avg_loader_pos = sum(loader_positions) / len(loader_positions)
            assert avg_loader_pos < len(execution_order) / 2  # Loaders in first half

    def test_real_workflow_model_management(self, real_workflow_api):
        """Test model management for real workflow."""
        extractor = DependencyExtractor()

        # Get all model references
        models = extractor.extract_models(real_workflow_api)

        # Verify model paths are safe
        all_models = []
        for model_list in models.values():
            all_models.extend(model_list)

        for model_path in all_models:
            assert extractor.validate_model_path(model_path)
            assert ".." not in model_path  # No path traversal
            assert not model_path.startswith("/")  # Relative paths

    def test_real_workflow_custom_node_handling(self, real_workflow_api):
        """Test custom node handling in real workflow."""
        # Parse workflow
        parser = WorkflowParser()
        result = parser.parse(real_workflow_api)

        custom_nodes = result.get_custom_nodes()
        assert len(custom_nodes) > 0

        # Verify custom nodes are properly identified
        analyzer = NodeAnalyzer()
        # Use the parsed nodes which are in API format
        for _node_id, node_data in result.nodes.items():
            class_type = node_data.get("class_type", "")
            node_type = analyzer.identify_node_type(class_type)

            if class_type in custom_nodes:
                assert node_type == "custom"
            elif class_type and class_type != "Unknown":
                # Either builtin or custom
                assert node_type in ["builtin", "custom"]
