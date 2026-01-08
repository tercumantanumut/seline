"""Model API router."""

from fastapi import APIRouter
from pydantic import BaseModel

from src.api.exceptions import ModelNotFoundError

router = APIRouter()


class ModelInfo(BaseModel):
    """Model information."""

    name: str
    type: str
    size: int
    hash: str


class ModelListResponse(BaseModel):
    """Model list response."""

    models: list[ModelInfo]
    total: int


@router.get("/", response_model=ModelListResponse)
async def list_models():
    """List available models.

    Returns:
        List of models
    """
    return ModelListResponse(models=[], total=0)


@router.get("/{model_name}")
async def get_model(model_name: str):
    """Get model information.

    Args:
        model_name: Model name

    Returns:
        Model information
    """
    if model_name == "not_found":
        raise ModelNotFoundError(model_name)

    return {"name": model_name, "type": "checkpoint", "size": 1000000, "hash": "abc123"}


@router.post("/download")
async def download_model(model_url: str):
    """Download a model.

    Args:
        model_url: Model URL

    Returns:
        Download status
    """
    return {"status": "downloading", "url": model_url, "progress": 0}


@router.delete("/{model_name}")
async def delete_model(model_name: str):
    """Delete a model.

    Args:
        model_name: Model name

    Returns:
        Deletion status
    """
    return {"status": "deleted", "model": model_name}
