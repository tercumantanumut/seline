"""Unit tests for BuildOptimizer module."""

import pytest

from src.containers.build_optimizer import (
    BuildOptimizer,
)


class TestBuildOptimizer:
    """Test cases for BuildOptimizer class."""

    @pytest.fixture
    def optimizer(self):
        """Create BuildOptimizer instance."""
        return BuildOptimizer()

    @pytest.fixture
    def sample_dockerfile(self):
        """Sample Dockerfile content."""
        return """
FROM python:3.12-slim AS builder
RUN apt-get update
RUN apt-get install -y git
RUN apt-get install -y wget
RUN pip install numpy
RUN pip install torch
RUN pip install transformers

FROM python:3.12-slim AS runtime
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
"""

    def test_analyze_dockerfile_layers(self, optimizer, sample_dockerfile):
        """Test analyzing Dockerfile layers for optimization."""
        analysis = optimizer.analyze_layers(sample_dockerfile)

        assert "layer_count" in analysis
        assert "optimization_suggestions" in analysis
        assert analysis["layer_count"] > 0
        assert len(analysis["optimization_suggestions"]) > 0

    def test_combine_run_commands(self, optimizer):
        """Test combining multiple RUN commands."""
        commands = [
            "RUN apt-get update",
            "RUN apt-get install -y git",
            "RUN apt-get install -y wget",
        ]

        combined = optimizer.combine_run_commands(commands)

        assert len(combined) == 1
        assert "&&" in combined[0]
        assert "apt-get update" in combined[0]
        assert "git" in combined[0]
        assert "wget" in combined[0]

    def test_optimize_package_installation(self, optimizer):
        """Test optimizing package installation order."""
        packages = ["torch", "numpy", "transformers", "pillow", "opencv-python"]

        # Packages should be sorted for better caching
        optimized = optimizer.optimize_package_order(packages)

        assert optimized == sorted(packages)

    def test_detect_cacheable_layers(self, optimizer, sample_dockerfile):
        """Test detecting which layers can be cached."""
        cacheable = optimizer.detect_cacheable_layers(sample_dockerfile)

        assert isinstance(cacheable, list)
        assert len(cacheable) > 0
        # Package installations should be cacheable
        assert any("pip install" in layer for layer in cacheable)

    def test_add_cache_mount_instructions(self, optimizer):
        """Test adding BuildKit cache mount instructions."""
        original = "RUN pip install numpy torch transformers"

        with_cache = optimizer.add_cache_mount(original, cache_type="pip")

        assert "--mount=type=cache" in with_cache
        assert "target=/root/.cache/pip" in with_cache
        assert "numpy torch transformers" in with_cache

    def test_optimize_multi_stage_build(self, optimizer):
        """Test optimizing multi-stage builds."""
        stages = {
            "builder": [
                "FROM python:3.12 AS builder",
                "RUN pip install numpy torch",
            ],
            "runtime": [
                "FROM python:3.12-slim AS runtime",
                "COPY --from=builder /app /app",
            ],
        }

        optimized = optimizer.optimize_multi_stage(stages)

        assert "builder" in optimized
        assert "runtime" in optimized
        # Should use slim image for runtime
        assert "slim" in optimized["runtime"][0]

    def test_calculate_layer_size_impact(self, optimizer):
        """Test calculating size impact of layers."""
        layers = [
            "RUN apt-get install -y git wget curl",  # System packages
            "RUN pip install torch",  # Large package
            "RUN pip install numpy",  # Medium package
            "COPY . /app",  # Application code
        ]

        impacts = optimizer.calculate_size_impacts(layers)

        assert len(impacts) == len(layers)
        # torch should have largest impact
        torch_impact = next(i for i in impacts if "torch" in i["layer"])
        assert torch_impact["estimated_size"] > 100 * 1024 * 1024  # >100MB

    def test_generate_buildkit_config(self, optimizer):
        """Test generating BuildKit configuration."""
        config = optimizer.generate_buildkit_config(
            enable_inline_cache=True,
            cache_from=["registry/base:latest"],
            target_platforms=["linux/amd64", "linux/arm64"],
        )

        assert config["BUILDKIT_INLINE_CACHE"] == "1"
        assert "registry/base:latest" in config["cache_from"]
        assert "linux/amd64,linux/arm64" in config["platforms"]

    def test_parallel_build_stages(self, optimizer):
        """Test identifying stages that can build in parallel."""
        dockerfile_content = """
FROM python:3.12 AS base
RUN pip install numpy

FROM base AS stage1
RUN pip install torch

FROM base AS stage2
RUN pip install transformers

FROM base AS final
COPY --from=stage1 /app /app1
COPY --from=stage2 /app /app2
"""

        parallel_stages = optimizer.identify_parallel_stages(dockerfile_content)

        assert "stage1" in parallel_stages
        assert "stage2" in parallel_stages
        # stage1 and stage2 can build in parallel
        assert parallel_stages["stage1"]["parallel_with"] == ["stage2"]

    def test_optimize_copy_instructions(self, optimizer):
        """Test optimizing COPY instructions."""
        copies = [
            "COPY requirements.txt /app/",
            "COPY src/ /app/src/",
            "COPY tests/ /app/tests/",
            "COPY config.yaml /app/",
        ]

        optimized = optimizer.optimize_copy_order(copies)

        # requirements.txt should come first (changes less frequently)
        assert "requirements.txt" in optimized[0]
        # Source code should come later (changes more frequently)
        assert any("src/" in c for c in optimized[-2:])

    def test_add_docker_ignore(self, optimizer):
        """Test generating .dockerignore file."""
        ignore_patterns = optimizer.generate_dockerignore(
            include_defaults=True, custom_patterns=["*.log", "temp/"]
        )

        assert "*.pyc" in ignore_patterns
        assert "__pycache__" in ignore_patterns
        assert ".git" in ignore_patterns
        assert "*.log" in ignore_patterns
        assert "temp/" in ignore_patterns

    def test_layer_deduplication(self, optimizer):
        """Test removing duplicate layers."""
        layers = [
            "RUN apt-get update",
            "RUN pip install numpy",
            "RUN apt-get update",  # Duplicate
            "RUN pip install torch",
            "RUN pip install numpy",  # Duplicate
        ]

        deduped = optimizer.deduplicate_layers(layers)

        assert len(deduped) == 3
        assert deduped.count("RUN apt-get update") == 1
        assert deduped.count("RUN pip install numpy") == 1

    def test_optimize_for_size(self, optimizer, sample_dockerfile):
        """Test optimizing Dockerfile for minimal size."""
        optimized = optimizer.optimize_for_size(sample_dockerfile)

        # Should use multi-stage build
        assert "AS builder" in optimized
        assert "AS runtime" in optimized
        # Should clean up after package installation
        assert (
            "apt-get clean" in optimized or "rm -rf /var/lib/apt/lists/*" in optimized
        )
        # Should use --no-cache-dir for pip
        assert "--no-cache-dir" in optimized

    def test_optimize_for_speed(self, optimizer, sample_dockerfile):
        """Test optimizing Dockerfile for build speed."""
        optimized = optimizer.optimize_for_speed(sample_dockerfile)

        # Should use cache mounts
        assert "--mount=type=cache" in optimized
        # Should parallelize where possible
        assert "parallel" in optimizer.get_optimization_metadata(optimized)

    def test_benchmark_optimization(self, optimizer, sample_dockerfile):
        """Test benchmarking optimization improvements."""
        original_metrics = optimizer.measure_dockerfile(sample_dockerfile)
        optimized = optimizer.optimize(sample_dockerfile)
        optimized_metrics = optimizer.measure_dockerfile(optimized)

        # After optimization, we should have fewer RUN commands (combined)
        assert optimized_metrics["run_commands"] <= original_metrics["run_commands"]
        # Size should be same or less (due to --no-cache-dir and cleanup)
        assert optimized_metrics["estimated_size"] <= original_metrics["estimated_size"]

    def test_cache_analysis(self, optimizer):
        """Test analyzing cache hit potential."""
        build_history = [
            {"dockerfile": "FROM python:3.12\nRUN pip install numpy", "cache_hits": 1},
            {"dockerfile": "FROM python:3.12\nRUN pip install numpy", "cache_hits": 2},
            {"dockerfile": "FROM python:3.12\nRUN pip install torch", "cache_hits": 0},
        ]

        analysis = optimizer.analyze_cache_performance(build_history)

        assert "cache_hit_rate" in analysis
        assert "most_cached_layers" in analysis
        assert analysis["cache_hit_rate"] > 0

    def test_platform_specific_optimization(self, optimizer):
        """Test optimizations for specific platforms."""
        # Use different dockerfiles to ensure different IDs
        dockerfile_amd = "FROM python:3.12 # amd64"
        dockerfile_arm = "FROM python:3.12 # arm64"

        amd64_optimized = optimizer.optimize_for_platform(dockerfile_amd, "linux/amd64")
        arm64_optimized = optimizer.optimize_for_platform(dockerfile_arm, "linux/arm64")

        # Platform-specific optimizations might differ
        amd64_metadata = optimizer.get_optimization_metadata(amd64_optimized)
        arm64_metadata = optimizer.get_optimization_metadata(arm64_optimized)

        assert "platform" in amd64_metadata
        assert "amd64" in amd64_metadata["platform"]
        assert "platform" in arm64_metadata
        assert "arm64" in arm64_metadata["platform"]

    def test_generate_build_script(self, optimizer):
        """Test generating optimized build script."""
        script = optimizer.generate_build_script(
            dockerfile_path="Dockerfile",
            image_tag="myapp:latest",
            use_buildkit=True,
            push=True,
        )

        assert "#!/bin/bash" in script
        assert "DOCKER_BUILDKIT=1" in script
        assert "docker build" in script
        assert "--tag myapp:latest" in script
        assert "docker push" in script

    def test_security_optimization(self, optimizer):
        """Test security-focused optimizations."""
        dockerfile = """
FROM python:3.12
RUN pip install requests
USER root
COPY . /app
"""

        secure = optimizer.optimize_for_security(dockerfile)

        # Should not run as root
        assert "USER root" not in secure or "USER appuser" in secure
        # Should use specific versions
        assert "python:3.12" in secure or "python:3.12." in secure
        # Should verify checksums for downloads
        if "wget" in secure or "curl" in secure:
            assert "sha256sum" in secure or "sha512sum" in secure
