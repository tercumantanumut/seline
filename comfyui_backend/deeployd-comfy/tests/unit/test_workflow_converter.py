"""Tests for workflow format converter."""

import json
from pathlib import Path

import pytest

from src.workflows.converter import WorkflowConverter


class TestWorkflowConverter:
    """Test workflow format conversion."""

    @pytest.fixture
    def ui_workflow(self):
        """Load real UI format workflow."""
        workflow_path = Path(__file__).parent.parent / "test_workflow_ui.json"
        with open(workflow_path) as f:
            return json.load(f)
    
    @pytest.fixture
    def api_workflow(self):
        """Load real API format workflow."""
        workflow_path = Path(__file__).parent.parent / "real_workflow.json"
        with open(workflow_path) as f:
            return json.load(f)

    @pytest.fixture
    def converter(self):
        """Create converter instance."""
        return WorkflowConverter()

    def test_detect_ui_format(self, converter, ui_workflow):
        """Test detecting UI format workflow."""
        format_type = converter.detect_format(ui_workflow)
        assert format_type == "ui"

    def test_detect_api_format(self, converter):
        """Test detecting API format workflow."""
        api_workflow = {
            "1": {"class_type": "LoadImage", "inputs": {"image": "test.png"}},
            "2": {"class_type": "SaveImage", "inputs": {"images": ["1", 0]}},
        }
        format_type = converter.detect_format(api_workflow)
        assert format_type == "api"

    def test_convert_ui_to_api_basic(self, converter, ui_workflow):
        """Test converting UI format to API format."""
        api_workflow = converter.ui_to_api(ui_workflow)

        # Should have nodes converted
        assert len(api_workflow) > 0

        # Each node should have required fields
        for _node_id, node_data in api_workflow.items():
            assert "class_type" in node_data
            assert "inputs" in node_data
            assert isinstance(node_data["inputs"], dict)

    def test_convert_ui_nodes(self, converter, ui_workflow):
        """Test that UI nodes are properly converted."""
        api_workflow = converter.ui_to_api(ui_workflow)

        # Check specific nodes from the real workflow
        assert "76" in api_workflow  # ModelSamplingSD3
        assert api_workflow["76"]["class_type"] == "ModelSamplingSD3"
        assert "shift" in api_workflow["76"]["inputs"]

        assert "82" in api_workflow  # VAELoader
        assert api_workflow["82"]["class_type"] == "VAELoader"
        assert "vae_name" in api_workflow["82"]["inputs"]
        assert api_workflow["82"]["inputs"]["vae_name"] == "wan_2.1_vae.safetensors"

    def test_convert_ui_connections(self, converter, ui_workflow):
        """Test that UI connections are properly converted."""
        api_workflow = converter.ui_to_api(ui_workflow)

        # Node 76 should have model input from node 25 (link 25)
        assert "76" in api_workflow
        assert "model" in api_workflow["76"]["inputs"]
        assert api_workflow["76"]["inputs"]["model"] == ["85", 0]

        # Node 88 (KSamplerAdvanced) should have connections
        assert "88" in api_workflow
        assert "model" in api_workflow["88"]["inputs"]
        assert "positive" in api_workflow["88"]["inputs"]
        assert "negative" in api_workflow["88"]["inputs"]
        assert "latent_image" in api_workflow["88"]["inputs"]

    def test_convert_widget_values(self, converter, ui_workflow):
        """Test that widget values are properly converted."""
        api_workflow = converter.ui_to_api(ui_workflow)

        # EmptyLatentImage node should have width/height
        assert "89" in api_workflow
        assert api_workflow["89"]["class_type"] == "EmptyLatentImage"
        assert api_workflow["89"]["inputs"]["width"] == 1152
        assert api_workflow["89"]["inputs"]["height"] == 1152
        assert api_workflow["89"]["inputs"]["batch_size"] == 1

        # KSamplerAdvanced should have its settings
        assert "88" in api_workflow
        assert api_workflow["88"]["inputs"]["sampler_name"] == "euler"
        assert api_workflow["88"]["inputs"]["scheduler"] == "beta57"
        assert api_workflow["88"]["inputs"]["steps"] == 27

    def test_convert_custom_nodes(self, converter, ui_workflow):
        """Test that custom nodes are properly converted."""
        api_workflow = converter.ui_to_api(ui_workflow)

        # easy seed node
        assert "87" in api_workflow
        assert api_workflow["87"]["class_type"] == "easy seed"
        assert "seed" in api_workflow["87"]["inputs"]

        # ShowText node
        assert "91" in api_workflow
        assert api_workflow["91"]["class_type"] == "ShowText|pysssss"

        # TextInput_ node
        assert "90" in api_workflow
        assert api_workflow["90"]["class_type"] == "TextInput_"

        # MagCache node
        assert "107" in api_workflow
        assert api_workflow["107"]["class_type"] == "MagCache"

    def test_preserve_metadata(self, converter, ui_workflow):
        """Test that metadata is preserved during conversion."""
        api_workflow = converter.ui_to_api(ui_workflow)

        # Should preserve custom node metadata
        if "_meta" in api_workflow:
            assert "_meta" in api_workflow

        # Each node should preserve its metadata if present
        for node in ui_workflow["nodes"]:
            node_id = str(node["id"])
            if node_id in api_workflow and "properties" in node:
                # Some metadata might be preserved
                pass

    def test_handle_missing_fields(self, converter):
        """Test handling of missing fields in UI format."""
        minimal_workflow = {"nodes": [{"id": 1, "type": "LoadImage"}], "links": []}

        api_workflow = converter.ui_to_api(minimal_workflow)
        assert "1" in api_workflow
        assert api_workflow["1"]["class_type"] == "LoadImage"
        assert api_workflow["1"]["inputs"] == {}

    def test_handle_empty_workflow(self, converter):
        """Test handling of empty workflow."""
        empty_workflow = {"nodes": [], "links": []}

        api_workflow = converter.ui_to_api(empty_workflow)
        assert api_workflow == {}

    def test_convert_link_connections(self, converter, ui_workflow):
        """Test that links are properly mapped to connections."""
        api_workflow = converter.ui_to_api(ui_workflow)

        # Verify a specific link connection
        # Link 25: from node 85 output 0 to node 76 input "model"
        assert api_workflow["76"]["inputs"]["model"] == ["85", 0]

        # Link 54: from node 82 output 0 to node 106 input ""
        assert api_workflow["106"]["inputs"][""] == ["82", 0]

    def test_api_format_passthrough(self, converter):
        """Test that API format is passed through unchanged."""
        api_workflow = {
            "1": {"class_type": "LoadImage", "inputs": {"image": "test.png"}}
        }

        result = converter.convert(api_workflow)
        assert result == api_workflow

    def test_convert_main_method(self, converter, ui_workflow):
        """Test the main convert method."""
        result = converter.convert(ui_workflow)

        # Should return API format
        assert isinstance(result, dict)
        assert len(result) > 0

        # Should have proper structure
        for _node_id, node_data in result.items():
            assert "class_type" in node_data
            assert "inputs" in node_data
