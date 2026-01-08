"""Critical tests for the workflow converter - focusing on real-world scenarios."""

import json
from pathlib import Path

import pytest

from src.workflows.converter import WorkflowConverter


class TestConverterCriticalPaths:
    """Test critical conversion scenarios that matter in production."""

    @pytest.fixture
    def converter(self):
        return WorkflowConverter()

    @pytest.fixture
    def real_ui_workflow(self):
        """Load the actual real workflow for testing."""
        workflow_path = Path(__file__).parent.parent / "real_workflow.json"
        with open(workflow_path) as f:
            return json.load(f)

    def test_api_to_ui_conversion(self, converter):
        """Test converting API format back to UI format."""
        api_workflow = {
            "1": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 12345,
                    "steps": 20,
                    "cfg": 7.5,
                    "model": ["2", 0],
                    "positive": ["3", 0],
                },
            },
            "2": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
            },
        }

        ui_workflow = converter.api_to_ui(api_workflow)

        # Should have the UI structure
        assert "nodes" in ui_workflow
        assert "links" in ui_workflow
        assert len(ui_workflow["nodes"]) == 2

        # Node IDs should be preserved
        node_ids = [n["id"] for n in ui_workflow["nodes"]]
        assert 1 in node_ids or "1" in node_ids
        assert 2 in node_ids or "2" in node_ids

    def test_widget_mapping_for_ksampler(self, converter):
        """Test that KSampler widget values are correctly mapped."""
        api_node = {"class_type": "KSamplerAdvanced", "inputs": {}}

        widget_values = [
            "enable",
            12345,
            "randomize",
            20,
            20,
            "euler",
            "normal",
            0,
            20,
            "disable",
        ]
        converter._map_widget_values(api_node, "KSamplerAdvanced", widget_values)

        # Check critical mappings
        assert api_node["inputs"]["add_noise"] == "enable"
        # Should skip "randomize" for noise_seed
        assert (
            "noise_seed" not in api_node["inputs"]
            or api_node["inputs"]["noise_seed"] != "randomize"
        )
        assert api_node["inputs"]["steps"] == 20
        assert api_node["inputs"]["sampler_name"] == "euler"
        assert api_node["inputs"]["scheduler"] == "normal"

    def test_empty_workflow_handling(self, converter):
        """Test that empty workflows are handled gracefully."""
        empty_ui = {"nodes": [], "links": []}
        result = converter.ui_to_api(empty_ui)
        assert result == {}

        empty_api = {}
        result = converter.api_to_ui(empty_api)
        assert result["nodes"] == []
        assert result["links"] == []

    def test_invalid_format_detection(self, converter):
        """Test detection of invalid workflow formats."""
        invalid_workflow = {"random_key": "value", "another_key": 123}

        # Should default to API format when unclear
        format_type = converter.detect_format(invalid_workflow)
        assert format_type == "api"

    def test_link_mapping_integrity(self, converter, real_ui_workflow):
        """Test that all links are correctly mapped during conversion."""
        # Convert to API and count connections
        api_workflow = converter.ui_to_api(real_ui_workflow)

        connection_count = 0
        for node_data in api_workflow.values():
            for input_value in node_data.get("inputs", {}).values():
                if isinstance(input_value, list) and len(input_value) == 2:
                    connection_count += 1

        # Should have preserved connections from the original workflow
        original_links = real_ui_workflow.get("links", [])
        assert connection_count > 0
        assert connection_count <= len(original_links)

    def test_custom_node_preservation(self, converter):
        """Test that custom nodes are preserved during conversion."""
        ui_workflow = {
            "nodes": [
                {
                    "id": 1,
                    "type": "CustomNodeType",
                    "widgets_values": ["value1", 123, True],
                }
            ],
            "links": [],
        }

        api_workflow = converter.ui_to_api(ui_workflow)

        assert "1" in api_workflow
        assert api_workflow["1"]["class_type"] == "CustomNodeType"
        assert api_workflow["1"]["inputs"] == {}  # No known mapping

    def test_handles_missing_widget_mappings(self, converter):
        """Test that unmapped widgets don't crash the converter."""
        api_node = {"class_type": "UnknownNode", "inputs": {}}

        widget_values = ["value1", 123, True, "value2"]
        # Should not raise an exception
        converter._map_widget_values(api_node, "UnknownNode", widget_values)

        # Inputs should still be empty since we don't know the mapping
        assert api_node["inputs"] == {}

    def test_roundtrip_conversion(self, converter, real_ui_workflow):
        """Test that UI -> API -> UI maintains essential structure."""
        # Convert UI to API
        api_workflow = converter.ui_to_api(real_ui_workflow)

        # Convert back to UI
        ui_again = converter.api_to_ui(api_workflow)

        # Should have same number of nodes
        assert len(ui_again["nodes"]) == len(real_ui_workflow["nodes"])

        # Should preserve node types
        original_types = {n["type"] for n in real_ui_workflow["nodes"]}
        converted_types = {n["type"] for n in ui_again["nodes"]}
        assert original_types == converted_types
