"""Unit tests for DependencyExtractor module."""

import pytest

from src.workflows.dependencies import DependencyExtractor


class TestDependencyExtractor:
    """Test cases for DependencyExtractor class."""

    @pytest.fixture
    def workflow_with_models(self):
        """Workflow containing various model references."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"},
            },
            "2": {
                "class_type": "LoraLoader",
                "inputs": {
                    "lora_name": "style_lora.safetensors",
                    "strength_model": 0.8,
                },
            },
            "3": {
                "class_type": "VAELoader",
                "inputs": {"vae_name": "vae-ft-mse.safetensors"},
            },
            "4": {
                "class_type": "ControlNetLoader",
                "inputs": {"control_net_name": "control_v11p_sd15_openpose.pth"},
            },
        }

    @pytest.fixture
    def workflow_with_custom_nodes(self):
        """Workflow with custom nodes."""
        return {
            "1": {
                "class_type": "ComfyUI_IPAdapter_plus",
                "_meta": {
                    "repository": "https://github.com/cubiq/ComfyUI_IPAdapter_plus",
                    "commit": "abc123",
                    "python_dependencies": ["insightface", "onnxruntime"],
                },
            },
            "2": {
                "class_type": "ComfyUI_FaceDetailer",
                "_meta": {
                    "repository": "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
                },
            },
        }

    @pytest.fixture
    def python_code_sample(self):
        """Sample Python code for import extraction."""
        return """
import torch
import numpy as np
from PIL import Image
from transformers import pipeline
import cv2
from scipy import ndimage
import matplotlib.pyplot as plt
"""

    def test_extract_all_dependencies(
        self, workflow_with_models, workflow_with_custom_nodes
    ):
        """Test extraction of all dependency types."""
        # Combine workflows
        workflow = {**workflow_with_models, **workflow_with_custom_nodes}

        extractor = DependencyExtractor()
        deps = extractor.extract_all(workflow)

        assert "models" in deps
        assert "custom_nodes" in deps
        assert "python_packages" in deps

    def test_extract_model_dependencies(self, workflow_with_models):
        """Test extraction of model dependencies."""
        extractor = DependencyExtractor()
        models = extractor.extract_models(workflow_with_models)

        assert len(models["checkpoints"]) == 1
        assert "sd_xl_base_1.0.safetensors" in models["checkpoints"]

        assert len(models["loras"]) == 1
        assert "style_lora.safetensors" in models["loras"]

        assert len(models["vaes"]) == 1
        assert "vae-ft-mse.safetensors" in models["vaes"]

        assert len(models["controlnets"]) == 1
        assert "control_v11p_sd15_openpose.pth" in models["controlnets"]

    def test_extract_custom_node_dependencies(self, workflow_with_custom_nodes):
        """Test extraction of custom node dependencies."""
        extractor = DependencyExtractor()
        custom_nodes = extractor.extract_custom_nodes(workflow_with_custom_nodes)

        assert len(custom_nodes) == 2

        # Check first custom node
        ip_adapter = next(
            (
                node
                for node in custom_nodes
                if node["class_type"] == "ComfyUI_IPAdapter_plus"
            ),
            None,
        )
        assert ip_adapter is not None
        assert (
            ip_adapter["repository"]
            == "https://github.com/cubiq/ComfyUI_IPAdapter_plus"
        )
        assert "insightface" in ip_adapter["python_dependencies"]

    def test_extract_python_imports_from_code(self, python_code_sample):
        """Test extraction of Python imports from code."""
        extractor = DependencyExtractor()
        imports = extractor.extract_python_imports(python_code_sample)

        expected_imports = {
            "torch",
            "numpy",
            "PIL",
            "transformers",
            "cv2",
            "scipy",
            "matplotlib",
        }
        assert imports == expected_imports

    def test_extract_python_packages(self, workflow_with_custom_nodes):
        """Test extraction of Python package dependencies."""
        extractor = DependencyExtractor()
        packages = extractor.extract_python_packages(workflow_with_custom_nodes)

        assert "insightface" in packages
        assert "onnxruntime" in packages

    def test_detect_model_file_info(self):
        """Test detection of model file information."""
        extractor = DependencyExtractor()

        # Test SafeTensors file
        info = extractor.get_model_file_info("sd_xl_base_1.0.safetensors")
        assert info["extension"] == ".safetensors"
        assert info["type"] == "checkpoint"
        assert info["filename"] == "sd_xl_base_1.0.safetensors"

        # Test LoRA file
        info = extractor.get_model_file_info("loras/style_lora.safetensors")
        assert info["extension"] == ".safetensors"
        assert info["filename"] == "style_lora.safetensors"

        # Test PTH file
        info = extractor.get_model_file_info("control_net.pth")
        assert info["extension"] == ".pth"

    def test_resolve_custom_node_repository(self):
        """Test resolution of custom node repository URLs."""
        extractor = DependencyExtractor()

        # GitHub URL
        info = extractor.resolve_repository(
            "https://github.com/cubiq/ComfyUI_IPAdapter_plus"
        )
        assert info["owner"] == "cubiq"
        assert info["repo"] == "ComfyUI_IPAdapter_plus"
        assert info["platform"] == "github"

        # GitLab URL (if supported)
        info = extractor.resolve_repository("https://gitlab.com/user/ComfyUI-Custom")
        assert info["owner"] == "user"
        assert info["repo"] == "ComfyUI-Custom"
        assert info["platform"] == "gitlab"

    def test_empty_workflow_dependencies(self):
        """Test dependency extraction from empty workflow."""
        extractor = DependencyExtractor()
        deps = extractor.extract_all({})

        assert deps["models"]["checkpoints"] == []
        assert deps["models"]["loras"] == []
        assert deps["custom_nodes"] == []
        assert deps["python_packages"] == set()

    def test_deduplicate_dependencies(self):
        """Test deduplication of dependencies."""
        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
            },
            "2": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},  # Duplicate
            },
        }

        extractor = DependencyExtractor()
        models = extractor.extract_models(workflow)

        assert len(models["checkpoints"]) == 1  # Should deduplicate

    def test_extract_requirements_txt(self):
        """Test generation of requirements.txt content."""
        workflow = {
            "1": {
                "class_type": "CustomNode",
                "_meta": {
                    "python_dependencies": ["numpy>=1.20", "opencv-python", "torch"],
                },
            },
        }

        extractor = DependencyExtractor()
        requirements = extractor.generate_requirements_txt(workflow)

        assert "numpy>=1.20" in requirements
        assert "opencv-python" in requirements
        assert "torch" in requirements

    def test_validate_model_paths(self):
        """Test validation of model file paths."""
        extractor = DependencyExtractor()

        # Valid paths
        assert extractor.validate_model_path("models/checkpoints/model.safetensors")
        assert extractor.validate_model_path("loras/style.safetensors")

        # Invalid paths (security risk)
        assert not extractor.validate_model_path("../../../etc/passwd")
        assert not extractor.validate_model_path("/etc/passwd")
        assert not extractor.validate_model_path("C:\\Windows\\System32\\config.sys")

    def test_extract_with_nested_dependencies(self):
        """Test extraction with nested/transitive dependencies."""
        workflow = {
            "1": {
                "class_type": "CustomNodeA",
                "_meta": {
                    "dependencies": ["custom_node_b"],
                    "python_dependencies": ["package_a"],
                },
            },
        }

        extractor = DependencyExtractor()
        deps = extractor.extract_all(workflow, resolve_transitive=True)

        # Should include direct dependencies
        assert "package_a" in deps["python_packages"]

    def test_categorize_dependencies(self, workflow_with_models):
        """Test categorization of dependencies by priority."""
        extractor = DependencyExtractor()
        categorized = extractor.categorize_dependencies(workflow_with_models)

        assert "required" in categorized
        assert "optional" in categorized
        assert "recommended" in categorized

    def test_generate_dockerfile_requirements(self, workflow_with_custom_nodes):
        """Test generation of Dockerfile requirements."""
        extractor = DependencyExtractor()
        dockerfile_cmds = extractor.generate_dockerfile_requirements(
            workflow_with_custom_nodes
        )

        assert any("pip install" in cmd for cmd in dockerfile_cmds)
        assert any("git clone" in cmd for cmd in dockerfile_cmds)

    def test_detect_cuda_requirements(self):
        """Test detection of CUDA/GPU requirements."""
        workflow = {
            "1": {
                "class_type": "CustomNode",
                "_meta": {
                    "python_dependencies": ["torch", "xformers", "triton"],
                },
            },
        }

        extractor = DependencyExtractor()
        cuda_info = extractor.detect_cuda_requirements(workflow)

        assert cuda_info["requires_cuda"] is True
        assert "torch" in cuda_info["cuda_packages"]
