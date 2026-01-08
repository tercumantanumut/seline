"""Tests for validation middleware with real ComfyUI."""

import pytest
import asyncio
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, AsyncMock

from src.api.validators import (
    EnhancedWorkflowRequest,
    ValidationMiddleware,
    sanitize_prompt,
    validate_image_dimensions,
    validate_batch_size,
    FileUploadValidator,
    VALID_SAMPLERS,
    VALID_SCHEDULERS
)


class TestEnhancedWorkflowRequest:
    """Test enhanced workflow request validation."""
    
    def test_valid_request(self):
        """Test valid request creation."""
        request = EnhancedWorkflowRequest(
            positive_prompt="a beautiful landscape",
            negative_prompt="ugly, blurry",
            seed=12345,
            width=512,
            height=768,
            steps=20,
            cfg=7.5,
            sampler_name="euler",
            scheduler="normal",
            batch_size=1
        )
        assert request.positive_prompt == "a beautiful landscape"
        assert request.width == 512
        assert request.height == 768
    
    def test_empty_prompt_validation(self):
        """Test empty prompt is rejected."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError, match="at least 1 character"):
            EnhancedWorkflowRequest(positive_prompt="")
        
        with pytest.raises(ValueError, match="Positive prompt cannot be empty"):
            EnhancedWorkflowRequest(positive_prompt="   ")
    
    def test_prompt_whitespace_normalization(self):
        """Test prompt whitespace is normalized."""
        request = EnhancedWorkflowRequest(
            positive_prompt="  multiple   spaces   here  "
        )
        assert request.positive_prompt == "multiple spaces here"
        
        # Test with negative prompt
        request = EnhancedWorkflowRequest(
            positive_prompt="test",
            negative_prompt="  extra   spaces  "
        )
        assert request.negative_prompt == "extra spaces"
    
    def test_dimension_rounding(self):
        """Test dimensions are rounded to multiples of 8."""
        request = EnhancedWorkflowRequest(
            positive_prompt="test",
            width=513,  # Not multiple of 8
            height=767   # Not multiple of 8
        )
        assert request.width == 512  # Rounded down
        assert request.height == 768  # Rounded up
    
    def test_invalid_sampler(self):
        """Test invalid sampler is rejected."""
        with pytest.raises(ValueError, match="Invalid sampler 'invalid_sampler'"):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                sampler_name="invalid_sampler"
            )
    
    def test_valid_samplers(self):
        """Test all valid samplers are accepted."""
        for sampler in ["euler", "dpmpp_2m", "dpmpp_3m_sde", "ddim"]:
            request = EnhancedWorkflowRequest(
                positive_prompt="test",
                sampler_name=sampler
            )
            assert request.sampler_name == sampler
    
    def test_invalid_scheduler(self):
        """Test invalid scheduler is rejected."""
        with pytest.raises(ValueError, match="Invalid scheduler 'invalid'"):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                scheduler="invalid"
            )
    
    def test_resolution_limit(self):
        """Test total resolution limit."""
        # This should work (just under 4 megapixels)
        request = EnhancedWorkflowRequest(
            positive_prompt="test",
            width=2048,
            height=2048
        )
        assert request.width == 2048
        
        # This should fail (height exceeds 2048 limit)
        from pydantic import ValidationError
        with pytest.raises(ValidationError, match="less than or equal to 2048"):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                width=2048,
                height=2056  # Exceeds max height
            )
    
    def test_seed_validation(self):
        """Test seed value validation."""
        # Valid seeds
        for seed in [-1, 0, 12345, 2**32-1]:
            request = EnhancedWorkflowRequest(
                positive_prompt="test",
                seed=seed
            )
            assert request.seed == seed
        
        # Invalid seeds
        with pytest.raises(ValueError):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                seed=-2
            )
        
        with pytest.raises(ValueError):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                seed=2**32
            )
    
    def test_parameter_ranges(self):
        """Test parameter range validation."""
        # Test steps range
        request = EnhancedWorkflowRequest(
            positive_prompt="test",
            steps=1
        )
        assert request.steps == 1
        
        request = EnhancedWorkflowRequest(
            positive_prompt="test",
            steps=100
        )
        assert request.steps == 100
        
        with pytest.raises(ValueError):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                steps=0
            )
        
        with pytest.raises(ValueError):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                steps=101
            )
        
        # Test CFG range
        request = EnhancedWorkflowRequest(
            positive_prompt="test",
            cfg=1.0
        )
        assert request.cfg == 1.0
        
        request = EnhancedWorkflowRequest(
            positive_prompt="test",
            cfg=30.0
        )
        assert request.cfg == 30.0
        
        with pytest.raises(ValueError):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                cfg=0.5
            )
        
        with pytest.raises(ValueError):
            EnhancedWorkflowRequest(
                positive_prompt="test",
                cfg=31.0
            )


class TestValidationFunctions:
    """Test standalone validation functions."""
    
    def test_sanitize_prompt(self):
        """Test prompt sanitization."""
        # Test removing dangerous characters
        prompt = "test`command$injection\\here"
        sanitized = sanitize_prompt(prompt)
        assert "`" not in sanitized
        assert "$" not in sanitized
        assert "\\" not in sanitized
        
        # Test whitespace normalization
        prompt = "multiple\n\nspaces\t\there"
        sanitized = sanitize_prompt(prompt)
        assert sanitized == "multiple spaces here"
        
        # Test length truncation
        long_prompt = "a" * 6000
        sanitized = sanitize_prompt(long_prompt)
        assert len(sanitized) == 5000
    
    def test_validate_image_dimensions(self):
        """Test image dimension validation."""
        # Test rounding to multiples of 8
        width, height = validate_image_dimensions(513, 767)
        assert width == 512
        assert height == 768
        
        # Test clamping to limits
        width, height = validate_image_dimensions(50, 3000)
        assert width == 64  # Min
        assert height == 2048  # Max
        
        # Test valid dimensions pass through
        width, height = validate_image_dimensions(512, 768)
        assert width == 512
        assert height == 768
    
    def test_validate_batch_size(self):
        """Test batch size validation based on resolution."""
        # Small resolution allows larger batch
        batch = validate_batch_size(4, 256, 256)
        assert batch == 4
        
        # Medium resolution reduces batch
        batch = validate_batch_size(4, 768, 768)
        assert batch == 3
        
        # Large resolution limits batch
        batch = validate_batch_size(4, 1536, 1536)
        assert batch == 2
        
        # Already valid batch passes through
        batch = validate_batch_size(1, 2048, 2048)
        assert batch == 1


class TestValidationMiddleware:
    """Test validation middleware."""
    
    @pytest.fixture
    def middleware(self):
        """Create middleware instance."""
        return ValidationMiddleware()
    
    @pytest.fixture
    def app_with_middleware(self, middleware):
        """Create test app with middleware."""
        app = FastAPI()
        
        @app.middleware("http")
        async def add_validation_middleware(request: Request, call_next):
            return await middleware(request, call_next)
        
        @app.get("/test")
        async def test_endpoint():
            return {"status": "ok"}
        
        return app
    
    def test_normal_request(self, app_with_middleware):
        """Test normal request passes through."""
        client = TestClient(app_with_middleware)
        response = client.get("/test")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
    
    @pytest.mark.asyncio
    async def test_concurrent_request_limit(self, middleware):
        """Test concurrent request limiting."""
        middleware.max_concurrent_requests = 2
        middleware.active_requests = 2  # Already at limit
        
        # Mock request and call_next
        request = MagicMock(spec=Request)
        call_next = AsyncMock()
        
        # Should return 503
        response = await middleware(request, call_next)
        assert response.status_code == 503
        assert "Too many concurrent requests" in response.body.decode()
        
        # Should not have called the next handler
        call_next.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_request_counter(self, middleware):
        """Test request counter increment/decrement."""
        middleware.active_requests = 0
        
        request = MagicMock(spec=Request)
        # Make call_next take some time so we can check the counter
        async def slow_handler(req):
            await asyncio.sleep(0.1)
            return MagicMock()
        
        call_next = slow_handler
        
        # Start request
        task = asyncio.create_task(middleware(request, call_next))
        await asyncio.sleep(0.01)  # Let it start and increment counter
        
        # Counter should be incremented
        assert middleware.active_requests == 1
        
        # Finish request
        await task
        
        # Counter should be decremented
        assert middleware.active_requests == 0


class TestFileUploadValidator:
    """Test file upload validation."""
    
    def test_valid_image_types(self):
        """Test valid image content types."""
        valid_types = ['image/png', 'image/jpeg', 'image/webp']
        for content_type in valid_types:
            # Create small valid PNG
            png_header = b'\x89PNG\r\n\x1a\n'
            try:
                # This will fail on actual image verification, but tests content type check
                FileUploadValidator.validate_image_upload(png_header, content_type)
            except Exception as e:
                # Should fail on image verification, not content type
                assert "Invalid image file" in str(e)
    
    def test_invalid_content_type(self):
        """Test invalid content types are rejected."""
        with pytest.raises(Exception) as exc_info:
            FileUploadValidator.validate_image_upload(b"data", "text/plain")
        assert "Unsupported file type" in str(exc_info.value)
    
    def test_file_size_limit(self):
        """Test file size limit."""
        large_file = b"x" * (21 * 1024 * 1024)  # 21MB
        with pytest.raises(Exception) as exc_info:
            FileUploadValidator.validate_image_upload(large_file, "image/png")
        assert "File too large" in str(exc_info.value)
    
    def test_valid_png_upload(self):
        """Test valid PNG upload."""
        # Create a minimal valid PNG
        from PIL import Image
        import io
        
        img = Image.new('RGB', (100, 100), color='red')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        png_data = buffer.getvalue()
        
        # Should validate successfully
        result = FileUploadValidator.validate_image_upload(png_data, "image/png")
        assert result is True
    
    def test_image_dimension_limit(self):
        """Test image dimension limits."""
        from PIL import Image
        import io
        
        # Create image that's too large
        img = Image.new('RGB', (5000, 5000), color='red')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        png_data = buffer.getvalue()
        
        with pytest.raises(Exception) as exc_info:
            FileUploadValidator.validate_image_upload(png_data, "image/png")
        assert "dimensions too large" in str(exc_info.value)