"""Container registry management."""

import re
from dataclasses import dataclass
from typing import Any

import docker
import requests
from docker import DockerClient
from docker.errors import APIError


class RegistryError(Exception):
    """Custom exception for registry operations."""

    pass


@dataclass
class RegistryAuth:
    """Registry authentication credentials."""

    registry: str
    username: str | None = None
    password: str | None = None
    token: str | None = None
    email: str | None = None


class RegistryManager:
    """Manages container registry operations."""

    SUPPORTED_REGISTRIES = {
        "docker.io",
        "gcr.io",
        "quay.io",
        "ghcr.io",
    }

    def __init__(self, client: DockerClient | None = None):
        """Initialize registry manager.

        Args:
            client: Optional Docker client
        """
        self.client = client
        if not self.client:
            try:
                self.client = docker.from_env()
            except Exception:
                # Docker not available, that's ok for testing
                self.client = None
        self.mirrors: list[str] = []
        self.insecure_registries: list[str] = []

    def parse_image_tag(self, image_tag: str) -> dict[str, str]:
        """Parse image tag into components.

        Args:
            image_tag: Full image tag

        Returns:
            Dictionary with registry, repository, and tag
        """
        # Default values
        registry = "docker.io"
        repository = image_tag
        tag = "latest"

        # Extract tag if present
        if ":" in image_tag and "/" not in image_tag.split(":")[-1]:
            repository, tag = image_tag.rsplit(":", 1)
        else:
            repository = image_tag

        # Extract registry if present
        if "/" in repository:
            parts = repository.split("/")
            # Check if first part looks like a registry
            if "." in parts[0] or ":" in parts[0] or parts[0] == "localhost":
                registry = parts[0]
                repository = "/".join(parts[1:])
            else:
                # DockerHub library images
                if len(parts) == 1:
                    repository = f"library/{repository}"
        else:
            # Single name implies library image on DockerHub
            repository = f"library/{repository}"

        return {"registry": registry, "repository": repository, "tag": tag}

    def login(self, auth: RegistryAuth) -> bool:
        """Login to a registry.

        Args:
            auth: Authentication credentials

        Returns:
            True if login successful
        """
        try:
            result = self.client.login(
                username=auth.username,
                password=auth.password,
                registry=auth.registry,
                email=auth.email,
            )
            return result.get("Status") == "Login Succeeded"
        except APIError:
            return False

    def push(self, image_tag: str, auth: RegistryAuth | None = None) -> bool:
        """Push image to registry.

        Args:
            image_tag: Image tag to push
            auth: Optional authentication

        Returns:
            True if push successful
        """
        try:
            auth_config = None
            if auth:
                auth_config = {"username": auth.username, "password": auth.password}

            result = self.client.images.push(image_tag, auth_config=auth_config)

            # Check if push was successful
            if isinstance(result, list):
                for line in result:
                    if "error" in line:
                        return False

            return True
        except APIError:
            return False

    def pull(self, image_tag: str, auth: RegistryAuth | None = None):
        """Pull image from registry.

        Args:
            image_tag: Image tag to pull
            auth: Optional authentication

        Returns:
            Image object or None
        """
        try:
            auth_config = None
            if auth:
                auth_config = {"username": auth.username, "password": auth.password}

            return self.client.images.pull(image_tag, auth_config=auth_config)
        except APIError:
            return None

    def tag_for_registry(self, image_tag: str, registry: str) -> str:
        """Tag image for a specific registry.

        Args:
            image_tag: Original image tag
            registry: Target registry

        Returns:
            Full image tag with registry
        """
        parsed = self.parse_image_tag(image_tag)

        # Remove library/ prefix for non-DockerHub registries
        repository = parsed["repository"]
        if registry != "docker.io" and repository.startswith("library/"):
            repository = repository[8:]

        # Build full tag
        if registry == "docker.io":
            # DockerHub can omit registry in tag
            return f"{registry}/{repository}:{parsed['tag']}"
        else:
            # Other registries need full path
            if "/" not in registry:
                # Simple registry name
                return f"{registry}/{repository}:{parsed['tag']}"
            else:
                # Registry with path (e.g., gcr.io/project)
                return f"{registry}/{repository}:{parsed['tag']}"

    def list_images(self, registry: str, auth: RegistryAuth | None = None) -> list[str]:
        """List images in a registry.

        Args:
            registry: Registry URL
            auth: Optional authentication

        Returns:
            List of image names
        """
        # Construct catalog URL
        url = f"https://{registry}/v2/_catalog"

        headers = {}
        if auth and auth.token:
            headers["Authorization"] = f"Bearer {auth.token}"
        elif auth and auth.username:
            from requests.auth import HTTPBasicAuth

            auth_obj = HTTPBasicAuth(auth.username, auth.password)
        else:
            auth_obj = None

        try:
            response = requests.get(url, headers=headers, auth=auth_obj, timeout=30)
            if response.status_code == 200:
                data = response.json()
                return data.get("repositories", [])
        except requests.RequestException:
            pass

        return []

    def image_exists_in_registry(
        self, image_tag: str, auth: RegistryAuth | None = None
    ) -> bool:
        """Check if image exists in registry.

        Args:
            image_tag: Full image tag
            auth: Optional authentication

        Returns:
            True if image exists
        """
        parsed = self.parse_image_tag(image_tag)

        # Construct manifest URL
        url = f"https://{parsed['registry']}/v2/{parsed['repository']}/manifests/{parsed['tag']}"

        headers = {"Accept": "application/vnd.docker.distribution.manifest.v2+json"}

        if auth and auth.token:
            headers["Authorization"] = f"Bearer {auth.token}"

        try:
            response = requests.head(url, headers=headers, timeout=30)
            return response.status_code == 200
        except requests.RequestException:
            return False

    def get_image_manifest(
        self, image_tag: str, auth: RegistryAuth | None = None
    ) -> dict[str, Any] | None:
        """Get image manifest from registry.

        Args:
            image_tag: Image tag
            auth: Optional authentication

        Returns:
            Manifest dictionary or None
        """
        parsed = self.parse_image_tag(image_tag)

        # Construct manifest URL
        url = f"https://{parsed['registry']}/v2/{parsed['repository']}/manifests/{parsed['tag']}"

        headers = {"Accept": "application/vnd.docker.distribution.manifest.v2+json"}

        if auth and auth.token:
            headers["Authorization"] = f"Bearer {auth.token}"

        try:
            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code == 200:
                return response.json()
        except requests.RequestException:
            pass

        return None

    def delete_from_registry(
        self, image_tag: str, auth: RegistryAuth | None = None
    ) -> bool:
        """Delete image from registry.

        Args:
            image_tag: Image tag to delete
            auth: Optional authentication

        Returns:
            True if deletion successful
        """
        parsed = self.parse_image_tag(image_tag)

        # First get the digest
        manifest = self.get_image_manifest(image_tag, auth)
        if not manifest:
            return False

        digest = manifest.get("config", {}).get("digest")
        if not digest:
            return False

        # Delete by digest
        url = (
            f"https://{parsed['registry']}/v2/{parsed['repository']}/manifests/{digest}"
        )

        headers = {}
        if auth and auth.token:
            headers["Authorization"] = f"Bearer {auth.token}"

        try:
            response = requests.delete(url, headers=headers, timeout=30)
            return response.status_code in [200, 202]
        except requests.RequestException:
            return False

    def is_supported_registry(self, registry: str) -> bool:
        """Check if registry is supported.

        Args:
            registry: Registry URL

        Returns:
            True if supported
        """
        # Check known registries
        for supported in self.SUPPORTED_REGISTRIES:
            if supported in registry:
                return True

        # Check common registry patterns
        patterns = [
            r".*\.dkr\.ecr\..*\.amazonaws\.com",  # AWS ECR
            r".*\.azurecr\.io",  # Azure Container Registry
            r".*\.gcr\.io",  # Google Container Registry
        ]

        for pattern in patterns:
            if re.match(pattern, registry):
                return True

        return True  # Assume supported by default

    def validate_auth(self, auth: RegistryAuth) -> bool:
        """Validate authentication credentials.

        Args:
            auth: Authentication credentials

        Returns:
            True if valid
        """
        if not auth.registry:
            return False

        # Check for either username/password or token
        if auth.username and auth.password:
            return True

        return bool(auth.token)

    def check_rate_limit(self, registry: str, auth: RegistryAuth | None = None):
        """Check registry rate limit status.

        Args:
            registry: Registry URL
            auth: Optional authentication

        Raises:
            RegistryError: If rate limited
        """
        url = f"https://{registry}/v2/"

        headers = {}
        if auth and auth.token:
            headers["Authorization"] = f"Bearer {auth.token}"

        try:
            response = requests.get(url, headers=headers, timeout=30)

            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After", "unknown")
                raise RegistryError(f"Rate limit exceeded. Retry after: {retry_after}")

        except requests.RequestException as e:
            if "429" in str(e):
                raise RegistryError("Rate limit exceeded") from e

    def configure_mirrors(self, mirrors: list[str]):
        """Configure registry mirrors.

        Args:
            mirrors: List of mirror URLs
        """
        self.mirrors = mirrors

    def add_insecure_registry(self, registry: str):
        """Add insecure registry.

        Args:
            registry: Registry URL
        """
        if registry not in self.insecure_registries:
            self.insecure_registries.append(registry)

    def is_insecure_registry(self, registry: str) -> bool:
        """Check if registry is insecure.

        Args:
            registry: Registry URL

        Returns:
            True if insecure
        """
        return registry in self.insecure_registries

    def health_check(self, registry: str) -> bool:
        """Check registry health.

        Args:
            registry: Registry URL

        Returns:
            True if healthy
        """
        url = f"https://{registry}/v2/"

        try:
            response = requests.get(url, timeout=5)
            return response.status_code in [
                200,
                401,
            ]  # 401 means auth required but registry is up
        except requests.RequestException:
            return False

    def batch_push(
        self, images: list[str], auth: RegistryAuth | None = None
    ) -> list[dict[str, Any]]:
        """Push multiple images to registry.

        Args:
            images: List of image tags
            auth: Optional authentication

        Returns:
            List of results
        """
        results = []

        for image in images:
            success = self.push(image, auth)
            results.append({"image": image, "success": success})

        return results

    def batch_pull(
        self, images: list[str], auth: RegistryAuth | None = None
    ) -> list[dict[str, Any]]:
        """Pull multiple images from registry.

        Args:
            images: List of image tags
            auth: Optional authentication

        Returns:
            List of results
        """
        results = []

        for image in images:
            result = self.pull(image, auth)
            results.append({"image": image, "success": result is not None})

        return results
