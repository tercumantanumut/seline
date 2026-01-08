"""Unit tests for RegistryManager module."""

from unittest.mock import MagicMock, Mock, patch

import pytest

from src.containers.registry_manager import (
    RegistryAuth,
    RegistryError,
    RegistryManager,
)


class TestRegistryManager:
    """Test cases for RegistryManager class."""

    @pytest.fixture
    def registry_manager(self, mock_docker_client):
        """Create RegistryManager instance with mocked client."""
        return RegistryManager(client=mock_docker_client)

    @pytest.fixture
    def auth_config(self):
        """Sample authentication configuration."""
        return RegistryAuth(
            username="testuser",
            password="testpass",
            registry="docker.io",
        )

    @pytest.fixture
    def mock_docker_client(self):
        """Mock Docker client."""
        with patch("docker.from_env") as mock_from_env:
            client = MagicMock()
            mock_from_env.return_value = client
            yield client

    def test_parse_image_tag(self, registry_manager):
        """Test parsing image tags into components."""
        test_cases = [
            (
                "ubuntu:latest",
                {
                    "registry": "docker.io",
                    "repository": "library/ubuntu",
                    "tag": "latest",
                },
            ),
            (
                "myregistry.com/myapp:v1.0",
                {"registry": "myregistry.com", "repository": "myapp", "tag": "v1.0"},
            ),
            (
                "localhost:5000/test/app:dev",
                {"registry": "localhost:5000", "repository": "test/app", "tag": "dev"},
            ),
        ]

        for image_tag, expected in test_cases:
            result = registry_manager.parse_image_tag(image_tag)
            assert result == expected

    def test_login_to_registry(self, registry_manager, auth_config, mock_docker_client):
        """Test logging into a registry."""
        registry_manager.client = mock_docker_client
        mock_docker_client.login.return_value = {"Status": "Login Succeeded"}

        result = registry_manager.login(auth_config)

        assert result is True
        mock_docker_client.login.assert_called_with(
            username="testuser", password="testpass", registry="docker.io", email=None
        )

    def test_push_image(self, registry_manager, mock_docker_client):
        """Test pushing image to registry."""
        registry_manager.client = mock_docker_client
        mock_docker_client.images.push.return_value = [
            {"status": "Pushing"},
            {"status": "Pushed"},
        ]

        result = registry_manager.push("myapp:latest")

        assert result is True
        mock_docker_client.images.push.assert_called_once()

    def test_pull_image(self, registry_manager, mock_docker_client):
        """Test pulling image from registry."""
        registry_manager.client = mock_docker_client
        mock_image = MagicMock()
        mock_docker_client.images.pull.return_value = mock_image

        image = registry_manager.pull("python:3.12-slim")

        assert image is not None
        mock_docker_client.images.pull.assert_called_with(
            "python:3.12-slim", auth_config=None
        )

    def test_tag_for_registry(self, registry_manager):
        """Test tagging image for different registries."""
        test_cases = [
            ("myapp:latest", "docker.io", "docker.io/library/myapp:latest"),
            ("myapp:latest", "gcr.io/project", "gcr.io/project/myapp:latest"),
            (
                "myapp:latest",
                "123456789.dkr.ecr.us-east-1.amazonaws.com",
                "123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:latest",
            ),
        ]

        for original, registry, expected in test_cases:
            result = registry_manager.tag_for_registry(original, registry)
            assert result == expected

    def test_list_registry_images(self, registry_manager):
        """Test listing images in a registry."""
        with patch("requests.get") as mock_get:
            mock_response = Mock()
            mock_response.json.return_value = {"repositories": ["app1", "app2", "app3"]}
            mock_response.status_code = 200
            mock_get.return_value = mock_response

            images = registry_manager.list_images("myregistry.com")

            assert len(images) == 3
            assert "app1" in images

    def test_check_image_exists_in_registry(self, registry_manager):
        """Test checking if image exists in registry."""
        with patch("requests.head") as mock_head:
            # Image exists
            mock_head.return_value.status_code = 200
            assert (
                registry_manager.image_exists_in_registry("myregistry.com/myapp:v1.0")
                is True
            )

            # Image doesn't exist
            mock_head.return_value.status_code = 404
            assert (
                registry_manager.image_exists_in_registry("myregistry.com/myapp:v2.0")
                is False
            )

    def test_get_image_manifest(self, registry_manager):
        """Test getting image manifest from registry."""
        with patch("requests.get") as mock_get:
            mock_response = Mock()
            mock_response.json.return_value = {
                "schemaVersion": 2,
                "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
                "config": {"size": 7023, "digest": "sha256:abc123"},
            }
            mock_response.status_code = 200
            mock_get.return_value = mock_response

            manifest = registry_manager.get_image_manifest("myapp:latest")

            assert manifest["schemaVersion"] == 2
            assert "config" in manifest

    def test_delete_image_from_registry(self, registry_manager):
        """Test deleting image from registry."""
        with patch("requests.get") as mock_get:  # noqa: SIM117
            with patch("requests.delete") as mock_delete:
                # Mock the manifest request
                mock_get.return_value.status_code = 200
                mock_get.return_value.json.return_value = {
                    "config": {"digest": "sha256:abc123"}
                }

                # Mock the delete request
                mock_delete.return_value.status_code = 202

                result = registry_manager.delete_from_registry(
                    "myregistry.com/myapp:old"
                )

                assert result is True
                mock_delete.assert_called_once()

    def test_multi_registry_support(self, registry_manager):
        """Test support for multiple registries."""
        registries = [
            "docker.io",
            "gcr.io",
            "quay.io",
            "123456789.dkr.ecr.us-east-1.amazonaws.com",
            "myregistry.azurecr.io",
        ]

        for registry in registries:
            assert registry_manager.is_supported_registry(registry) is True

    def test_registry_authentication_methods(self, registry_manager):
        """Test different authentication methods."""
        # Basic auth
        basic_auth = RegistryAuth(
            username="user", password="pass", registry="docker.io"
        )
        assert registry_manager.validate_auth(basic_auth) is True

        # Token auth
        token_auth = RegistryAuth(token="bearer_token_here", registry="gcr.io")
        assert registry_manager.validate_auth(token_auth) is True

        # Invalid auth
        invalid_auth = RegistryAuth(registry="docker.io")
        assert registry_manager.validate_auth(invalid_auth) is False

    def test_rate_limit_handling(self, registry_manager):
        """Test handling registry rate limits."""
        with patch("requests.get") as mock_get:
            mock_response = Mock()
            mock_response.status_code = 429
            mock_response.headers = {"Retry-After": "60"}
            mock_get.return_value = mock_response

            with pytest.raises(RegistryError) as exc_info:
                registry_manager.check_rate_limit("docker.io")

            assert "rate limit" in str(exc_info.value).lower()

    def test_mirror_configuration(self, registry_manager):
        """Test configuring registry mirrors."""
        mirrors = ["https://mirror1.docker.io", "https://mirror2.docker.io"]

        registry_manager.configure_mirrors(mirrors)

        assert registry_manager.mirrors == mirrors
        assert len(registry_manager.mirrors) == 2

    def test_insecure_registry(self, registry_manager):
        """Test handling insecure registries."""
        registry_manager.add_insecure_registry("localhost:5000")

        assert "localhost:5000" in registry_manager.insecure_registries
        assert registry_manager.is_insecure_registry("localhost:5000") is True
        assert registry_manager.is_insecure_registry("docker.io") is False

    def test_registry_health_check(self, registry_manager):
        """Test checking registry health."""
        with patch("requests.get") as mock_get:
            # Healthy registry
            mock_get.return_value.status_code = 200
            assert registry_manager.health_check("myregistry.com") is True

            # Unhealthy registry
            mock_get.return_value.status_code = 500
            assert registry_manager.health_check("broken.registry.com") is False

    def test_batch_operations(self, registry_manager, mock_docker_client):
        """Test batch push/pull operations."""
        registry_manager.client = mock_docker_client

        images = ["app1:latest", "app2:latest", "app3:latest"]
        results = registry_manager.batch_push(images)

        assert len(results) == 3
        assert mock_docker_client.images.push.call_count == 3
