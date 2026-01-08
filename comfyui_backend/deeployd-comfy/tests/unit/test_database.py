"""Tests for database operations."""

import json
import tempfile
from pathlib import Path

import pytest
from sqlmodel import Session

from src.db.database import Database, init_db
from src.db.models import Workflow, ContainerBuild, CustomNode
from src.db.repositories import WorkflowRepository, BuildRepository, CustomNodeRepository


@pytest.fixture
def test_db():
    """Create a test database."""
    # Create temporary directory for test database
    temp_dir = tempfile.mkdtemp()
    db_path = Path(temp_dir) / "test.db"
    
    db_url = f"sqlite:///{db_path}"
    db = init_db(db_url, create_tables=True)
    
    yield db
    
    # Cleanup
    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def session(test_db):
    """Get a test database session."""
    from sqlmodel import Session
    session = Session(test_db.engine)
    yield session
    session.close()


class TestWorkflowRepository:
    """Test workflow CRUD operations."""
    
    def test_create_workflow(self, session):
        """Test creating a workflow."""
        repo = WorkflowRepository(session)
        
        workflow = repo.create(
            name="test-workflow",
            definition={"nodes": {"1": {"class_type": "TestNode"}}},
            dependencies={"custom_nodes": ["TestNode"]},
            parameters=[{"name": "param1", "type": "string"}],
            description="Test workflow"
        )
        
        assert workflow.id is not None
        assert workflow.name == "test-workflow"
        assert workflow.version == 1
        assert workflow.definition["nodes"]["1"]["class_type"] == "TestNode"
    
    def test_get_workflow(self, test_db):
        """Test retrieving a workflow."""
        from sqlmodel import Session
        with Session(test_db.engine) as session:
            repo = WorkflowRepository(session)
            
            # Create workflow
            created = repo.create(
                name="test-workflow",
                definition={"test": "data"}
            )
            
            # Get by ID
            retrieved = repo.get(created.id)
            assert retrieved is not None
            assert retrieved.id == created.id
            assert retrieved.name == "test-workflow"
            
            # Get by name
            by_name = repo.get_by_name("test-workflow")
            assert by_name is not None
            assert by_name.id == created.id
    
    def test_update_workflow(self, session):
        """Test updating a workflow."""
        repo = WorkflowRepository(session)
        
        # Create workflow
        workflow = repo.create(
            name="test-workflow",
            definition={"version": 1}
        )
        
        # Update it
        updated = repo.update(
            workflow.id,
            definition={"version": 2},
            version_message="Updated to v2"
        )
        
        assert updated is not None
        assert updated.version == 2
        assert updated.definition["version"] == 2
    
    def test_list_workflows(self, session):
        """Test listing workflows."""
        repo = WorkflowRepository(session)
        
        # Create multiple workflows
        for i in range(5):
            repo.create(
                name=f"workflow-{i}",
                definition={"index": i}
            )
        
        # List all
        workflows = repo.list(limit=10)
        assert len(workflows) == 5
        
        # List with filter
        filtered = repo.list(name_filter="workflow-2")
        assert len(filtered) == 1
        assert filtered[0].name == "workflow-2"
    
    def test_delete_workflow(self, session):
        """Test deleting a workflow."""
        repo = WorkflowRepository(session)
        
        # Create workflow
        workflow = repo.create(
            name="to-delete",
            definition={}
        )
        
        # Delete it
        deleted = repo.delete(workflow.id)
        assert deleted is True
        
        # Verify it's gone
        retrieved = repo.get(workflow.id)
        assert retrieved is None


class TestBuildRepository:
    """Test container build operations."""
    
    def test_create_build(self, session):
        """Test creating a build record."""
        # First create a workflow
        workflow_repo = WorkflowRepository(session)
        workflow = workflow_repo.create(
            name="test-workflow",
            definition={}
        )
        
        # Create a build
        build_repo = BuildRepository(session)
        build = build_repo.create_build(
            workflow_id=workflow.id,
            image_name="test-image",
            tag="v1.0",
            dockerfile="FROM python:3.12"
        )
        
        assert build.id is not None
        assert build.workflow_id == workflow.id
        assert build.image_name == "test-image"
        assert build.build_status == "pending"
    
    def test_update_build_status(self, session):
        """Test updating build status."""
        # Create workflow and build
        workflow_repo = WorkflowRepository(session)
        workflow = workflow_repo.create(name="test", definition={})
        
        build_repo = BuildRepository(session)
        build = build_repo.create_build(
            workflow_id=workflow.id,
            image_name="test-image"
        )
        
        # Update status
        updated = build_repo.update_build_status(
            build.id,
            status="success",
            logs="Build completed",
            image_size=1024000
        )
        
        assert updated is not None
        assert updated.build_status == "success"
        assert updated.image_size == 1024000
        assert updated.completed_at is not None
        assert updated.build_duration is not None
    
    def test_get_build_history(self, session):
        """Test getting build history."""
        # Create workflow
        workflow_repo = WorkflowRepository(session)
        workflow = workflow_repo.create(name="test", definition={})
        
        # Create multiple builds
        build_repo = BuildRepository(session)
        for i in range(3):
            build = build_repo.create_build(
                workflow_id=workflow.id,
                image_name=f"image-{i}"
            )
            build_repo.update_build_status(
                build.id,
                status="success" if i < 2 else "failed"
            )
        
        # Get history
        history = build_repo.get_build_history(workflow_id=workflow.id)
        assert len(history) == 3
        
        # Get latest successful
        latest = build_repo.get_latest_successful_build(workflow.id)
        assert latest is not None
        assert latest.image_name == "image-1"  # Last successful


class TestCustomNodeRepository:
    """Test custom node registry."""
    
    def test_register_node(self, session):
        """Test registering a custom node."""
        repo = CustomNodeRepository(session)
        
        node = repo.register_node(
            repository_url="https://github.com/test/node",
            commit_hash="abc123",
            node_types=["TestNode1", "TestNode2"],
            python_dependencies=["numpy", "torch"]
        )
        
        assert node.id is not None
        assert node.repository_url == "https://github.com/test/node"
        assert len(node.node_types) == 2
        assert "TestNode1" in node.node_types
    
    def test_find_by_node_type(self, session):
        """Test finding node by type."""
        repo = CustomNodeRepository(session)
        
        # Register node
        repo.register_node(
            repository_url="https://github.com/test/node",
            commit_hash="abc123",
            node_types=["UniqueNodeType"]
        )
        
        # Find it
        found = repo.find_by_node_type("UniqueNodeType")
        assert found is not None
        assert "UniqueNodeType" in found.node_types
        
        # Not found
        not_found = repo.find_by_node_type("NonExistent")
        assert not_found is None