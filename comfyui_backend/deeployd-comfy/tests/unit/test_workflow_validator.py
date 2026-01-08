"""Unit tests for WorkflowValidator module."""

import pytest

from src.workflows.validator import WorkflowValidator


class TestWorkflowValidator:
    """Test cases for WorkflowValidator class."""

    @pytest.fixture
    def valid_workflow(self):
        """A complete valid workflow."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
                "outputs": ["MODEL", "CLIP", "VAE"],
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "a beautiful landscape",
                    "clip": ["1", 1],  # Valid connection to node 1
                },
                "outputs": ["CONDITIONING"],
            },
            "3": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 512, "height": 512, "batch_size": 1},
                "outputs": ["LATENT"],
            },
            "4": {
                "class_type": "KSampler",
                "inputs": {
                    "model": ["1", 0],  # Valid connection
                    "positive": ["2", 0],  # Valid connection
                    "negative": ["2", 0],  # Valid connection
                    "latent_image": ["3", 0],  # Valid connection
                    "seed": 42,
                    "steps": 20,
                    "cfg": 7.5,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                },
                "outputs": ["LATENT"],
            },
            "5": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["4", 0],  # Valid connection
                    "vae": ["1", 2],  # Valid connection to VAE output
                },
                "outputs": ["IMAGE"],
            },
            "6": {
                "class_type": "SaveImage",
                "inputs": {
                    "images": ["5", 0],  # Valid connection
                    "filename_prefix": "output",
                },
                "outputs": [],
            },
        }

    @pytest.fixture
    def workflow_with_missing_nodes(self):
        """Workflow with references to non-existent nodes."""
        return {
            "1": {
                "class_type": "KSampler",
                "inputs": {
                    "model": ["999", 0],  # Non-existent node
                    "positive": ["2", 0],
                    "seed": 42,
                },
                "outputs": ["LATENT"],
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "test"},
                "outputs": ["CONDITIONING"],
            },
        }

    @pytest.fixture
    def workflow_with_invalid_connections(self):
        """Workflow with invalid output indices."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
                "outputs": ["MODEL", "CLIP", "VAE"],  # Has 3 outputs (0, 1, 2)
            },
            "2": {
                "class_type": "VAEDecode",
                "inputs": {
                    "vae": ["1", 5],  # Invalid output index (only 0-2 exist)
                },
                "outputs": ["IMAGE"],
            },
        }

    @pytest.fixture
    def workflow_with_circular_dependency(self):
        """Workflow with circular dependencies."""
        return {
            "1": {
                "class_type": "NodeA",
                "inputs": {"input": ["3", 0]},  # Depends on 3
                "outputs": ["OUTPUT"],
            },
            "2": {
                "class_type": "NodeB",
                "inputs": {"input": ["1", 0]},  # Depends on 1
                "outputs": ["OUTPUT"],
            },
            "3": {
                "class_type": "NodeC",
                "inputs": {"input": ["2", 0]},  # Depends on 2 -> creates cycle
                "outputs": ["OUTPUT"],
            },
        }

    @pytest.fixture
    def workflow_without_outputs(self):
        """Workflow that doesn't produce any outputs."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
                "outputs": ["MODEL", "CLIP", "VAE"],
            },
            # No SaveImage or PreviewImage nodes
        }

    def test_validate_valid_workflow(self, valid_workflow):
        """Test validation of a complete valid workflow."""
        validator = WorkflowValidator()
        result = validator.validate(valid_workflow)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert len(result.warnings) == 0
        assert result.metadata["node_count"] == 6

    def test_validate_empty_workflow(self):
        """Test validation of empty workflow."""
        validator = WorkflowValidator()
        result = validator.validate({})

        assert result.is_valid is False
        assert any("empty" in error.lower() for error in result.errors)

    def test_detect_missing_nodes(self, workflow_with_missing_nodes):
        """Test detection of references to non-existent nodes."""
        validator = WorkflowValidator()
        result = validator.validate(workflow_with_missing_nodes)

        assert result.is_valid is False
        assert any("999" in error for error in result.errors)
        assert any("non-existent" in error.lower() for error in result.errors)

    def test_detect_invalid_output_indices(self, workflow_with_invalid_connections):
        """Test detection of invalid output indices."""
        validator = WorkflowValidator()
        result = validator.validate(workflow_with_invalid_connections)

        assert result.is_valid is False
        assert any("output index" in error.lower() for error in result.errors)

    def test_detect_circular_dependencies(self, workflow_with_circular_dependency):
        """Test detection of circular dependencies."""
        validator = WorkflowValidator()
        result = validator.validate(workflow_with_circular_dependency)

        assert result.is_valid is False
        assert any("circular" in error.lower() for error in result.errors)

    def test_warn_no_output_nodes(self, workflow_without_outputs):
        """Test warning when workflow has no output nodes."""
        validator = WorkflowValidator()
        result = validator.validate(workflow_without_outputs)

        # Should be valid but with warning
        assert result.is_valid is True
        assert len(result.warnings) > 0
        assert any("output" in warning.lower() for warning in result.warnings)

    def test_validate_node_inputs_required_fields(self):
        """Test validation of required input fields."""
        workflow = {
            "1": {
                "class_type": "KSampler",
                "inputs": {
                    # Missing required fields: model, positive, negative, latent_image
                    "seed": 42,
                },
                "outputs": ["LATENT"],
            }
        }

        validator = WorkflowValidator()
        result = validator.validate(workflow)

        assert result.is_valid is False
        assert any("required" in error.lower() for error in result.errors)

    def test_validate_input_types(self):
        """Test validation of input value types."""
        workflow = {
            "1": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": "not_a_number",  # Should be int
                    "height": 512,
                    "batch_size": 1,
                },
                "outputs": ["LATENT"],
            }
        }

        validator = WorkflowValidator()
        result = validator.validate(workflow, strict_types=True)

        assert result.is_valid is False
        assert any("type" in error.lower() for error in result.errors)

    def test_validate_custom_node_warning(self):
        """Test warning for custom nodes."""
        workflow = {
            "1": {
                "class_type": "CustomNode_XYZ",  # Custom node
                "inputs": {},
                "outputs": ["OUTPUT"],
            }
        }

        validator = WorkflowValidator()
        result = validator.validate(workflow)

        assert result.is_valid is True
        assert len(result.warnings) > 0
        assert any("custom" in warning.lower() for warning in result.warnings)

    def test_validate_disconnected_nodes(self):
        """Test detection of disconnected nodes."""
        workflow = {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": "test.png"},
                "outputs": ["IMAGE"],
            },
            "2": {
                "class_type": "LoadImage",
                "inputs": {"image": "test2.png"},
                "outputs": ["IMAGE"],
            },
            # Two separate nodes with no connection
            "3": {
                "class_type": "SaveImage",
                "inputs": {"images": ["1", 0]},
                "outputs": [],
            },
            # Node 2 is not connected to anything
        }

        validator = WorkflowValidator()
        result = validator.validate(workflow)

        assert result.is_valid is True  # Valid but should warn
        assert len(result.warnings) > 0
        assert any(
            "disconnected" in warning.lower() or "unused" in warning.lower()
            for warning in result.warnings
        )

    def test_validate_with_options(self, valid_workflow):
        """Test validation with different options."""
        validator = WorkflowValidator()

        # Strict validation
        result = validator.validate(valid_workflow, strict=True)
        assert result.is_valid is True

        # Skip circular check
        result = validator.validate(valid_workflow, check_circular=False)
        assert result.is_valid is True

        # Skip connection validation
        result = validator.validate(valid_workflow, check_connections=False)
        assert result.is_valid is True

    def test_get_validation_report(self, valid_workflow):
        """Test generation of validation report."""
        validator = WorkflowValidator()
        result = validator.validate(valid_workflow)
        report = result.get_report()

        assert "valid" in report.lower()
        assert "6 nodes" in report.lower()
        assert "errors: 0" in report.lower()
        assert "warnings: 0" in report.lower()

    def test_validate_model_references(self):
        """Test validation of model file references."""
        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "../../../etc/passwd"},  # Security risk
                "outputs": ["MODEL", "CLIP", "VAE"],
            }
        }

        validator = WorkflowValidator()
        result = validator.validate(workflow)

        assert result.is_valid is False
        assert any(
            "security" in error.lower() or "invalid path" in error.lower()
            for error in result.errors
        )

    def test_validate_workflow_complexity(self, valid_workflow):
        """Test workflow complexity assessment."""
        validator = WorkflowValidator()
        result = validator.validate(valid_workflow)

        assert "complexity" in result.metadata
        assert result.metadata["complexity"]["score"] > 0
        assert result.metadata["complexity"]["level"] in [
            "simple",
            "moderate",
            "complex",
        ]

    def test_validation_performance(self):
        """Test validation performance with large workflow."""
        # Create a large workflow
        large_workflow = {}
        for i in range(100):
            large_workflow[str(i)] = {
                "class_type": "TestNode",
                "inputs": {"value": i},
                "outputs": ["OUTPUT"],
            }

        validator = WorkflowValidator()
        import time

        start = time.time()
        result = validator.validate(large_workflow)
        duration = time.time() - start

        assert result is not None
        assert duration < 1.0  # Should complete within 1 second
