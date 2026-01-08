"""Unit tests for CustomNodeInstaller module."""

from unittest.mock import Mock, patch

import pytest

from src.containers.custom_node_installer import (
    CustomNodeInstaller,
    NodeInstallationError,
    NodeMetadata,
)


class TestCustomNodeInstaller:
    """Test cases for CustomNodeInstaller class."""

    @pytest.fixture
    def installer(self):
        """Create CustomNodeInstaller instance."""
        return CustomNodeInstaller()

    @pytest.fixture
    def node_metadata(self):
        """Sample custom node metadata."""
        return NodeMetadata(
            name="ComfyUI_IPAdapter_plus",
            repository="https://github.com/cubiq/ComfyUI_IPAdapter_plus",
            commit_hash="abc123def456",
            python_dependencies=["insightface>=0.7.3", "onnxruntime"],
            system_dependencies=["libgomp1"],
            models_required=["ip-adapter_sd15.safetensors"],
        )

    def test_parse_custom_node_info(self, installer):
        """Test parsing custom node information from workflow."""
        workflow_nodes = {
            "1": {
                "class_type": "IPAdapterApply",
                "_meta": {
                    "repository": "https://github.com/cubiq/ComfyUI_IPAdapter_plus",
                    "commit": "abc123",
                },
            },
            "2": {
                "class_type": "CLIPTextEncode",  # Built-in node
            },
        }

        custom_nodes = installer.extract_custom_nodes(workflow_nodes)

        assert len(custom_nodes) == 1
        assert custom_nodes[0]["class_type"] == "IPAdapterApply"
        assert (
            custom_nodes[0]["repository"]
            == "https://github.com/cubiq/ComfyUI_IPAdapter_plus"
        )

    def test_generate_install_commands(self, installer, node_metadata):
        """Test generating installation commands for custom node."""
        commands = installer.generate_install_commands(node_metadata)

        assert any("git clone" in cmd for cmd in commands)
        assert any("ComfyUI_IPAdapter_plus" in cmd for cmd in commands)
        assert any("git checkout abc123def456" in cmd for cmd in commands)
        assert any("pip install" in cmd for cmd in commands)
        assert any("insightface" in cmd for cmd in commands)

    def test_generate_requirements_file(self, installer, node_metadata):
        """Test generating requirements.txt for custom node."""
        requirements = installer.generate_requirements_txt([node_metadata])

        assert "insightface>=0.7.3" in requirements
        assert "onnxruntime" in requirements

    def test_detect_python_dependencies(self, installer, tmp_path):
        """Test detecting Python dependencies from custom node code."""
        # Create a sample custom node Python file
        node_file = tmp_path / "custom_node.py"
        node_file.write_text("""
import torch
import numpy as np
from PIL import Image
import cv2
from transformers import pipeline
""")

        dependencies = installer.detect_dependencies_from_code(str(node_file))

        assert "torch" in dependencies
        assert "numpy" in dependencies
        assert "pillow" in dependencies  # PIL -> pillow
        assert "opencv-python" in dependencies  # cv2 -> opencv-python
        assert "transformers" in dependencies

    def test_validate_repository_url(self, installer):
        """Test validating repository URLs."""
        valid_urls = [
            "https://github.com/user/repo",
            "https://github.com/user/repo.git",
            "git@github.com:user/repo.git",
        ]

        for url in valid_urls:
            assert installer.validate_repository_url(url) is True

        invalid_urls = [
            "not-a-url",
            "http://example.com/repo",  # Not GitHub
            "ftp://github.com/repo",
        ]

        for url in invalid_urls:
            assert installer.validate_repository_url(url) is False

    def test_generate_dockerfile_section(self, installer, node_metadata):
        """Test generating Dockerfile section for custom nodes."""
        nodes = [node_metadata]
        dockerfile_section = installer.generate_dockerfile_section(nodes)

        assert "# Install custom nodes" in dockerfile_section
        assert "RUN git clone" in dockerfile_section
        assert "WORKDIR" in dockerfile_section
        assert "RUN pip install" in dockerfile_section

    def test_handle_nested_dependencies(self, installer):
        """Test handling custom nodes with nested dependencies."""
        node1 = NodeMetadata(
            name="Node1",
            repository="https://github.com/user/node1",
            commit_hash="abc123",
            python_dependencies=["package1"],
            depends_on=["Node2"],  # Depends on another custom node
        )

        node2 = NodeMetadata(
            name="Node2",
            repository="https://github.com/user/node2",
            commit_hash="def456",
            python_dependencies=["package2"],
        )

        ordered = installer.resolve_dependency_order([node1, node2])

        # Node2 should come before Node1
        assert ordered[0].name == "Node2"
        assert ordered[1].name == "Node1"

    def test_cache_custom_nodes(self, installer, tmp_path):
        """Test caching downloaded custom nodes."""
        cache_dir = tmp_path / "node_cache"
        installer.set_cache_directory(str(cache_dir))

        node_metadata = NodeMetadata(
            name="TestNode",
            repository="https://github.com/test/node",
            commit_hash="abc123",
        )

        # Mock git operations
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = Mock(returncode=0)

            installer.download_and_cache_node(node_metadata)

            cache_dir / "TestNode_abc123"
            assert mock_run.called

            # Second download should use cache
            installer.download_and_cache_node(node_metadata)
            # Should not call git again if cached

    def test_install_with_commit_hash(self, installer):
        """Test installing custom node at specific commit."""
        node = NodeMetadata(
            name="TestNode",
            repository="https://github.com/test/node",
            commit_hash="abc123def",
        )

        commands = installer.generate_install_commands(node)

        # Should checkout specific commit
        assert any("git checkout abc123def" in cmd for cmd in commands)

    def test_handle_installation_failure(self, installer):
        """Test handling installation failures gracefully."""
        node = NodeMetadata(
            name="FailNode",
            repository="https://invalid-repo-url.com/repo",
        )

        with pytest.raises(NodeInstallationError):
            installer.install_node(node)

    def test_verify_node_installation(self, installer, tmp_path):
        """Test verifying if a custom node is properly installed."""
        node_dir = tmp_path / "custom_nodes" / "TestNode"
        node_dir.mkdir(parents=True)

        # Create __init__.py to make it a valid module
        (node_dir / "__init__.py").write_text("")
        (node_dir / "node.py").write_text("class TestNode: pass")

        assert (
            installer.verify_installation("TestNode", str(tmp_path / "custom_nodes"))
            is True
        )

        assert (
            installer.verify_installation(
                "NonExistentNode", str(tmp_path / "custom_nodes")
            )
            is False
        )

    def test_batch_install_nodes(self, installer):
        """Test installing multiple custom nodes in batch."""
        nodes = [
            NodeMetadata(
                name="Node1",
                repository="https://github.com/test/node1",
                python_dependencies=["package1"],
            ),
            NodeMetadata(
                name="Node2",
                repository="https://github.com/test/node2",
                python_dependencies=["package2", "package3"],
            ),
        ]

        commands = installer.generate_batch_install_commands(nodes)

        # Should combine pip installs for efficiency
        assert any("package1" in cmd and "package2" in cmd for cmd in commands)

    def test_extract_node_mappings(self, installer, tmp_path):
        """Test extracting node class mappings from custom node."""
        mappings_file = tmp_path / "node_mappings.py"
        mappings_file.write_text("""
NODE_CLASS_MAPPINGS = {
    "IPAdapterApply": IPAdapterApply,
    "IPAdapterEncoder": IPAdapterEncoder,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IPAdapterApply": "Apply IPAdapter",
    "IPAdapterEncoder": "IPAdapter Encoder",
}
""")

        mappings = installer.extract_node_mappings(str(mappings_file))

        assert "IPAdapterApply" in mappings["class_mappings"]
        assert "IPAdapterEncoder" in mappings["class_mappings"]
        assert mappings["display_names"]["IPAdapterApply"] == "Apply IPAdapter"

    def test_generate_init_file(self, installer):
        """Test generating __init__.py for custom nodes directory."""
        nodes = [
            NodeMetadata(name="Node1", repository="repo1"),
            NodeMetadata(name="Node2", repository="repo2"),
        ]

        init_content = installer.generate_custom_nodes_init(nodes)

        assert "from .Node1" in init_content
        assert "from .Node2" in init_content
        assert "__all__" in init_content

    def test_compatibility_check(self, installer):
        """Test checking custom node compatibility with ComfyUI version."""
        node = NodeMetadata(
            name="TestNode",
            repository="https://github.com/test/node",
            min_comfyui_version="0.0.1",
            max_comfyui_version="1.0.0",
        )

        assert installer.check_compatibility(node, "0.5.0") is True
        assert installer.check_compatibility(node, "2.0.0") is False
        assert installer.check_compatibility(node, "0.0.0") is False

    def test_known_gguf_node_mapping(self, installer):
        """GGUF custom nodes should resolve to ComfyUI-GGUF repo without warnings."""
        assert (
            installer.find_repository_by_class_name("DualCLIPLoaderGGUF")
            == "https://github.com/city96/ComfyUI-GGUF"
        )
        assert (
            installer.find_repository_by_class_name("UnetLoaderGGUF")
            == "https://github.com/city96/ComfyUI-GGUF"
        )
