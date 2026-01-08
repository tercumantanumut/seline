"""Unit tests for DockerfileBuilder module."""

import pytest

from src.containers.dockerfile_builder import DockerfileBuilder


class TestDockerfileBuilder:
    """Test cases for DockerfileBuilder class."""

    @pytest.fixture
    def builder(self):
        """Create DockerfileBuilder instance."""
        return DockerfileBuilder()

    @pytest.fixture
    def workflow_dependencies(self):
        """Sample workflow dependencies."""
        return {
            "models": {
                "checkpoints": ["sd_xl_base.safetensors"],
                "loras": ["style_lora.safetensors"],
                "vaes": ["vae_ft_mse.safetensors"],
            },
            "custom_nodes": [
                {
                    "class_type": "ComfyUI_IPAdapter",
                    "repository": "https://github.com/cubiq/ComfyUI_IPAdapter_plus",
                    "commit": "abc123",
                    "python_dependencies": ["insightface", "onnxruntime"],
                }
            ],
            "python_packages": {"numpy", "opencv-python", "torch"},
        }

    def test_create_basic_dockerfile(self, builder):
        """Test creating basic Dockerfile."""
        dockerfile = builder.create_basic(base_image="python:3.12-slim", workdir="/app")

        assert "FROM python:3.12-slim" in dockerfile
        assert "WORKDIR /app" in dockerfile
        assert "RUN useradd" in dockerfile  # Non-root user

    def test_create_multi_stage_dockerfile(self, builder):
        """Test creating multi-stage Dockerfile."""
        dockerfile = builder.create_multi_stage(
            base_image="python:3.12", runtime_image="python:3.12-slim"
        )

        assert "FROM python:3.12 AS builder" in dockerfile
        assert "FROM python:3.12-slim AS runtime" in dockerfile
        assert "COPY --from=builder" in dockerfile

    def test_add_python_packages(self, builder):
        """Test adding Python package installation."""
        packages = ["numpy", "torch", "opencv-python"]
        commands = builder.add_python_packages(packages)

        assert any("pip install" in cmd for cmd in commands)
        assert any("numpy" in cmd for cmd in commands)

    def test_add_system_packages(self, builder):
        """Test adding system package installation."""
        packages = ["git", "wget", "curl"]
        commands = builder.add_system_packages(packages)

        assert any("apt-get update" in cmd for cmd in commands)
        # Packages are sorted, so check for "curl git wget"
        assert any("curl git wget" in cmd for cmd in commands)

    def test_add_cuda_support(self, builder):
        """Test adding CUDA support to Dockerfile."""
        dockerfile = builder.create_with_cuda(cuda_version="11.8", cudnn_version="8")

        assert "nvidia/cuda" in dockerfile
        assert "11.8" in dockerfile
        assert "cudnn" in dockerfile.lower()

    def test_add_custom_nodes(self, builder, workflow_dependencies):
        """Test adding custom node installation."""
        custom_nodes = workflow_dependencies["custom_nodes"]
        commands = builder.add_custom_nodes(custom_nodes)

        assert any("git clone" in cmd for cmd in commands)
        assert any("ComfyUI_IPAdapter_plus" in cmd for cmd in commands)
        assert any("insightface" in cmd for cmd in commands)

    def test_add_model_downloads(self, builder, workflow_dependencies):
        """Test adding model download commands."""
        models = workflow_dependencies["models"]
        commands = builder.add_model_downloads(models)

        assert any("sd_xl_base.safetensors" in cmd for cmd in commands)
        assert any("wget" in cmd or "curl" in cmd for cmd in commands)

    def test_optimize_layers(self, builder):
        """Test Dockerfile layer optimization."""
        commands = [
            "RUN apt-get update",
            "RUN apt-get install -y git",
            "RUN apt-get install -y wget",
            "RUN pip install numpy",
            "RUN pip install torch",
        ]

        optimized = builder.optimize_layers(commands)

        # Should combine similar commands
        assert len(optimized) < len(commands)
        assert any("&&" in cmd for cmd in optimized)

    def test_add_healthcheck(self, builder):
        """Test adding healthcheck to Dockerfile."""
        healthcheck = builder.add_healthcheck(
            command="curl -f http://localhost:8188/health || exit 1",
            interval="30s",
            timeout="10s",
            retries=3,
        )

        assert "HEALTHCHECK" in healthcheck
        assert "--interval=30s" in healthcheck
        assert "--timeout=10s" in healthcheck
        assert "--retries=3" in healthcheck

    def test_add_environment_variables(self, builder):
        """Test adding environment variables."""
        env_vars = {
            "PYTHONUNBUFFERED": "1",
            "COMFYUI_PORT": "8188",
            "CUDA_VISIBLE_DEVICES": "0",
        }

        commands = builder.add_environment_variables(env_vars)

        assert any("ENV PYTHONUNBUFFERED=1" in cmd for cmd in commands)
        assert any("ENV COMFYUI_PORT=8188" in cmd for cmd in commands)

    def test_add_volume_mounts(self, builder):
        """Test adding volume declarations."""
        volumes = ["/data/models", "/data/outputs", "/data/inputs"]
        commands = builder.add_volumes(volumes)

        assert any("VOLUME" in cmd for cmd in commands)
        assert any("/data/models" in cmd for cmd in commands)

    def test_add_entrypoint(self, builder):
        """Test adding entrypoint and command."""
        entrypoint = builder.add_entrypoint(
            entrypoint=["python", "-u"], command=["main.py", "--listen", "0.0.0.0"]
        )

        assert "ENTRYPOINT" in entrypoint
        assert '["python", "-u"]' in entrypoint
        assert "CMD" in entrypoint
        assert '["main.py", "--listen", "0.0.0.0"]' in entrypoint

    def test_full_workflow_dockerfile(self, builder, workflow_dependencies):
        """Test generating complete Dockerfile for workflow."""
        dockerfile = builder.build_for_workflow(
            workflow_dependencies, base_image="python:3.12-slim", use_cuda=False
        )

        assert "FROM python:3.12-slim" in dockerfile
        assert "WORKDIR" in dockerfile
        assert "RUN pip install" in dockerfile
        assert "EXPOSE" in dockerfile
        assert "CMD" in dockerfile or "ENTRYPOINT" in dockerfile

    def test_dockerfile_with_cache_optimization(self, builder):
        """Test Dockerfile with cache mount optimization."""
        dockerfile = builder.create_with_cache_mounts()

        assert "--mount=type=cache" in dockerfile
        assert "target=/root/.cache/pip" in dockerfile

    def test_security_hardening(self, builder):
        """Test security hardening in Dockerfile."""
        dockerfile = builder.create_secure(base_image="python:3.12-slim")

        # Non-root user
        assert "useradd" in dockerfile or "adduser" in dockerfile
        assert "USER" in dockerfile

        # No sudo/su
        assert "sudo" not in dockerfile

        # Minimal base image
        assert "slim" in dockerfile or "alpine" in dockerfile

    def test_arg_and_build_args(self, builder):
        """Test ARG instructions for build arguments."""
        args = {
            "PYTHON_VERSION": "3.12",
            "COMFYUI_VERSION": "latest",
            "MODEL_PATH": "/models",
        }

        commands = builder.add_build_args(args)

        assert any("ARG PYTHON_VERSION" in cmd for cmd in commands)
        assert any("ARG COMFYUI_VERSION" in cmd for cmd in commands)

    def test_copy_instructions(self, builder):
        """Test generating COPY instructions."""
        copies = [
            ("requirements.txt", "/app/requirements.txt"),
            ("src/", "/app/src/"),
            ("config.yaml", "/app/config.yaml"),
        ]

        commands = builder.add_copy_instructions(copies)

        assert any(
            "COPY requirements.txt /app/requirements.txt" in cmd for cmd in commands
        )
        assert any("COPY src/ /app/src/" in cmd for cmd in commands)

    def test_run_as_non_root(self, builder):
        """Test ensuring container runs as non-root user."""
        commands = builder.setup_non_root_user(username="comfyuser", uid=1000)

        assert any("useradd" in cmd or "adduser" in cmd for cmd in commands)
        assert any("comfyuser" in cmd for cmd in commands)
        assert any("USER comfyuser" in cmd for cmd in commands)

    def test_minimize_final_size(self, builder):
        """Test final image size minimization."""
        dockerfile = builder.create_minimal(
            base_image="python:3.12-slim", packages=["numpy", "pillow"]
        )

        # Multi-stage build
        assert "AS builder" in dockerfile
        assert "AS runtime" in dockerfile

        # Clean up in same layer
        assert (
            "apt-get clean" in dockerfile or "rm -rf /var/lib/apt/lists/*" in dockerfile
        )

        # No development tools in runtime
        assert dockerfile.count("gcc") == 0 or "AS builder" in dockerfile
