"""Unit tests for WorkflowParser module."""

import json

import pytest

from src.workflows.parser import WorkflowParser


class TestWorkflowParser:
    """Test cases for WorkflowParser class."""

    @pytest.fixture
    def valid_workflow_json(self):
        """Sample valid ComfyUI workflow JSON."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
                "outputs": ["MODEL", "CLIP", "VAE"],
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "a beautiful landscape", "clip": ["1", 1]},
                "outputs": ["CONDITIONING"],
            },
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 42,
                    "steps": 20,
                    "cfg": 7.5,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["2", 0],
                    "latent_image": ["4", 0],
                },
                "outputs": ["LATENT"],
            },
            "4": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 512, "height": 512, "batch_size": 1},
                "outputs": ["LATENT"],
            },
        }

    @pytest.fixture
    def invalid_workflow_json(self):
        """Sample invalid workflow JSON."""
        return {
            "node1": {
                # Missing required class_type
                "inputs": {"test": "value"}
            }
        }

    @pytest.fixture
    def workflow_with_custom_nodes(self):
        """Workflow containing custom nodes."""
        return {
            "1": {
                "class_type": "ComfyUI_CustomNode_XYZ",
                "inputs": {"param": "value"},
                "outputs": ["OUTPUT"],
            },
            "2": {
                "class_type": "KSampler",  # Built-in node
                "inputs": {"seed": 123, "model": ["1", 0]},
                "outputs": ["LATENT"],
            },
        }

    def test_parse_valid_workflow(self, valid_workflow_json):
        """Test parsing a valid workflow."""
        parser = WorkflowParser()
        result = parser.parse(valid_workflow_json)

        assert result.is_valid is True
        assert len(result.nodes) == 4
        assert result.nodes["1"]["class_type"] == "CheckpointLoaderSimple"
        assert result.nodes["3"]["inputs"]["seed"] == 42

    def test_parse_invalid_workflow(self, invalid_workflow_json):
        """Test parsing an invalid workflow raises exception."""
        parser = WorkflowParser()

        with pytest.raises(ValueError, match="Invalid workflow"):
            parser.parse(invalid_workflow_json)

    def test_parse_empty_workflow(self):
        """Test parsing an empty workflow."""
        parser = WorkflowParser()

        with pytest.raises(ValueError, match="Empty workflow"):
            parser.parse({})

    def test_parse_workflow_from_string(self, valid_workflow_json):
        """Test parsing workflow from JSON string."""
        parser = WorkflowParser()
        json_string = json.dumps(valid_workflow_json)

        result = parser.parse_string(json_string)

        assert result.is_valid is True
        assert len(result.nodes) == 4

    def test_parse_malformed_json_string(self):
        """Test parsing malformed JSON string."""
        parser = WorkflowParser()

        with pytest.raises(json.JSONDecodeError):
            parser.parse_string("not valid json {")

    def test_detect_workflow_format(self, valid_workflow_json):
        """Test detection of workflow format (API vs UI)."""
        parser = WorkflowParser()

        # API format (direct node dictionary)
        api_result = parser.parse(valid_workflow_json)
        assert api_result.format == "api"

        # UI format (uses nodes and links arrays)
        ui_workflow = {
            "nodes": [
                {
                    "id": 1,
                    "type": "CheckpointLoaderSimple",
                    "widgets_values": ["model.safetensors"],
                },
                {
                    "id": 2,
                    "type": "KSampler",
                    "widgets_values": [42, "randomize", 20, 7.5, "euler", "normal"],
                },
            ],
            "links": [[1, 1, 0, 2, 0]],
        }
        ui_result = parser.parse(ui_workflow)
        assert ui_result.format == "ui"

    def test_extract_node_connections(self, valid_workflow_json):
        """Test extraction of node connections."""
        parser = WorkflowParser()
        result = parser.parse(valid_workflow_json)

        connections = result.get_connections()
        assert len(connections) > 0

        # Check specific connection: node 3 depends on node 1 for model
        assert any(
            conn["from_node"] == "1"
            and conn["to_node"] == "3"
            and conn["from_output"] == 0
            and conn["to_input"] == "model"
            for conn in connections
        )

    def test_validate_node_structure(self):
        """Test validation of individual node structure."""
        parser = WorkflowParser()

        # Valid node
        valid_node = {"class_type": "TestNode", "inputs": {"param": "value"}}
        assert parser._validate_node_structure(valid_node) is True

        # Invalid node (missing class_type)
        invalid_node = {"inputs": {"param": "value"}}
        assert parser._validate_node_structure(invalid_node) is False

    def test_identify_custom_nodes(self, workflow_with_custom_nodes):
        """Test identification of custom nodes in workflow."""
        parser = WorkflowParser()
        result = parser.parse(workflow_with_custom_nodes)

        custom_nodes = result.get_custom_nodes()
        assert len(custom_nodes) == 1
        assert "ComfyUI_CustomNode_XYZ" in custom_nodes

    def test_workflow_metadata_extraction(self, valid_workflow_json):
        """Test extraction of workflow metadata."""
        parser = WorkflowParser()
        result = parser.parse(valid_workflow_json)

        metadata = result.get_metadata()
        assert metadata["node_count"] == 4
        assert "CheckpointLoaderSimple" in metadata["node_types"]
        assert metadata["has_custom_nodes"] is False

    def test_parse_workflow_with_missing_outputs(self):
        """Test parsing workflow with missing outputs field."""
        workflow = {
            "1": {
                "class_type": "TestNode",
                "inputs": {"param": "value"},
                # outputs field missing - should be handled gracefully
            }
        }
        parser = WorkflowParser()
        result = parser.parse(workflow)

        assert result.is_valid is True
        assert result.nodes["1"].get("outputs") == []

    def test_circular_dependency_detection(self):
        """Test detection of circular dependencies."""
        circular_workflow = {
            "1": {
                "class_type": "NodeA",
                "inputs": {"input": ["2", 0]},
                "outputs": ["OUTPUT"],
            },
            "2": {
                "class_type": "NodeB",
                "inputs": {"input": ["1", 0]},
                "outputs": ["OUTPUT"],
            },
        }
        parser = WorkflowParser()

        with pytest.raises(ValueError, match="Circular dependency"):
            result = parser.parse(circular_workflow)
            result.validate_connections()

    def test_parse_workflow_from_file(self, tmp_path, valid_workflow_json):
        """Test parsing workflow from file."""
        workflow_file = tmp_path / "workflow.json"
        workflow_file.write_text(json.dumps(valid_workflow_json))

        parser = WorkflowParser()
        result = parser.parse_file(str(workflow_file))

        assert result.is_valid is True
        assert len(result.nodes) == 4

    def test_parse_nonexistent_file(self):
        """Test parsing from nonexistent file."""
        parser = WorkflowParser()

        with pytest.raises(FileNotFoundError):
            parser.parse_file("/nonexistent/workflow.json")
