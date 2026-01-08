"""Integration tests for workflow API endpoints with real ComfyUI."""

import json
import os
import pytest
import asyncio
from pathlib import Path
from fastapi.testclient import TestClient

# Import the real app without mocking
from src.api.workflow_api import app, WorkflowRequest, WorkflowResponse
from src.api.workflow_executor import WorkflowExecutor


class TestWorkflowAPI:
    """Integration test cases for workflow API endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        # Set environment variables for test
        os.environ["COMFYUI_HOST"] = "localhost"
        os.environ["COMFYUI_PORT"] = "8188"
        os.environ["WORKFLOW_PATH"] = "/home/ubuntu/exp/deeployd-comfy/tests/real_workflow.json"
        os.environ["OUTPUT_DIR"] = "/tmp/test_outputs"
        
        # Create output directory
        Path("/tmp/test_outputs").mkdir(exist_ok=True)
        
        # Initialize the app with real executor
        with TestClient(app) as client:
            yield client
    
    def test_root_endpoint(self, client):
        """Test root endpoint returns API information."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "endpoints" in data
        assert data["name"] == "ComfyUI Workflow API"
    
    def test_health_check(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "workflow-api"
    
    def test_generate_image_sync(self, client):
        """Test synchronous image generation with real ComfyUI."""
        request_data = {
            "positive_prompt": "a simple test image",
            "negative_prompt": "ugly, blurry",
            "seed": 12345,
            "width": 512,  # Smaller for faster test
            "height": 512,
            "steps": 1,    # Minimal steps for testing
            "cfg": 7.0
        }
        
        response = client.post("/api/generate", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "prompt_id" in data
        assert data["status"] in ["completed", "running", "submitted"]
        # If completed, should have images
        if data["status"] == "completed":
            assert "images" in data
    
    def test_generate_image_async(self, client):
        """Test asynchronous image generation with real ComfyUI."""
        request_data = {
            "positive_prompt": "a cat",
            "seed": 99999,
            "width": 512,
            "height": 512,
            "steps": 1
        }
        
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "prompt_id" in data
        assert data["status"] == "submitted"
    
    def test_get_status(self, client):
        """Test status check endpoint with real ComfyUI."""
        # First submit a workflow
        request_data = {
            "positive_prompt": "test",
            "seed": 11111,
            "width": 256,
            "height": 256,
            "steps": 1
        }
        
        submit_response = client.post("/api/generate?wait=false", json=request_data)
        prompt_id = submit_response.json()["prompt_id"]
        
        # Now check its status
        response = client.get(f"/api/status/{prompt_id}")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "prompt_id" in data
    
    def test_get_image(self, client):
        """Test image serving endpoint."""
        # Create a test image file
        test_image_path = Path("/tmp/test_outputs/test.png")
        test_image_path.write_bytes(b"fake png data")
        
        response = client.get("/api/images/test.png")
        # Should work with the real file
        assert response.status_code == 200
    
    def test_get_image_not_found(self, client):
        """Test image serving with non-existent file."""
        response = client.get("/api/images/nonexistent.png")
        assert response.status_code == 404
        assert response.json()["detail"] == "Image not found"
    
    def test_cancel_generation(self, client):
        """Test generation cancellation."""
        # Add job to tracking
        from src.api.workflow_api import jobs_status
        jobs_status["test-cancel-id"] = "running"
        
        response = client.post("/api/cancel/test-cancel-id")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "cancelled"
        assert data["prompt_id"] == "test-cancel-id"
    
    def test_cancel_nonexistent_job(self, client):
        """Test cancelling non-existent job."""
        response = client.post("/api/cancel/nonexistent-id")
        assert response.status_code == 404
        assert response.json()["detail"] == "Job not found"
    
    def test_workflow_request_validation(self):
        """Test WorkflowRequest model validation."""
        # Valid request
        request = WorkflowRequest(
            positive_prompt="test prompt",
            width=512,
            height=512
        )
        assert request.positive_prompt == "test prompt"
        assert request.width == 512
        
        # Test defaults
        request = WorkflowRequest(positive_prompt="test")
        assert request.seed == -1
        assert request.width == 1024
        assert request.steps == 20
    
    def test_workflow_response_model(self):
        """Test WorkflowResponse model."""
        response = WorkflowResponse(
            prompt_id="test-id",
            status="completed",
            images=["image1.png", "image2.png"]
        )
        assert response.prompt_id == "test-id"
        assert response.status == "completed"
        assert len(response.images) == 2
    
    def test_error_handling(self, client):
        """Test error handling in API."""
        # Send invalid request data (missing required field)
        request_data = {}  # Missing positive_prompt
        response = client.post("/api/generate", json=request_data)
        # Should get validation error
        assert response.status_code == 422  # Unprocessable Entity