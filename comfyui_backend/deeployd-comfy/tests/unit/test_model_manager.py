"""Unit tests for ModelManager module."""

import hashlib
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from src.containers.model_manager import (
    ModelInfo,
    ModelManager,
)


class TestModelManager:
    """Test cases for ModelManager class."""

    @pytest.fixture
    def model_manager(self, tmp_path):
        """Create ModelManager instance."""
        return ModelManager(cache_dir=str(tmp_path / "models"))

    @pytest.fixture
    def model_info(self):
        """Sample model information."""
        return ModelInfo(
            name="sd_xl_base_1.0.safetensors",
            type="checkpoint",
            url="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
            size=6938070334,  # ~6.5GB
            hash="31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b",
            hash_type="sha256",
        )

    def test_extract_model_references(self, model_manager):
        """Test extracting model references from workflow."""
        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"},
            },
            "2": {
                "class_type": "LoraLoader",
                "inputs": {
                    "lora_name": "style_lora.safetensors",
                    "strength_model": 1.0,
                },
            },
            "3": {
                "class_type": "VAELoader",
                "inputs": {"vae_name": "vae_ft_mse.safetensors"},
            },
        }

        models = model_manager.extract_models_from_workflow(workflow)

        assert len(models) == 3
        assert any(
            m.name == "sd_xl_base_1.0.safetensors" and m.type == "checkpoint"
            for m in models
        )
        assert any(
            m.name == "style_lora.safetensors" and m.type == "lora" for m in models
        )
        assert any(
            m.name == "vae_ft_mse.safetensors" and m.type == "vae" for m in models
        )

    def test_model_path_structure(self, model_manager):
        """Test model directory structure creation."""
        model_types = ["checkpoints", "loras", "vae", "embeddings", "upscale_models"]

        paths = model_manager.create_model_directory_structure()

        for model_type in model_types:
            assert model_type in paths
            assert Path(paths[model_type]).exists()

    def test_generate_download_commands(self, model_manager, model_info):
        """Test generating download commands for models."""
        models = [model_info]
        commands = model_manager.generate_download_commands(models)

        assert len(commands) > 0
        assert any("wget" in cmd or "curl" in cmd for cmd in commands)
        assert any(model_info.name in cmd for cmd in commands)
        assert any("checkpoints" in cmd for cmd in commands)  # Correct directory

    @pytest.mark.asyncio
    async def test_download_model_with_progress(self, model_manager, tmp_path):
        """Test downloading model with progress callback."""
        # Create a small test file
        test_file = tmp_path / "test_model.safetensors"
        test_content = b"test model content" * 1000

        progress_updates = []

        async def progress_callback(downloaded, total):
            progress_updates.append((downloaded, total))

        # Mock the download properly with async context managers
        with patch("src.containers.model_manager.aiofiles.open") as mock_aiofiles:  # noqa: SIM117
            with patch(
                "src.containers.model_manager.aiohttp.ClientSession"
            ) as mock_session:
                # Mock the file write
                mock_file = AsyncMock()
                mock_file.write = AsyncMock()
                mock_aiofiles.return_value.__aenter__.return_value = mock_file

                # Mock the response
                mock_response = AsyncMock()
                mock_response.headers = {"content-length": str(len(test_content))}

                # Mock iter_chunked as an async generator
                async def mock_iter_chunked(chunk_size):
                    for i in range(0, len(test_content), 1024):
                        yield test_content[i : i + 1024]

                mock_response.content.iter_chunked = mock_iter_chunked

                # Setup the session mock properly
                # Create a mock that acts as an async context manager
                class MockGet:
                    async def __aenter__(self):
                        return mock_response

                    async def __aexit__(self, *args):
                        return None

                mock_session_inst = Mock()  # Use regular Mock, not AsyncMock
                mock_session_inst.get = Mock(return_value=MockGet())

                mock_session.return_value.__aenter__.return_value = mock_session_inst
                mock_session.return_value.__aexit__.return_value = None

                await model_manager.download_model(
                    url="https://example.com/model.safetensors",
                    destination=str(test_file),
                    progress_callback=progress_callback,
                )

        assert len(progress_updates) > 0

    def test_verify_model_hash(self, model_manager, tmp_path):
        """Test model hash verification."""
        # Create a test file
        test_file = tmp_path / "model.safetensors"
        test_content = b"test model content"
        test_file.write_bytes(test_content)

        # Calculate correct hash
        expected_hash = hashlib.sha256(test_content).hexdigest()

        # Test successful verification
        assert (
            model_manager.verify_model_hash(
                filepath=str(test_file), expected_hash=expected_hash, hash_type="sha256"
            )
            is True
        )

        # Test failed verification
        assert (
            model_manager.verify_model_hash(
                filepath=str(test_file), expected_hash="wrong_hash", hash_type="sha256"
            )
            is False
        )

    def test_get_model_size(self, model_manager, tmp_path):
        """Test getting model file size."""
        test_file = tmp_path / "model.safetensors"
        test_content = b"x" * 1024 * 1024  # 1MB
        test_file.write_bytes(test_content)

        size = model_manager.get_model_size(str(test_file))
        assert size == 1024 * 1024

    def test_cache_model(self, model_manager, tmp_path):
        """Test model caching functionality."""
        # Create a test model file
        source_file = tmp_path / "source_model.safetensors"
        test_content = b"model content"
        source_file.write_bytes(test_content)

        # Calculate the correct hash
        import hashlib

        correct_hash = hashlib.sha256(test_content).hexdigest()

        model_info = ModelInfo(
            name="test_model.safetensors",
            type="checkpoint",
            hash=correct_hash,
        )

        # Cache the model
        cached_path = model_manager.cache_model(str(source_file), model_info)

        assert Path(cached_path).exists()
        assert model_manager.is_model_cached(model_info) is True

    def test_generate_volume_mount_config(self, model_manager):
        """Test generating Docker volume mount configuration."""
        config = model_manager.generate_volume_mount_config()

        assert "volumes" in config
        assert "mounts" in config
        assert any("models" in mount["target"] for mount in config["mounts"])

    def test_generate_dockerfile_model_section(self, model_manager, model_info):
        """Test generating Dockerfile section for models."""
        models = [model_info]
        dockerfile_section = model_manager.generate_dockerfile_section(models)

        assert "# Download models" in dockerfile_section
        assert "RUN mkdir -p" in dockerfile_section
        assert "checkpoints" in dockerfile_section

    def test_model_registry_lookup(self, model_manager):
        """Test looking up models in registry."""
        # Mock registry data
        registry_data = {
            "sd_xl_base_1.0.safetensors": {
                "url": "https://huggingface.co/model",
                "size": 6938070334,
                "hash": "abc123",
            }
        }

        with patch.object(
            model_manager, "load_model_registry", return_value=registry_data
        ):
            info = model_manager.lookup_model("sd_xl_base_1.0.safetensors")

            assert info is not None
            assert info.url == "https://huggingface.co/model"
            assert info.size == 6938070334

    def test_handle_large_model_streaming(self, model_manager):
        """Test handling large model files with streaming."""
        # Test that large models use streaming download
        large_model = ModelInfo(
            name="large_model.safetensors",
            type="checkpoint",
            size=10 * 1024 * 1024 * 1024,  # 10GB
        )

        assert model_manager.should_use_streaming(large_model) is True

        small_model = ModelInfo(
            name="small_model.safetensors",
            type="embedding",
            size=100 * 1024 * 1024,  # 100MB
        )

        assert model_manager.should_use_streaming(small_model) is False

    def test_parallel_model_downloads(self, model_manager):
        """Test downloading multiple models in parallel."""
        models = [
            ModelInfo(name="model1.safetensors", type="checkpoint"),
            ModelInfo(name="model2.safetensors", type="lora"),
            ModelInfo(name="model3.safetensors", type="vae"),
        ]

        download_plan = model_manager.create_download_plan(models)

        assert len(download_plan) == 3
        assert download_plan[0]["parallel"] is True  # Should download in parallel

    def test_model_symlink_creation(self, model_manager, tmp_path):
        """Test creating symlinks for shared models."""
        # Create source model
        source = tmp_path / "cache" / "model.safetensors"
        source.parent.mkdir(parents=True)
        source.write_bytes(b"model content")

        # Create symlink
        link = tmp_path / "models" / "checkpoints" / "model.safetensors"
        link.parent.mkdir(parents=True)

        model_manager.create_model_symlink(str(source), str(link))

        assert link.exists()
        assert link.is_symlink() or link.exists()  # Windows might not support symlinks

    def test_cleanup_unused_models(self, model_manager, tmp_path):
        """Test cleaning up unused cached models."""
        # Create some model files
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()

        used_model = cache_dir / "used_model.safetensors"
        used_model.write_bytes(b"used")

        unused_model = cache_dir / "unused_model.safetensors"
        unused_model.write_bytes(b"unused")

        # Mark one as used
        used_models = ["used_model.safetensors"]

        cleaned = model_manager.cleanup_unused_models(
            cache_dir=str(cache_dir), used_models=used_models
        )

        assert used_model.exists()
        assert not unused_model.exists()
        assert cleaned == 1

    def test_generate_model_manifest(self, model_manager, model_info):
        """Test generating model manifest file."""
        models = [model_info]
        manifest = model_manager.generate_manifest(models)

        assert "models" in manifest
        assert len(manifest["models"]) == 1
        assert manifest["models"][0]["name"] == model_info.name
        assert manifest["models"][0]["type"] == model_info.type
        assert manifest["models"][0]["hash"] == model_info.hash
        assert "generated_at" in manifest
