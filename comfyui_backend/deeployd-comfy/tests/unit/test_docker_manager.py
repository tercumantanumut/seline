"""Unit tests for DockerManager module."""

from unittest.mock import MagicMock, patch

import docker
import pytest

from src.containers.docker_manager import DockerBuildError, DockerManager


class TestDockerManager:
    """Test cases for DockerManager class."""

    @pytest.fixture
    def mock_docker_client(self):
        """Mock Docker client for testing."""
        with patch("docker.from_env") as mock_from_env:
            mock_client = MagicMock()
            mock_from_env.return_value = mock_client
            yield mock_client

    @pytest.fixture
    def docker_manager(self, mock_docker_client):
        """Create DockerManager instance with mocked client."""
        return DockerManager()

    def test_initialize_docker_client(self):
        """Test Docker client initialization."""
        with patch("docker.from_env") as mock_from_env:
            mock_client = MagicMock()
            mock_from_env.return_value = mock_client

            manager = DockerManager()

            assert manager.client is not None
            mock_from_env.assert_called_once()

    def test_check_docker_available(self, docker_manager, mock_docker_client):
        """Test checking if Docker is available."""
        mock_docker_client.ping.return_value = True

        assert docker_manager.is_available() is True
        mock_docker_client.ping.assert_called_once()

    def test_docker_not_available(self, docker_manager, mock_docker_client):
        """Test when Docker is not available."""
        mock_docker_client.ping.side_effect = docker.errors.APIError(
            "Connection refused"
        )

        assert docker_manager.is_available() is False

    def test_get_docker_info(self, docker_manager, mock_docker_client):
        """Test getting Docker system information."""
        mock_info = {
            "ServerVersion": "20.10.14",
            "ApiVersion": "1.41",
            "Os": "linux",
            "Arch": "x86_64",
        }
        mock_docker_client.info.return_value = mock_info

        info = docker_manager.get_info()

        assert info["ServerVersion"] == "20.10.14"
        assert info["ApiVersion"] == "1.41"

    def test_build_image_from_dockerfile(
        self, docker_manager, mock_docker_client, tmp_path
    ):
        """Test building Docker image from Dockerfile."""
        # Create temporary Dockerfile
        dockerfile = tmp_path / "Dockerfile"
        dockerfile.write_text("FROM python:3.12-slim\nRUN echo 'test'")

        mock_image = MagicMock()
        mock_image.tags = ["test-image:latest"]
        mock_image.id = "sha256:abc123"
        mock_docker_client.images.build.return_value = (
            mock_image,
            [{"stream": "Step 1/2"}],
        )

        result = docker_manager.build_image(
            dockerfile_path=str(dockerfile),
            context_path=str(tmp_path),
            tag="test-image:latest",
        )

        assert result["image_id"] == "sha256:abc123"
        assert result["tag"] == "test-image:latest"
        mock_docker_client.images.build.assert_called_once()

    def test_build_image_with_buildargs(
        self, docker_manager, mock_docker_client, tmp_path
    ):
        """Test building image with build arguments."""
        dockerfile = tmp_path / "Dockerfile"
        dockerfile.write_text("FROM python:3.12-slim\nARG VERSION\nRUN echo $VERSION")

        mock_image = MagicMock()
        mock_docker_client.images.build.return_value = (mock_image, [])

        docker_manager.build_image(
            dockerfile_path=str(dockerfile),
            context_path=str(tmp_path),
            tag="test:latest",
            buildargs={"VERSION": "1.0.0"},
        )

        # Check that buildargs were passed
        call_kwargs = mock_docker_client.images.build.call_args[1]
        assert call_kwargs["buildargs"]["VERSION"] == "1.0.0"

    def test_build_image_with_cache(self, docker_manager, mock_docker_client, tmp_path):
        """Test building image with cache configuration."""
        dockerfile = tmp_path / "Dockerfile"
        dockerfile.write_text("FROM python:3.12-slim")

        mock_image = MagicMock()
        mock_docker_client.images.build.return_value = (mock_image, [])

        docker_manager.build_image(
            dockerfile_path=str(dockerfile),
            context_path=str(tmp_path),
            tag="test:latest",
            use_cache=True,
            cache_from=["base:latest"],
        )

        call_kwargs = mock_docker_client.images.build.call_args[1]
        assert call_kwargs.get("cache_from") == ["base:latest"]

    def test_build_image_failure(self, docker_manager, mock_docker_client, tmp_path):
        """Test handling build failure."""
        dockerfile = tmp_path / "Dockerfile"
        dockerfile.write_text("FROM python:3.12-slim")

        mock_docker_client.images.build.side_effect = docker.errors.BuildError(
            "Build failed", build_log=[]
        )

        with pytest.raises(DockerBuildError):
            docker_manager.build_image(
                dockerfile_path=str(dockerfile),
                context_path=str(tmp_path),
                tag="test:latest",
            )

    def test_push_image(self, docker_manager, mock_docker_client):
        """Test pushing image to registry."""
        mock_docker_client.images.push.return_value = [
            {"status": "Pushing"},
            {"status": "Pushed"},
        ]

        result = docker_manager.push_image("myregistry.com/test:latest")

        assert result is True
        mock_docker_client.images.push.assert_called_with(
            "myregistry.com/test:latest", auth_config=None
        )

    def test_pull_image(self, docker_manager, mock_docker_client):
        """Test pulling image from registry."""
        mock_image = MagicMock()
        mock_docker_client.images.pull.return_value = mock_image

        image = docker_manager.pull_image("python:3.12-slim")

        assert image is not None
        mock_docker_client.images.pull.assert_called_with(
            "python:3.12-slim", auth_config=None
        )

    def test_image_exists(self, docker_manager, mock_docker_client):
        """Test checking if image exists locally."""
        mock_docker_client.images.get.return_value = MagicMock()

        assert docker_manager.image_exists("test:latest") is True

        mock_docker_client.images.get.side_effect = docker.errors.ImageNotFound(
            "Not found"
        )
        assert docker_manager.image_exists("nonexistent:latest") is False

    def test_remove_image(self, docker_manager, mock_docker_client):
        """Test removing Docker image."""
        mock_docker_client.images.remove.return_value = None

        result = docker_manager.remove_image("test:latest", force=True)

        assert result is True
        mock_docker_client.images.remove.assert_called_with("test:latest", force=True)

    def test_list_images(self, docker_manager, mock_docker_client):
        """Test listing Docker images."""
        mock_images = [
            MagicMock(tags=["test1:latest"], id="abc123"),
            MagicMock(tags=["test2:latest"], id="def456"),
        ]
        mock_docker_client.images.list.return_value = mock_images

        images = docker_manager.list_images()

        assert len(images) == 2
        assert images[0]["tags"] == ["test1:latest"]

    def test_get_image_size(self, docker_manager, mock_docker_client):
        """Test getting image size."""
        mock_image = MagicMock()
        mock_image.attrs = {"Size": 104857600}  # 100MB in bytes
        mock_docker_client.images.get.return_value = mock_image

        size = docker_manager.get_image_size("test:latest")

        assert size == 104857600

    def test_tag_image(self, docker_manager, mock_docker_client):
        """Test tagging Docker image."""
        mock_image = MagicMock()
        mock_docker_client.images.get.return_value = mock_image
        mock_image.tag.return_value = True

        result = docker_manager.tag_image(source="test:latest", target="test:v1.0.0")

        assert result is True
        mock_image.tag.assert_called_with("test", "v1.0.0")

    def test_run_container(self, docker_manager, mock_docker_client):
        """Test running a container."""
        mock_container = MagicMock()
        mock_container.id = "container123"
        mock_docker_client.containers.run.return_value = mock_container

        container = docker_manager.run_container(
            image="test:latest", command="echo hello", detach=True
        )

        assert container is not None
        assert container.id == "container123"
        mock_docker_client.containers.run.assert_called_once()

    def test_cleanup_old_images(self, docker_manager, mock_docker_client):
        """Test cleaning up unused images."""
        mock_docker_client.images.prune.return_value = {
            "ImagesDeleted": [{"Deleted": "sha256:abc123"}],
            "SpaceReclaimed": 104857600,
        }

        result = docker_manager.cleanup_unused_images()

        assert result["images_deleted"] == 1
        assert result["space_reclaimed"] == 104857600

    def test_get_build_context_size(self, docker_manager, tmp_path):
        """Test calculating build context size."""
        # Create some test files
        (tmp_path / "file1.txt").write_text("test content")
        (tmp_path / "file2.txt").write_text("more content")
        subdir = tmp_path / "subdir"
        subdir.mkdir()
        (subdir / "file3.txt").write_text("nested content")

        size = docker_manager.get_context_size(str(tmp_path))

        assert size > 0

    def test_validate_dockerfile(self, docker_manager, tmp_path):
        """Test Dockerfile validation."""
        # Valid Dockerfile
        valid_dockerfile = tmp_path / "Dockerfile.valid"
        valid_dockerfile.write_text("FROM python:3.12-slim\nRUN echo test")

        assert docker_manager.validate_dockerfile(str(valid_dockerfile)) is True

        # Invalid Dockerfile
        invalid_dockerfile = tmp_path / "Dockerfile.invalid"
        invalid_dockerfile.write_text("")

        assert docker_manager.validate_dockerfile(str(invalid_dockerfile)) is False

    def test_multi_stage_build(self, docker_manager, mock_docker_client, tmp_path):
        """Test multi-stage Docker build."""
        dockerfile = tmp_path / "Dockerfile"
        dockerfile.write_text("""
FROM python:3.12-slim AS builder
RUN pip install numpy

FROM python:3.12-slim AS runtime
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
""")

        mock_image = MagicMock()
        mock_docker_client.images.build.return_value = (mock_image, [])

        result = docker_manager.build_image(
            dockerfile_path=str(dockerfile),
            context_path=str(tmp_path),
            tag="multi-stage:latest",
            target="runtime",
        )

        assert result is not None
        call_kwargs = mock_docker_client.images.build.call_args[1]
        assert call_kwargs.get("target") == "runtime"
