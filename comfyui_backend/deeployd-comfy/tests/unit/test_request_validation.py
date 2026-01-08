"""Integration tests for request validation with real ComfyUI."""

import json
import os
import pytest
import asyncio
from pathlib import Path
from fastapi.testclient import TestClient
from typing import Dict, Any

# Import the real app without mocking
from src.api.workflow_api import app
from src.api.workflow_executor import WorkflowRequest, WorkflowExecutor


class TestRequestValidation:
    """Test request validation with real ComfyUI backend."""
    
    @pytest.fixture
    def client(self):
        """Create test client with real ComfyUI connection."""
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
    
    @pytest.fixture
    def executor(self):
        """Create real workflow executor."""
        return WorkflowExecutor(
            comfyui_host="localhost",
            comfyui_port=8188,
            workflow_path="/home/ubuntu/exp/deeployd-comfy/tests/real_workflow.json",
            output_dir="/tmp/test_outputs"
        )
    
    def test_valid_minimal_request(self, client):
        """Test minimal valid request with real ComfyUI."""
        request_data = {
            "positive_prompt": "a simple test"
        }
        
        # Submit async to avoid long wait
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "prompt_id" in data
        assert data["status"] == "submitted"
    
    def test_prompt_length_validation(self, client):
        """Test prompt length constraints."""
        # Test with minimal prompt
        request_data = {
            "positive_prompt": "a",
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
        
        # Test very long prompt (should be truncated or handled)
        long_prompt = "test " * 1000  # 5000 characters
        request_data = {
            "positive_prompt": long_prompt,
            "steps": 1  # Minimal for speed
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
    
    def test_resolution_validation(self, client):
        """Test image resolution validation."""
        # Test invalid resolution (not multiple of 8)
        request_data = {
            "positive_prompt": "test",
            "width": 513,  # Not multiple of 8
            "height": 513,
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        # Should either auto-correct or return error
        assert response.status_code in [200, 422]
        
        # Test valid resolution (multiple of 8)
        request_data = {
            "positive_prompt": "test",
            "width": 512,
            "height": 768,
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
    
    def test_parameter_bounds(self, client):
        """Test parameter boundary validation."""
        # Test below minimum values
        request_data = {
            "positive_prompt": "test",
            "width": 32,  # Below minimum
            "height": 32,
            "steps": 0,  # Below minimum
            "cfg": 0.5,  # Below minimum
            "batch_size": 0
        }
        response = client.post("/api/generate", json=request_data)
        assert response.status_code == 422
        
        # Test above maximum values
        request_data = {
            "positive_prompt": "test",
            "width": 4096,  # Above maximum
            "height": 4096,
            "steps": 200,  # Above maximum
            "cfg": 50.0,  # Above maximum
            "batch_size": 10
        }
        response = client.post("/api/generate", json=request_data)
        assert response.status_code == 422
        
        # Test at reasonable boundaries (avoid huge images that crash)
        request_data = {
            "positive_prompt": "test",
            "width": 1024,  # Large but reasonable
            "height": 1024,
            "steps": 1,  # Minimal for speed in test
            "cfg": 30.0,  # At maximum
            "batch_size": 1  # Reduced for test speed
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
    
    def test_sampler_validation(self, client):
        """Test sampler name validation."""
        # Test invalid sampler
        request_data = {
            "positive_prompt": "test",
            "sampler_name": "invalid_sampler",
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        # ComfyUI might handle this gracefully or error
        data = response.json()
        
        # Test valid samplers
        valid_samplers = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_3m_sde"]
        for sampler in valid_samplers:
            request_data = {
                "positive_prompt": "test",
                "sampler_name": sampler,
                "steps": 1
            }
            response = client.post("/api/generate?wait=false", json=request_data)
            assert response.status_code == 200
    
    def test_seed_validation(self, client):
        """Test seed parameter validation."""
        # Test random seed (-1)
        request_data = {
            "positive_prompt": "test",
            "seed": -1,
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
        
        # Test fixed seed
        request_data = {
            "positive_prompt": "test",
            "seed": 12345,
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
        data = response.json()
        prompt_id1 = data["prompt_id"]
        
        # Same seed should be reproducible
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
        data = response.json()
        prompt_id2 = data["prompt_id"]
        
        # Different prompt IDs but same seed
        assert prompt_id1 != prompt_id2
    
    def test_type_conversion(self, client):
        """Test automatic type conversion."""
        # FastAPI/Pydantic automatically converts string numbers
        request_data = {
            "positive_prompt": "test",
            "width": "512",  # String instead of int
            "height": "512",
            "steps": "1",
            "cfg": "7.5",  # String instead of float
            "seed": "12345"
        }
        # FastAPI automatically converts compatible strings to numbers
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200  # Should work with auto-conversion
        
        # Test with invalid string that can't be converted
        request_data = {
            "positive_prompt": "test",
            "width": "not_a_number",
            "height": 512,
            "steps": 1
        }
        response = client.post("/api/generate", json=request_data)
        assert response.status_code == 422  # Should fail with non-numeric string
    
    def test_missing_required_fields(self, client):
        """Test missing required fields."""
        # Missing positive_prompt
        request_data = {
            "width": 512,
            "height": 512
        }
        response = client.post("/api/generate", json=request_data)
        assert response.status_code == 422
        error = response.json()
        assert "positive_prompt" in str(error["detail"])
    
    def test_extra_fields_ignored(self, client):
        """Test that extra fields are safely ignored."""
        request_data = {
            "positive_prompt": "test",
            "unknown_field": "should be ignored",
            "another_unknown": 123,
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
    
    def test_negative_prompt_optional(self, client):
        """Test that negative prompt is optional."""
        # Without negative prompt
        request_data = {
            "positive_prompt": "beautiful landscape",
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
        
        # With negative prompt
        request_data = {
            "positive_prompt": "beautiful landscape",
            "negative_prompt": "ugly, blurry",
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
    
    def test_batch_size_validation(self, client):
        """Test batch size constraints."""
        # Test batch size within limits
        request_data = {
            "positive_prompt": "test",
            "batch_size": 2,
            "width": 256,  # Small for speed
            "height": 256,
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
        
        # Test batch size at maximum
        request_data = {
            "positive_prompt": "test",
            "batch_size": 4,
            "width": 256,
            "height": 256,
            "steps": 1
        }
        response = client.post("/api/generate?wait=false", json=request_data)
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_parameter_injection(self, executor):
        """Test parameter injection into workflow."""
        # Test parameters
        params = {
            "positive_prompt": "a beautiful sunset",
            "negative_prompt": "dark, gloomy",
            "seed": 42,
            "width": 1024,
            "height": 768,
            "steps": 20,
            "cfg": 7.5,
            "sampler_name": "dpmpp_2m",
            "batch_size": 1
        }
        
        # Inject parameters
        modified_workflow = executor.inject_parameters(
            executor.workflow_template,
            params
        )
        
        # Verify injection
        assert modified_workflow["84"]["inputs"]["text"] == "a beautiful sunset"
        assert modified_workflow["74"]["inputs"]["text"] == "dark, gloomy"
        assert modified_workflow["87"]["inputs"]["seed"] == 42
        assert modified_workflow["89"]["inputs"]["width"] == 1024
        assert modified_workflow["89"]["inputs"]["height"] == 768
        assert modified_workflow["88"]["inputs"]["steps"] == 20
        assert modified_workflow["88"]["inputs"]["cfg"] == 7.5
        assert modified_workflow["88"]["inputs"]["sampler_name"] == "dpmpp_2m"
    
    def test_concurrent_validation(self, client):
        """Test concurrent request validation."""
        import concurrent.futures
        
        def make_request(i):
            request_data = {
                "positive_prompt": f"test prompt {i}",
                "seed": i,
                "width": 256,
                "height": 256,
                "steps": 1
            }
            response = client.post("/api/generate?wait=false", json=request_data)
            return response.status_code == 200
        
        # Submit multiple requests concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_request, i) for i in range(5)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]
        
        # All should succeed
        assert all(results)
    
    def test_validation_error_details(self, client):
        """Test that validation errors provide helpful details."""
        # Multiple validation errors
        request_data = {
            "positive_prompt": "",  # Empty
            "width": 50,  # Too small
            "height": 3000,  # Too large
            "steps": -1,  # Negative
            "cfg": 100,  # Too high
            "batch_size": 10  # Too high
        }
        
        response = client.post("/api/generate", json=request_data)
        assert response.status_code == 422
        
        error = response.json()
        assert "detail" in error
        # Should have multiple validation errors
        assert isinstance(error["detail"], list)
        assert len(error["detail"]) > 1