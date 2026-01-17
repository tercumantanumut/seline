import random
from typing import Optional, List
from pydantic import BaseModel, Field, validator


class ProcessRequest(BaseModel):
    prompt: str = Field(
        ...,
        example="A beautiful landscape with mountains and a lake at sunset",
        description="Text prompt describing what to generate.",
    )
    width: Optional[int] = Field(
        default=1024,
        ge=256,
        le=2048,
        description="Width of the generated image in pixels."
    )
    height: Optional[int] = Field(
        default=1024,
        ge=256,
        le=2048,
        description="Height of the generated image in pixels."
    )
    guidance: Optional[float] = Field(
        default=4.0,
        ge=0.0,
        le=20.0,
        description="Guidance scale for Flux2 (0.0 to 20.0)."
    )
    steps: Optional[int] = Field(
        default=20,
        ge=1,
        le=100,
        description="Number of sampling steps (1 to 100)."
    )
    seed: int = Field(
        default_factory=lambda: random.randint(0, 2**32 - 1),
        description="Seed for randomization. Defaults to a random integer.",
    )
    reference_images: Optional[List[str]] = Field(
        default=None,
        description="Optional list of base64-encoded reference images (0-10 supported)."
    )

    @validator('width', 'height')
    def validate_dimensions(cls, v):
        if v % 8 != 0:
            raise ValueError(f"Dimension must be divisible by 8, got {v}")
        return v

    @validator('reference_images')
    def validate_reference_images(cls, v):
        if v is not None and len(v) > 10:
            raise ValueError(f"Maximum 10 reference images allowed, got {len(v)}")
        return v


class HealthResponse(BaseModel):
    status: str = Field(..., description="Health status")
    service: str = Field(..., description="Service name")
    timestamp: float = Field(..., description="Current timestamp")
    max_concurrent_requests: Optional[int] = Field(None, description="Maximum concurrent requests allowed")
    active_requests: Optional[int] = Field(None, description="Current number of active requests")


class AsyncJobResponse(BaseModel):
    """Response for async job creation."""
    job_id: str = Field(..., description="Unique job identifier for polling")
    status: str = Field(default="pending", description="Initial job status")
    message: str = Field(default="Job queued successfully", description="Status message")


class JobStatusResponse(BaseModel):
    """Response for job status polling."""
    job_id: str = Field(..., description="Unique job identifier")
    status: str = Field(..., description="Job status: pending, processing, complete, failed")
    result: Optional[str] = Field(None, description="Base64 encoded image when complete")
    seed: Optional[int] = Field(None, description="Seed used for generation")
    time_taken: Optional[float] = Field(None, description="Time taken for generation in seconds")
    error: Optional[str] = Field(None, description="Error message if failed")
    created_at: Optional[str] = Field(None, description="Job creation timestamp")
    completed_at: Optional[str] = Field(None, description="Job completion timestamp")
