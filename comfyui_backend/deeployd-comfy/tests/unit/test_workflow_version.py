"""Unit tests for WorkflowVersion module."""

from datetime import datetime

import pytest

from src.workflows.version import VersionManager, WorkflowVersion


class TestWorkflowVersion:
    """Test cases for WorkflowVersion class."""

    @pytest.fixture
    def sample_workflow(self):
        """Sample workflow for testing."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model.safetensors"},
                "outputs": ["MODEL", "CLIP", "VAE"],
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "test prompt", "clip": ["1", 1]},
                "outputs": ["CONDITIONING"],
            },
        }

    @pytest.fixture
    def modified_workflow(self):
        """Modified version of sample workflow."""
        return {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "model_v2.safetensors"},  # Changed model
                "outputs": ["MODEL", "CLIP", "VAE"],
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "updated prompt",
                    "clip": ["1", 1],
                },  # Changed prompt
                "outputs": ["CONDITIONING"],
            },
            "3": {  # New node added
                "class_type": "SaveImage",
                "inputs": {"images": ["2", 0]},
                "outputs": [],
            },
        }

    def test_create_workflow_version(self, sample_workflow):
        """Test creating a workflow version."""
        version = WorkflowVersion(
            workflow=sample_workflow, version="1.0.0", message="Initial version"
        )

        assert version.workflow == sample_workflow
        assert version.version == "1.0.0"
        assert version.message == "Initial version"
        assert version.hash is not None
        assert len(version.hash) == 40  # SHA-1 hash length
        assert version.timestamp is not None

    def test_version_hash_generation(self, sample_workflow):
        """Test that hash is generated consistently."""
        version1 = WorkflowVersion(sample_workflow, "1.0.0")
        version2 = WorkflowVersion(sample_workflow, "1.0.0")

        # Same workflow should generate same hash
        assert version1.hash == version2.hash

    def test_different_workflows_different_hash(
        self, sample_workflow, modified_workflow
    ):
        """Test that different workflows generate different hashes."""
        version1 = WorkflowVersion(sample_workflow, "1.0.0")
        version2 = WorkflowVersion(modified_workflow, "1.0.1")

        assert version1.hash != version2.hash

    def test_version_to_dict(self, sample_workflow):
        """Test conversion to dictionary."""
        version = WorkflowVersion(
            workflow=sample_workflow, version="1.0.0", message="Test version"
        )

        version_dict = version.to_dict()

        assert "workflow" in version_dict
        assert "version" in version_dict
        assert "hash" in version_dict
        assert "message" in version_dict
        assert "timestamp" in version_dict
        assert "parent_hash" in version_dict

    def test_version_from_dict(self, sample_workflow):
        """Test creation from dictionary."""
        version_data = {
            "workflow": sample_workflow,
            "version": "1.0.0",
            "hash": "abc123",
            "message": "Test",
            "timestamp": datetime.now().isoformat(),
            "parent_hash": None,
        }

        version = WorkflowVersion.from_dict(version_data)

        assert version.workflow == sample_workflow
        assert version.version == "1.0.0"
        assert version.hash == "abc123"

    def test_version_with_parent(self, sample_workflow, modified_workflow):
        """Test version with parent reference."""
        parent = WorkflowVersion(sample_workflow, "1.0.0")
        child = WorkflowVersion(
            workflow=modified_workflow, version="1.0.1", parent_hash=parent.hash
        )

        assert child.parent_hash == parent.hash
        assert child.hash != parent.hash


class TestVersionManager:
    """Test cases for VersionManager class."""

    @pytest.fixture
    def version_manager(self):
        """Create a version manager instance."""
        return VersionManager()

    @pytest.fixture
    def sample_workflow(self):
        """Sample workflow for testing."""
        return {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": "test.png"},
                "outputs": ["IMAGE"],
            }
        }

    def test_add_version(self, version_manager, sample_workflow):
        """Test adding a new version."""
        version = version_manager.add_version(
            workflow=sample_workflow, message="Initial commit"
        )

        assert version is not None
        assert version.version == "1.0.0"
        assert len(version_manager.versions) == 1

    def test_auto_increment_version(self, version_manager, sample_workflow):
        """Test automatic version numbering."""
        v1 = version_manager.add_version(sample_workflow, "First")
        v2 = version_manager.add_version(sample_workflow, "Second")
        v3 = version_manager.add_version(sample_workflow, "Third")

        assert v1.version == "1.0.0"
        assert v2.version == "1.0.1"
        assert v3.version == "1.0.2"

    def test_get_version_by_hash(self, version_manager, sample_workflow):
        """Test retrieving version by hash."""
        version = version_manager.add_version(sample_workflow, "Test")
        retrieved = version_manager.get_version(version.hash)

        assert retrieved is not None
        assert retrieved.hash == version.hash

    def test_get_version_by_version_string(self, version_manager, sample_workflow):
        """Test retrieving version by version string."""
        version_manager.add_version(sample_workflow, "Test")
        retrieved = version_manager.get_version("1.0.0")

        assert retrieved is not None
        assert retrieved.version == "1.0.0"

    def test_get_latest_version(self, version_manager, sample_workflow):
        """Test getting the latest version."""
        version_manager.add_version(sample_workflow, "First")
        version_manager.add_version(sample_workflow, "Second")
        v3 = version_manager.add_version(sample_workflow, "Third")

        latest = version_manager.get_latest()

        assert latest == v3
        assert latest.version == "1.0.2"

    def test_list_versions(self, version_manager, sample_workflow):
        """Test listing all versions."""
        v1 = version_manager.add_version(sample_workflow, "First")
        v2 = version_manager.add_version(sample_workflow, "Second")

        versions = version_manager.list_versions()

        assert len(versions) == 2
        assert v1 in versions
        assert v2 in versions

    def test_get_diff(self, version_manager, sample_workflow):
        """Test getting differences between versions."""
        workflow_v2 = {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": "updated.png"},  # Changed
                "outputs": ["IMAGE"],
            },
            "2": {  # New node
                "class_type": "SaveImage",
                "inputs": {"images": ["1", 0]},
                "outputs": [],
            },
        }

        v1 = version_manager.add_version(sample_workflow, "Version 1")
        v2 = version_manager.add_version(workflow_v2, "Version 2")

        diff = version_manager.get_diff(v1.hash, v2.hash)

        assert "added" in diff
        assert "2" in diff["added"]  # Node 2 was added
        assert "modified" in diff
        assert "1" in diff["modified"]  # Node 1 was modified
        assert "removed" in diff

    def test_checkout_version(self, version_manager, sample_workflow):
        """Test checking out a specific version."""
        workflow_v2 = {"2": {"class_type": "TestNode"}}

        v1 = version_manager.add_version(sample_workflow, "Version 1")
        v2 = version_manager.add_version(workflow_v2, "Version 2")

        # Current should be v2
        assert version_manager.get_current() == v2

        # Checkout v1
        version_manager.checkout(v1.hash)
        assert version_manager.get_current() == v1

    def test_version_history(self, version_manager, sample_workflow):
        """Test getting version history."""
        v1 = version_manager.add_version(sample_workflow, "Initial")
        v2 = version_manager.add_version(sample_workflow, "Update 1")
        v3 = version_manager.add_version(sample_workflow, "Update 2")

        history = version_manager.get_history()

        assert len(history) == 3
        # History should be in reverse chronological order
        assert history[0] == v3
        assert history[1] == v2
        assert history[2] == v1

    def test_rollback(self, version_manager, sample_workflow):
        """Test rolling back to previous version."""
        workflow_v2 = {"2": {"class_type": "TestNode"}}
        workflow_v3 = {"3": {"class_type": "AnotherNode"}}

        v1 = version_manager.add_version(sample_workflow, "Version 1")
        v2 = version_manager.add_version(workflow_v2, "Version 2")
        version_manager.add_version(workflow_v3, "Version 3")

        # Rollback once
        rolled_back = version_manager.rollback()
        assert rolled_back == v2

        # Rollback again
        rolled_back = version_manager.rollback()
        assert rolled_back == v1

    def test_export_import_versions(self, version_manager, sample_workflow, tmp_path):
        """Test exporting and importing version history."""
        version_manager.add_version(sample_workflow, "Version 1")
        version_manager.add_version(sample_workflow, "Version 2")

        # Export to file
        export_file = tmp_path / "versions.json"
        version_manager.export_to_file(str(export_file))

        assert export_file.exists()

        # Create new manager and import
        new_manager = VersionManager()
        new_manager.import_from_file(str(export_file))

        assert len(new_manager.versions) == 2
        assert new_manager.get_version("1.0.0") is not None
        assert new_manager.get_version("1.0.1") is not None

    def test_semantic_versioning(self, version_manager, sample_workflow):
        """Test semantic versioning support."""
        v1 = version_manager.add_version(sample_workflow, "Initial", version="1.0.0")
        v2 = version_manager.add_version(sample_workflow, "Patch", version="1.0.1")
        v3 = version_manager.add_version(sample_workflow, "Minor", version="1.1.0")
        v4 = version_manager.add_version(sample_workflow, "Major", version="2.0.0")

        assert v1.version == "1.0.0"
        assert v2.version == "1.0.1"
        assert v3.version == "1.1.0"
        assert v4.version == "2.0.0"

    def test_tag_version(self, version_manager, sample_workflow):
        """Test tagging versions."""
        version = version_manager.add_version(sample_workflow, "Release candidate")
        version_manager.tag_version(version.hash, "v1.0.0-rc1")

        tagged = version_manager.get_version("v1.0.0-rc1")
        assert tagged == version

    def test_branch_versions(self, version_manager, sample_workflow):
        """Test branching version history."""
        v1 = version_manager.add_version(sample_workflow, "Main branch")

        # Create a branch
        version_manager.create_branch("feature")
        v2 = version_manager.add_version(sample_workflow, "Feature work")

        assert v2.parent_hash == v1.hash
        assert version_manager.current_branch == "feature"

        # Switch back to main
        version_manager.checkout_branch("main")
        assert version_manager.get_current() == v1
