"""Docker management for container operations."""

import typing as t
from pathlib import Path
from typing import Any

import docker
from docker.errors import APIError, BuildError, ImageNotFound


class DockerBuildError(Exception):
    """Custom exception for Docker build errors."""

    pass


class DockerManager:
    """Manages Docker operations for workflow containerization."""

    def __init__(self, client: Any | None = None):
        """Initialize Docker manager.

        Args:
            client: Optional Docker client instance (for testing)
        """
        if client:
            self.client = client
        else:
            try:
                self.client = docker.from_env()
            except Exception as e:
                raise RuntimeError(f"Failed to connect to Docker: {e}") from e

    def is_available(self) -> bool:
        """Check if Docker is available and running.

        Returns:
            True if Docker is available
        """
        try:
            self.client.ping()
            return True
        except (APIError, Exception):
            return False

    def get_info(self) -> dict[str, Any]:
        """Get Docker system information.

        Returns:
            Dictionary with Docker system info
        """
        try:
            return t.cast(dict[str, Any], self.client.info())
        except APIError as e:
            return {"error": str(e)}

    def build_image(
        self,
        dockerfile_path: str,
        context_path: str,
        tag: str,
        buildargs: dict[str, str] | None = None,
        use_cache: bool = True,
        cache_from: list[str] | None = None,
        target: str | None = None,
        platform: str | None = None,
    ) -> dict[str, Any]:
        """Build Docker image from Dockerfile.

        Args:
            dockerfile_path: Path to Dockerfile
            context_path: Build context directory
            tag: Tag for the image
            buildargs: Build arguments
            use_cache: Whether to use cache
            cache_from: Images to use as cache sources
            target: Target stage for multi-stage builds
            platform: Target platform (e.g., linux/amd64)

        Returns:
            Dictionary with build results

        Raises:
            DockerBuildError: If build fails
        """
        try:
            # Prepare build arguments
            kwargs = {
                "path": context_path,
                "dockerfile": dockerfile_path,
                "tag": tag,
                "rm": True,  # Remove intermediate containers
                "forcerm": True,  # Force removal on failure
            }

            if buildargs:
                kwargs["buildargs"] = buildargs

            if not use_cache:
                kwargs["nocache"] = True

            if cache_from:
                kwargs["cache_from"] = cache_from

            if target:
                kwargs["target"] = target

            if platform:
                kwargs["platform"] = platform

            # Build the image
            image, build_logs = self.client.images.build(**kwargs)

            return {
                "image_id": image.id,
                "tag": tag,
                "logs": build_logs,
            }

        except BuildError as e:
            raise DockerBuildError(f"Build failed: {e}") from e
        except Exception as e:
            raise DockerBuildError(f"Unexpected error during build: {e}") from e

    def stream_build(
        self,
        dockerfile_path: str,
        context_path: str,
        tag: str,
        buildargs: dict[str, str] | None = None,
        use_cache: bool = True,
        cache_from: list[str] | None = None,
        target: str | None = None,
        platform: str | None = None,
    ) -> t.Iterator[dict[str, Any]]:
        """Stream a Docker build yielding log chunks as they arrive.

        Yields dictionaries from Docker with keys like 'stream', 'status', or 'error'.
        Raises DockerBuildError on failure.
        """
        try:
            api = self.client.api
            dockerfile_name = Path(dockerfile_path).name
            params: dict[str, Any] = {
                "path": context_path,
                "dockerfile": dockerfile_name,
                "tag": tag,
                "rm": True,
                "forcerm": True,
                "decode": True,
            }
            if buildargs:
                params["buildargs"] = buildargs
            if not use_cache:
                params["nocache"] = True
            if cache_from:
                params["cache_from"] = cache_from
            if target:
                params["target"] = target
            if platform:
                params["platform"] = platform

            for chunk in api.build(**params):
                if not chunk:
                    continue
                if "error" in chunk:
                    raise DockerBuildError(chunk.get("error", "Unknown build error"))
                yield chunk
        except BuildError as e:
            raise DockerBuildError(f"Build failed: {e}") from e
        except Exception as e:
            raise DockerBuildError(f"Unexpected error during build: {e}") from e

    def push_image(self, tag: str, auth_config: dict[str, str] | None = None) -> bool:
        """Push image to registry.

        Args:
            tag: Image tag to push
            auth_config: Authentication configuration

        Returns:
            True if successful
        """
        try:
            self.client.images.push(tag, auth_config=auth_config)
            return True
        except APIError:
            return False

    def pull_image(
        self, tag: str, auth_config: dict[str, str] | None = None
    ) -> Any | None:
        """Pull image from registry.

        Args:
            tag: Image tag to pull
            auth_config: Authentication configuration

        Returns:
            Image object or None
        """
        try:
            return self.client.images.pull(tag, auth_config=auth_config)
        except APIError:
            return None

    def image_exists(self, tag: str) -> bool:
        """Check if image exists locally.

        Args:
            tag: Image tag

        Returns:
            True if image exists
        """
        try:
            self.client.images.get(tag)
            return True
        except ImageNotFound:
            return False

    def remove_image(self, tag: str, force: bool = False) -> bool:
        """Remove Docker image.

        Args:
            tag: Image tag to remove
            force: Force removal

        Returns:
            True if successful
        """
        try:
            self.client.images.remove(tag, force=force)
            return True
        except (ImageNotFound, APIError):
            return False

    def list_images(
        self, filters: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """List Docker images.

        Args:
            filters: Optional filters

        Returns:
            List of image information
        """
        try:
            images = self.client.images.list(filters=filters)
            return [
                {
                    "id": img.id,
                    "tags": img.tags,
                    "size": img.attrs.get("Size", 0),
                    "created": img.attrs.get("Created"),
                }
                for img in images
            ]
        except APIError:
            return []

    def get_image_size(self, tag: str) -> int:
        """Get image size in bytes.

        Args:
            tag: Image tag

        Returns:
            Size in bytes or 0 if not found
        """
        try:
            image = self.client.images.get(tag)
            return int(image.attrs.get("Size", 0) or 0)
        except ImageNotFound:
            return 0

    def tag_image(self, source: str, target: str) -> bool:
        """Tag a Docker image.

        Args:
            source: Source image tag
            target: Target image tag

        Returns:
            True if successful
        """
        try:
            image = self.client.images.get(source)
            # Parse target into repository and tag
            if ":" in target:
                repository, tag = target.rsplit(":", 1)
            else:
                repository = target
                tag = "latest"

            return bool(image.tag(repository, tag))
        except (ImageNotFound, APIError):
            return False

    def run_container(
        self,
        image: str,
        command: str | None = None,
        detach: bool = False,
        enable_gpu: bool = True,
        **kwargs: Any,
    ) -> Any:
        """Run a container.

        Args:
            image: Image to run
            command: Command to execute
            detach: Run in detached mode
            enable_gpu: Whether to enable GPU support if available
            **kwargs: Additional arguments for container run

        Returns:
            Container object
        """
        try:
            # Add GPU support if available and requested
            if enable_gpu and "device_requests" not in kwargs:
                try:
                    runtimes = self.client.info().get("Runtimes", {})
                    if isinstance(runtimes, dict) and "nvidia" in runtimes:
                        kwargs["device_requests"] = [
                            docker.types.DeviceRequest(
                                device_ids=["all"], capabilities=[["gpu"]]
                            )
                        ]
                except Exception:
                    # Ignore GPU detection errors; run without GPU
                    pass

            return self.client.containers.run(
                image=image, command=command, detach=detach, **kwargs
            )
        except APIError as e:
            raise RuntimeError(f"Failed to run container: {e}") from e

    def cleanup_unused_images(self) -> dict[str, Any]:
        """Clean up unused Docker images.

        Returns:
            Cleanup results
        """
        try:
            result = self.client.images.prune()
            return {
                "images_deleted": len(result.get("ImagesDeleted", [])),
                "space_reclaimed": result.get("SpaceReclaimed", 0),
            }
        except APIError:
            return {"images_deleted": 0, "space_reclaimed": 0}

    def get_context_size(self, context_path: str) -> int:
        """Calculate build context size.

        Args:
            context_path: Path to build context

        Returns:
            Size in bytes
        """
        total_size = 0
        path = Path(context_path)

        if path.is_file():
            return path.stat().st_size

        for item in path.rglob("*"):
            if item.is_file():
                total_size += item.stat().st_size

        return total_size

    def validate_dockerfile(self, dockerfile_path: str) -> bool:
        """Validate Dockerfile syntax.

        Args:
            dockerfile_path: Path to Dockerfile

        Returns:
            True if valid
        """
        path = Path(dockerfile_path)

        if not path.exists():
            return False

        content = path.read_text()

        # Basic validation
        if not content.strip():
            return False

        # Check for FROM instruction
        return any(
            line.strip().upper().startswith("FROM") for line in content.split("\n")
        )
