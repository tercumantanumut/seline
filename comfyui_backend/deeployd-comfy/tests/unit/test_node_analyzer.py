"""Unit tests for NodeAnalyzer module."""

import pytest

from src.workflows.analyzer import NodeAnalyzer


class TestNodeAnalyzer:
    """Test cases for NodeAnalyzer class."""

    @pytest.fixture
    def sample_nodes(self):
        """Sample nodes for testing."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
                "outputs": ["MODEL", "CLIP", "VAE"],
            },
            "2": {
                "class_type": "CustomNodeXYZ",
                "inputs": {"param": "value"},
                "outputs": ["OUTPUT"],
            },
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "model": ["1", 0],
                    "seed": 42,
                    "steps": 20,
                },
                "outputs": ["LATENT"],
            },
        }

    @pytest.fixture
    def complex_workflow_nodes(self):
        """Complex workflow with multiple dependencies."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {},
                "outputs": ["MODEL", "CLIP", "VAE"],
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"clip": ["1", 1], "text": "prompt"},
                "outputs": ["CONDITIONING"],
            },
            "3": {
                "class_type": "CLIPTextEncode",
                "inputs": {"clip": ["1", 1], "text": "negative"},
                "outputs": ["CONDITIONING"],
            },
            "4": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 512, "height": 512},
                "outputs": ["LATENT"],
            },
            "5": {
                "class_type": "KSampler",
                "inputs": {
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "latent_image": ["4", 0],
                },
                "outputs": ["LATENT"],
            },
            "6": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
                "outputs": ["IMAGE"],
            },
            "7": {
                "class_type": "SaveImage",
                "inputs": {"images": ["6", 0]},
                "outputs": [],
            },
        }

    def test_identify_node_type(self):
        """Test identification of node types."""
        analyzer = NodeAnalyzer()

        # Test built-in node
        assert analyzer.identify_node_type("KSampler") == "builtin"
        assert analyzer.identify_node_type("CheckpointLoaderSimple") == "builtin"

        # Test custom node
        assert analyzer.identify_node_type("CustomNodeXYZ") == "custom"
        assert analyzer.identify_node_type("ComfyUI_Custom_Node") == "custom"

        # Test empty/invalid
        assert analyzer.identify_node_type("") == "unknown"
        assert analyzer.identify_node_type(None) == "unknown"

    def test_analyze_nodes(self, sample_nodes):
        """Test basic node analysis."""
        analyzer = NodeAnalyzer()
        analysis = analyzer.analyze(sample_nodes)

        assert analysis["total_nodes"] == 3
        assert analysis["builtin_nodes"] == 2
        assert analysis["custom_nodes"] == 1
        assert "CustomNodeXYZ" in analysis["custom_node_types"]
        assert len(analysis["node_types"]) == 3

    def test_build_dependency_graph(self, sample_nodes):
        """Test dependency graph construction."""
        analyzer = NodeAnalyzer()
        graph = analyzer.build_dependency_graph(sample_nodes)

        assert "1" in graph
        assert "2" in graph
        assert "3" in graph

        # Node 3 depends on Node 1
        assert "1" in graph["3"]["dependencies"]
        assert graph["3"]["dependencies"]["1"] == ["model"]

        # Node 1 has no dependencies
        assert len(graph["1"]["dependencies"]) == 0

    def test_find_execution_order(self, complex_workflow_nodes):
        """Test topological sort for execution order."""
        analyzer = NodeAnalyzer()
        order = analyzer.find_execution_order(complex_workflow_nodes)

        # Check that dependencies come before dependents
        assert order.index("1") < order.index("2")  # Checkpoint before CLIP encode
        assert order.index("1") < order.index("3")  # Checkpoint before negative CLIP
        assert order.index("4") < order.index("5")  # Empty latent before KSampler
        assert order.index("5") < order.index("6")  # KSampler before VAE decode
        assert order.index("6") < order.index("7")  # VAE decode before save

    def test_detect_isolated_nodes(self):
        """Test detection of isolated nodes."""
        nodes = {
            "1": {"class_type": "LoadImage", "inputs": {}, "outputs": ["IMAGE"]},
            "2": {
                "class_type": "SaveImage",
                "inputs": {"images": ["1", 0]},
                "outputs": [],
            },
            "3": {
                "class_type": "EmptyLatentImage",
                "inputs": {},
                "outputs": ["LATENT"],
            },  # Isolated
        }

        analyzer = NodeAnalyzer()
        isolated = analyzer.find_isolated_nodes(nodes)

        assert "3" in isolated
        assert "1" not in isolated
        assert "2" not in isolated

    def test_analyze_node_connections(self, complex_workflow_nodes):
        """Test analysis of node connections."""
        analyzer = NodeAnalyzer()
        connections = analyzer.analyze_connections(complex_workflow_nodes)

        # Count actual connections in the fixture
        # Node 2: 1 connection (clip from 1)
        # Node 3: 1 connection (clip from 1)
        # Node 5: 4 connections (model, positive, negative, latent_image)
        # Node 6: 2 connections (samples, vae)
        # Node 7: 1 connection (images)
        # Total: 9 connections
        assert connections["total_connections"] == 9
        assert connections["max_inputs_node"] == "5"  # KSampler has most inputs
        assert connections["max_outputs_consumers"] > 0

    def test_detect_model_loaders(self, sample_nodes):
        """Test detection of model loader nodes."""
        analyzer = NodeAnalyzer()
        loaders = analyzer.find_model_loaders(sample_nodes)

        assert "1" in loaders
        assert loaders["1"]["type"] == "CheckpointLoaderSimple"
        assert loaders["1"]["model_name"] == "model.safetensors"

    def test_detect_custom_node_dependencies(self):
        """Test detection of custom node Python dependencies."""
        nodes = {
            "1": {
                "class_type": "ComfyUI_Impact_Pack",
                "inputs": {},
                "outputs": [],
                "_meta": {"dependencies": ["numpy", "opencv-python"]},
            }
        }

        analyzer = NodeAnalyzer()
        deps = analyzer.extract_python_dependencies(nodes)

        assert "numpy" in deps
        assert "opencv-python" in deps

    def test_analyze_empty_workflow(self):
        """Test analysis of empty workflow."""
        analyzer = NodeAnalyzer()
        analysis = analyzer.analyze({})

        assert analysis["total_nodes"] == 0
        assert analysis["builtin_nodes"] == 0
        assert analysis["custom_nodes"] == 0
        assert len(analysis["node_types"]) == 0

    def test_detect_output_nodes(self, complex_workflow_nodes):
        """Test detection of output nodes."""
        analyzer = NodeAnalyzer()
        outputs = analyzer.find_output_nodes(complex_workflow_nodes)

        assert "7" in outputs  # SaveImage is an output node
        assert outputs["7"]["type"] == "SaveImage"

    def test_calculate_workflow_complexity(self, complex_workflow_nodes):
        """Test workflow complexity calculation."""
        analyzer = NodeAnalyzer()
        complexity = analyzer.calculate_complexity(complex_workflow_nodes)

        assert complexity["nodes"] == 7
        assert complexity["connections"] == 9  # Corrected based on actual connections
        assert complexity["depth"] > 0
        assert complexity["custom_nodes"] == 0
        assert "score" in complexity

    def test_validate_node_connections(self):
        """Test validation of node connections."""
        nodes = {
            "1": {"class_type": "LoadImage", "inputs": {}, "outputs": ["IMAGE"]},
            "2": {
                "class_type": "SaveImage",
                "inputs": {"images": ["999", 0]},  # Invalid reference
                "outputs": [],
            },
        }

        analyzer = NodeAnalyzer()
        issues = analyzer.validate_connections(nodes)

        assert len(issues) > 0
        assert any("999" in issue for issue in issues)

    def test_extract_node_parameters(self, sample_nodes):
        """Test extraction of node parameters."""
        analyzer = NodeAnalyzer()
        params = analyzer.extract_node_parameters(sample_nodes["3"])

        assert params["seed"] == 42
        assert params["steps"] == 20
        assert "model" not in params  # Connection, not parameter

    def test_group_nodes_by_type(self, complex_workflow_nodes):
        """Test grouping nodes by their type."""
        analyzer = NodeAnalyzer()
        grouped = analyzer.group_by_type(complex_workflow_nodes)

        assert "loaders" in grouped
        assert "samplers" in grouped
        assert "encoders" in grouped
        assert "outputs" in grouped

        assert "1" in grouped["loaders"]
        assert "5" in grouped["samplers"]
        assert "2" in grouped["encoders"]
        assert "7" in grouped["outputs"]
