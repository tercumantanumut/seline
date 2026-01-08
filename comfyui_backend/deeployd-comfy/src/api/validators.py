"""Request validation middleware and custom validators for workflow API."""

import logging
import re
import typing as t
from typing import Any

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


# Valid sampler names from ComfyUI
VALID_SAMPLERS = [
    "euler",
    "euler_ancestral",
    "heun",
    "heunpp2",
    "dpm_2",
    "dpm_2_ancestral",
    "lms",
    "dpm_fast",
    "dpm_adaptive",
    "dpmpp_2s_ancestral",
    "dpmpp_sde",
    "dpmpp_sde_gpu",
    "dpmpp_2m",
    "dpmpp_2m_sde",
    "dpmpp_2m_sde_gpu",
    "dpmpp_3m_sde",
    "dpmpp_3m_sde_gpu",
    "ddpm",
    "lcm",
    "ddim",
    "uni_pc",
    "uni_pc_bh2",
]

VALID_SCHEDULERS = [
    "normal",
    "karras",
    "exponential",
    "sgm_uniform",
    "simple",
    "ddim_uniform",
]


class EnhancedWorkflowRequest(BaseModel):  # type: ignore[no-any-unimported]
    """Enhanced workflow request with additional validation."""

    positive_prompt: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Positive prompt for image generation",
    )
    negative_prompt: str | None = Field(
        None, max_length=5000, description="Negative prompt for image generation"
    )
    seed: int | None = Field(
        -1, ge=-1, le=2**32 - 1, description="Random seed (-1 for random)"
    )
    width: int | None = Field(
        1024, ge=64, le=2048, description="Image width (must be multiple of 8)"
    )
    height: int | None = Field(
        1024, ge=64, le=2048, description="Image height (must be multiple of 8)"
    )
    steps: int | None = Field(20, ge=1, le=100, description="Number of sampling steps")
    cfg: float | None = Field(7.0, ge=1.0, le=30.0, description="CFG scale")
    sampler_name: str | None = Field("euler", description="Sampler algorithm name")
    scheduler: str | None = Field("simple", description="Scheduler type")
    batch_size: int | None = Field(1, ge=1, le=4, description="Batch size")
    denoise: float | None = Field(1.0, ge=0.0, le=1.0, description="Denoising strength")

    @field_validator("positive_prompt")
    @classmethod
    def validate_positive_prompt(cls, v: str) -> str:
        """Validate positive prompt."""
        if not v or not v.strip():
            raise ValueError("Positive prompt cannot be empty")
        # Remove excessive whitespace
        v = " ".join(v.split())
        return v

    @field_validator("negative_prompt")
    @classmethod
    def validate_negative_prompt(cls, v: str | None) -> str | None:
        """Validate negative prompt."""
        if v:
            # Remove excessive whitespace
            v = " ".join(v.split())
        return v

    @field_validator("width", "height")
    @classmethod
    def validate_dimensions(cls, v: int) -> int:
        """Ensure dimensions are multiples of 8."""
        if v % 8 != 0:
            # Round to nearest multiple of 8
            v = ((v + 4) // 8) * 8
            logger.warning(f"Dimension adjusted to {v} (multiple of 8)")
        return v

    @field_validator("sampler_name")
    @classmethod
    def validate_sampler(cls, v: str) -> str:
        """Validate sampler name."""
        if v not in VALID_SAMPLERS:
            raise ValueError(
                f"Invalid sampler '{v}'. Valid options: {', '.join(VALID_SAMPLERS)}"
            )
        return v

    @field_validator("scheduler")
    @classmethod
    def validate_scheduler(cls, v: str) -> str:
        """Validate scheduler type."""
        if v not in VALID_SCHEDULERS:
            raise ValueError(
                f"Invalid scheduler '{v}'. Valid options: {', '.join(VALID_SCHEDULERS)}"
            )
        return v

    @model_validator(mode="after")
    def validate_resolution(self) -> "EnhancedWorkflowRequest":
        """Validate total resolution doesn't exceed limits."""
        if self.width is None or self.height is None:
            return self

        total_pixels = self.width * self.height
        max_pixels = 2048 * 2048  # 4 megapixels

        if total_pixels > max_pixels:
            raise ValueError(
                f"Total resolution ({total_pixels} pixels) exceeds maximum ({max_pixels} pixels)"
            )

        # Warn about high memory usage
        if total_pixels > 1024 * 1024 and self.batch_size and self.batch_size > 1:
            logger.warning(
                f"High memory usage: {total_pixels} pixels with batch size {self.batch_size}"
            )

        return self


class ValidationMiddleware:
    """Middleware for request validation and sanitization."""

    def __init__(self) -> None:
        """Initialize validation middleware."""
        self.max_concurrent_requests = 10
        self.active_requests = 0

    async def __call__(
        self, request: Any, call_next: t.Callable[[Any], t.Awaitable[Any]]
    ) -> t.Any:
        """Process request with validation."""
        # Check concurrent request limit
        if self.active_requests >= self.max_concurrent_requests:
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Too many concurrent requests. Please try again later."
                },
            )

        self.active_requests += 1
        try:
            # Process request
            response = await call_next(request)
            return response
        finally:
            self.active_requests -= 1


def sanitize_prompt(prompt: str) -> str:
    """Sanitize user prompt to prevent injection attacks."""
    # Remove potential command injection characters
    dangerous_chars = ["`", "$", "\\", "\n", "\r", "\t"]
    for char in dangerous_chars:
        prompt = prompt.replace(char, " ")

    # Limit consecutive spaces
    prompt = re.sub(r"\s+", " ", prompt)

    # Trim to reasonable length
    max_length = 5000
    if len(prompt) > max_length:
        prompt = prompt[:max_length]
        logger.warning(f"Prompt truncated to {max_length} characters")

    return prompt.strip()


def validate_image_dimensions(width: int, height: int) -> tuple[int, int]:
    """Validate and adjust image dimensions."""
    # Ensure multiples of 8
    width = ((width + 4) // 8) * 8
    height = ((height + 4) // 8) * 8

    # Clamp to reasonable limits
    min_dim = 64
    max_dim = 2048

    width = max(min_dim, min(width, max_dim))
    height = max(min_dim, min(height, max_dim))

    return width, height


def validate_batch_size(batch_size: int, width: int, height: int) -> int:
    """Validate batch size based on resolution."""
    total_pixels = width * height

    # Adjust batch size based on resolution
    if total_pixels > 1024 * 1024:  # > 1 megapixel
        max_batch = 2
    elif total_pixels > 512 * 512:  # > 0.25 megapixel
        max_batch = 3
    else:
        max_batch = 4

    validated_batch = min(batch_size, max_batch)

    if validated_batch != batch_size:
        logger.warning(
            f"Batch size adjusted from {batch_size} to {validated_batch} for {width}x{height}"
        )

    return validated_batch


class FileUploadValidator:
    """Validator for file uploads."""

    ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]
    MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

    @classmethod
    def validate_image_upload(cls, file_content: bytes, content_type: str) -> bool:
        """Validate uploaded image file."""
        # Check content type
        if content_type not in cls.ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type. Allowed types: {', '.join(cls.ALLOWED_IMAGE_TYPES)}",
            )

        # Check file size
        if len(file_content) > cls.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size: {cls.MAX_FILE_SIZE // (1024 * 1024)}MB",
            )

        # Verify it's actually an image
        try:
            import io

            from PIL import Image

            img = Image.open(io.BytesIO(file_content))
            img.verify()

            # Check image dimensions
            if img.width > 4096 or img.height > 4096:
                raise HTTPException(
                    status_code=400,
                    detail="Image dimensions too large. Maximum: 4096x4096",
                )

            return True

        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Invalid image file: {str(e)}"
            ) from e


def create_validation_error_response(errors: list[dict[str, Any]]) -> Any:
    """Create a standardized validation error response."""
    return JSONResponse(
        status_code=422,
        content={
            "detail": errors,
            "message": "Validation failed",
            "suggestions": [
                "Check that all numeric values are within valid ranges",
                "Ensure prompts are not empty",
                "Verify image dimensions are multiples of 8",
                "Use valid sampler and scheduler names",
            ],
        },
    )
