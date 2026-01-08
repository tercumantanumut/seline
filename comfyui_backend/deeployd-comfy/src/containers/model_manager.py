"""Model file management for ComfyUI workflows."""

import hashlib
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import aiofiles
import aiohttp


class ModelDownloadError(Exception):
    """Exception for model download failures."""

    pass


class ModelVerificationError(Exception):
    """Exception for model verification failures."""

    pass


@dataclass
class ModelInfo:
    """Information about a model file."""

    name: str
    type: str  # checkpoint, lora, vae, embedding, upscale_model
    url: str | None = None
    size: int | None = None
    hash: str | None = None
    hash_type: str = "sha256"
    metadata: dict[str, Any] = field(default_factory=dict)


class ModelManager:
    """Manages model files for ComfyUI workflows."""

    # Model type to directory mapping
    MODEL_DIRS = {
        "checkpoint": "checkpoints",
        "checkpoints": "checkpoints",
        "lora": "loras",
        "loras": "loras",
        "vae": "vae",
        "embedding": "embeddings",
        "embeddings": "embeddings",
        "upscale_model": "upscale_models",
        "upscale_models": "upscale_models",
        "controlnet": "controlnet",
    }

    # Threshold for streaming download (500MB)
    STREAMING_THRESHOLD = 500 * 1024 * 1024

    def __init__(self, cache_dir: str | None = None):
        """Initialize model manager.

        Args:
            cache_dir: Optional directory for caching models
        """
        self.cache_dir = (
            Path(cache_dir) if cache_dir else Path.home() / ".comfyui_models"
        )
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.registry_cache = {}

    def extract_models_from_workflow(self, workflow: dict[str, Any]) -> list[ModelInfo]:
        """Extract model references from workflow.

        Args:
            workflow: Workflow dictionary

        Returns:
            List of ModelInfo objects
        """
        models = []

        # Mapping of input field names to model types
        model_field_mapping = {
            "ckpt_name": "checkpoint",
            "lora_name": "lora",
            "vae_name": "vae",
            "model_name": "checkpoint",
            "embedding": "embedding",
            "upscale_model": "upscale_model",
            "control_net_name": "controlnet",
        }

        for _node_id, node_data in workflow.items():
            if not isinstance(node_data, dict):
                continue

            inputs = node_data.get("inputs", {})

            for field_name, model_type in model_field_mapping.items():
                if field_name in inputs:
                    model_name = inputs[field_name]
                    if isinstance(model_name, str):
                        models.append(
                            ModelInfo(
                                name=model_name,
                                type=model_type,
                            )
                        )

        return models

    def create_model_directory_structure(self) -> dict[str, str]:
        """Create directory structure for models.

        Returns:
            Dictionary mapping model types to directory paths
        """
        base_dir = self.cache_dir / "models"
        paths = {}

        for model_type in [
            "checkpoints",
            "loras",
            "vae",
            "embeddings",
            "upscale_models",
        ]:
            dir_path = base_dir / model_type
            dir_path.mkdir(parents=True, exist_ok=True)
            paths[model_type] = str(dir_path)

        return paths

    def generate_download_commands(self, models: list[ModelInfo]) -> list[str]:
        """Generate download commands for models.

        Args:
            models: List of model information

        Returns:
            List of download commands
        """
        commands = []

        for model in models:
            model_dir = self.MODEL_DIRS.get(model.type, "models")

            if model.url:
                # Use wget for downloading
                commands.append(
                    f"RUN wget -q --show-progress --progress=bar:force:noscroll "
                    f"-O /app/models/{model_dir}/{model.name} "
                    f"{model.url}"
                )
            else:
                # Placeholder for models without URLs
                commands.append(
                    f"# TODO: Download {model.name} to /app/models/{model_dir}/"
                )

        return commands

    async def download_model(
        self,
        url: str,
        destination: str,
        progress_callback: Callable | None = None,
        chunk_size: int = 8192,
    ):
        """Download a model file with progress tracking.

        Args:
            url: URL to download from
            destination: Destination filepath
            progress_callback: Optional callback for progress updates
            chunk_size: Size of chunks to download
        """
        async with aiohttp.ClientSession() as session:  # noqa: SIM117
            async with session.get(url) as response:
                total_size = int(response.headers.get("content-length", 0))
                downloaded = 0

                async with aiofiles.open(destination, "wb") as f:
                    async for chunk in response.content.iter_chunked(chunk_size):
                        await f.write(chunk)
                        downloaded += len(chunk)

                        if progress_callback:
                            await progress_callback(downloaded, total_size)

    def verify_model_hash(
        self, filepath: str, expected_hash: str, hash_type: str = "sha256"
    ) -> bool:
        """Verify model file hash.

        Args:
            filepath: Path to model file
            expected_hash: Expected hash value
            hash_type: Type of hash (sha256, md5, etc.)

        Returns:
            True if hash matches
        """
        hash_func = getattr(hashlib, hash_type)()

        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hash_func.update(chunk)

        calculated_hash = hash_func.hexdigest()
        return calculated_hash == expected_hash

    def get_model_size(self, filepath: str) -> int:
        """Get size of model file.

        Args:
            filepath: Path to model file

        Returns:
            Size in bytes
        """
        return Path(filepath).stat().st_size

    def cache_model(self, source_path: str, model_info: ModelInfo) -> str:
        """Cache a model file.

        Args:
            source_path: Path to source model file
            model_info: Model information

        Returns:
            Path to cached model
        """
        # Create cache key based on hash or name
        model_dir = self.MODEL_DIRS.get(model_info.type, "models")

        cached_path = self.cache_dir / model_dir / model_info.name
        cached_path.parent.mkdir(parents=True, exist_ok=True)

        # Copy or move the file
        import shutil

        shutil.copy2(source_path, cached_path)

        return str(cached_path)

    def is_model_cached(self, model_info: ModelInfo) -> bool:
        """Check if model is already cached.

        Args:
            model_info: Model information

        Returns:
            True if model is cached
        """
        model_dir = self.MODEL_DIRS.get(model_info.type, "models")
        cached_path = self.cache_dir / model_dir / model_info.name

        if not cached_path.exists():
            return False

        # Optionally verify hash if available
        if model_info.hash:
            return self.verify_model_hash(
                str(cached_path), model_info.hash, model_info.hash_type
            )

        return True

    def generate_volume_mount_config(self) -> dict[str, Any]:
        """Generate Docker volume mount configuration.

        Returns:
            Configuration for volume mounts
        """
        return {
            "volumes": [
                f"{self.cache_dir}/models:/app/models:ro",
            ],
            "mounts": [
                {
                    "type": "bind",
                    "source": str(self.cache_dir / "models"),
                    "target": "/app/models",
                    "readonly": True,
                }
            ],
        }

    def generate_dockerfile_section(self, models: list[ModelInfo]) -> str:
        """Generate Dockerfile section for models.

        Args:
            models: List of model information

        Returns:
            Dockerfile section
        """
        lines = ["# Download models"]

        # Create directories
        model_dirs = set()
        for model in models:
            model_dir = self.MODEL_DIRS.get(model.type, "models")
            model_dirs.add(model_dir)

        if model_dirs:
            dirs_str = " ".join(f"/app/models/{d}" for d in sorted(model_dirs))
            lines.append(f"RUN mkdir -p {dirs_str}")

        lines.append("")

        # Add download commands
        for model in models:
            model_dir = self.MODEL_DIRS.get(model.type, "models")

            if model.url:
                lines.append(f"# Download {model.name}")
                lines.append(
                    f"RUN wget -q -O /app/models/{model_dir}/{model.name} \\\n"
                    f"    {model.url}"
                )

            # Add hash verification if available
            if model.hash:
                lines.append(
                    f"RUN echo '{model.hash}  /app/models/{model_dir}/{model.name}' | "
                    f"sha256sum -c -"
                )

            lines.append("")

        return "\n".join(lines)

    def load_model_registry(self) -> dict[str, Any]:
        """Load model registry data.

        Returns:
            Registry data dictionary
        """
        # This would load from a real registry in production
        # For now, return mock data
        return self.registry_cache

    def lookup_model(self, model_name: str) -> ModelInfo | None:
        """Look up model information in registry.

        Args:
            model_name: Name of the model

        Returns:
            ModelInfo if found, None otherwise
        """
        registry = self.load_model_registry()

        if model_name in registry:
            data = registry[model_name]
            return ModelInfo(
                name=model_name,
                type=data.get("type", "checkpoint"),
                url=data.get("url"),
                size=data.get("size"),
                hash=data.get("hash"),
                hash_type=data.get("hash_type", "sha256"),
            )

        return None

    def should_use_streaming(self, model_info: ModelInfo) -> bool:
        """Check if model should use streaming download.

        Args:
            model_info: Model information

        Returns:
            True if streaming should be used
        """
        if not model_info.size:
            return True  # Default to streaming if size unknown

        return model_info.size > self.STREAMING_THRESHOLD

    def create_download_plan(self, models: list[ModelInfo]) -> list[dict[str, Any]]:
        """Create download plan for multiple models.

        Args:
            models: List of models to download

        Returns:
            Download plan with parallelization info
        """
        plan = []

        for model in models:
            plan.append(
                {
                    "model": model,
                    "parallel": True,  # Download in parallel by default
                    "streaming": self.should_use_streaming(model),
                }
            )

        return plan

    def create_model_symlink(self, source: str, link: str):
        """Create symlink for shared model.

        Args:
            source: Source model path
            link: Symlink path
        """
        link_path = Path(link)
        link_path.parent.mkdir(parents=True, exist_ok=True)

        # Remove existing link if present
        if link_path.exists() or link_path.is_symlink():
            link_path.unlink()

        # Try to create symlink, fall back to copy on Windows
        try:
            link_path.symlink_to(source)
        except OSError:
            # Fallback for systems without symlink support
            import shutil

            shutil.copy2(source, link)

    def cleanup_unused_models(self, cache_dir: str, used_models: list[str]) -> int:
        """Clean up unused cached models.

        Args:
            cache_dir: Cache directory path
            used_models: List of model names in use

        Returns:
            Number of models cleaned up
        """
        cache_path = Path(cache_dir)
        cleaned = 0

        for model_file in cache_path.glob("*.safetensors"):
            if model_file.name not in used_models:
                model_file.unlink()
                cleaned += 1

        return cleaned

    def generate_manifest(self, models: list[ModelInfo]) -> dict[str, Any]:
        """Generate model manifest.

        Args:
            models: List of model information

        Returns:
            Manifest dictionary
        """
        manifest = {"generated_at": datetime.now().isoformat(), "models": []}

        for model in models:
            manifest["models"].append(
                {
                    "name": model.name,
                    "type": model.type,
                    "url": model.url,
                    "size": model.size,
                    "hash": model.hash,
                    "hash_type": model.hash_type,
                    "metadata": model.metadata,
                }
            )

        return manifest
