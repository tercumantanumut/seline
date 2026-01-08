"""Build optimization for Docker containers."""

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LayerOptimization:
    """Optimization suggestion for a layer."""

    layer: str
    suggestion: str
    impact: str  # high, medium, low
    estimated_savings: int  # bytes


@dataclass
class BuildCache:
    """Cache configuration for builds."""

    inline_cache: bool = True
    cache_from: list[str] = field(default_factory=list)
    cache_to: list[str] = field(default_factory=list)
    mount_caches: dict[str, str] = field(default_factory=dict)


class BuildOptimizer:
    """Optimizes Docker builds for size and speed."""

    # Common package sizes (approximate)
    PACKAGE_SIZES = {
        "torch": 800 * 1024 * 1024,  # ~800MB
        "tensorflow": 500 * 1024 * 1024,
        "numpy": 20 * 1024 * 1024,
        "pandas": 30 * 1024 * 1024,
        "transformers": 50 * 1024 * 1024,
        "opencv-python": 60 * 1024 * 1024,
        "pillow": 3 * 1024 * 1024,
    }

    def __init__(self) -> None:
        """Initialize build optimizer."""
        self.optimization_metadata: dict[int, Any] = {}

    def analyze_layers(self, dockerfile_content: str) -> dict[str, Any]:
        """Analyze Dockerfile layers for optimization opportunities.

        Args:
            dockerfile_content: Dockerfile content as string

        Returns:
            Analysis results with suggestions
        """
        lines = dockerfile_content.strip().split("\n")
        layers = [
            line for line in lines if line.strip() and not line.strip().startswith("#")
        ]

        suggestions = []

        # Check for multiple RUN commands that could be combined
        run_commands = [line for line in layers if line.startswith("RUN")]
        if len(run_commands) > 3:
            suggestions.append("Combine multiple RUN commands to reduce layers")

        # Check for missing cleanup
        if any("apt-get install" in line for line in layers) and not any(
            "apt-get clean" in line or "rm -rf /var/lib/apt" in line for line in layers
        ):
            suggestions.append("Add cleanup after apt-get install to reduce image size")

        # Check for missing --no-cache-dir
        if any("pip install" in line for line in layers) and not any(
            "--no-cache-dir" in line for line in layers if "pip install" in line
        ):
            suggestions.append(
                "Use --no-cache-dir with pip install to reduce image size"
            )

        return {
            "layer_count": len(layers),
            "optimization_suggestions": suggestions,
            "run_commands": len(run_commands),
        }

    def combine_run_commands(self, commands: list[str]) -> list[str]:
        """Combine multiple RUN commands into one.

        Args:
            commands: List of RUN commands

        Returns:
            Combined RUN command(s)
        """
        if not commands:
            return []

        # Group by command type
        apt_commands = []
        pip_commands = []
        other_commands = []

        for cmd in commands:
            clean_cmd = cmd.replace("RUN ", "").strip()
            if "apt-get" in clean_cmd:
                apt_commands.append(clean_cmd)
            elif "pip install" in clean_cmd:
                pip_commands.append(clean_cmd)
            else:
                other_commands.append(clean_cmd)

        combined = []

        # Combine apt-get commands
        if apt_commands:
            combined_apt = "RUN " + " && \\\n    ".join(apt_commands)
            if "apt-get install" in combined_apt:
                combined_apt += (
                    " && \\\n    apt-get clean && \\\n    rm -rf /var/lib/apt/lists/*"
                )
            combined.append(combined_apt)

        # Combine pip commands
        if pip_commands:
            # Extract all packages
            packages = []
            for cmd in pip_commands:
                # Simple extraction (could be improved)
                parts = cmd.split("pip install")[-1].strip()
                packages.extend(parts.split())

            if packages:
                combined.append(f"RUN pip install --no-cache-dir {' '.join(packages)}")

        # Add other commands as-is
        combined.extend([f"RUN {cmd}" for cmd in other_commands])

        return combined

    def optimize_package_order(self, packages: list[str]) -> list[str]:
        """Optimize package installation order for better caching.

        Args:
            packages: List of package names

        Returns:
            Sorted package list
        """
        # Sort alphabetically for consistent caching
        return sorted(packages)

    def detect_cacheable_layers(self, dockerfile_content: str) -> list[str]:
        """Detect which layers can be cached effectively.

        Args:
            dockerfile_content: Dockerfile content

        Returns:
            List of cacheable layers
        """
        cacheable = []
        lines = dockerfile_content.strip().split("\n")

        for line in lines:
            line = line.strip()
            # Package installations are good cache candidates
            if (
                line.startswith("RUN")
                and any(
                    keyword in line
                    for keyword in ["apt-get install", "pip install", "npm install"]
                )
                or line.startswith("COPY")
                and any(
                    file in line
                    for file in ["requirements.txt", "package.json", "Gemfile"]
                )
            ):
                cacheable.append(line)

        return cacheable

    def add_cache_mount(self, command: str, cache_type: str = "pip") -> str:
        """Add BuildKit cache mount to command.

        Args:
            command: Original RUN command
            cache_type: Type of cache (pip, apt, npm, etc.)

        Returns:
            Command with cache mount
        """
        cache_targets = {
            "pip": "/root/.cache/pip",
            "apt": "/var/cache/apt",
            "npm": "/root/.npm",
            "go": "/go/pkg/mod",
        }

        target = cache_targets.get(cache_type, "/tmp/cache")  # nosec B108

        if command.startswith("RUN "):
            command = command[4:]

        return f"RUN --mount=type=cache,target={target} \\\n    {command}"

    def optimize_multi_stage(
        self, stages: dict[str, list[str]]
    ) -> dict[str, list[str]]:
        """Optimize multi-stage build.

        Args:
            stages: Dictionary of stage names to commands

        Returns:
            Optimized stages
        """
        optimized = {}

        for stage_name, commands in stages.items():
            optimized_commands = commands.copy()

            # Use slim images for runtime stages
            if stage_name in ["runtime", "final", "production"]:
                for i, cmd in enumerate(optimized_commands):
                    if (
                        cmd.startswith("FROM")
                        and "slim" not in cmd
                        and "alpine" not in cmd
                        and "python:" in cmd
                    ):
                        # Suggest using slim variant
                        optimized_commands[i] = cmd.replace(
                            "python:", "python:"
                        ).replace(" AS", "-slim AS")

            optimized[stage_name] = optimized_commands

        return optimized

    def calculate_size_impacts(self, layers: list[str]) -> list[dict[str, Any]]:
        """Calculate estimated size impact of layers.

        Args:
            layers: List of Dockerfile commands

        Returns:
            Size impact analysis
        """
        impacts = []

        for layer in layers:
            impact = {"layer": layer, "estimated_size": 0, "type": "unknown"}

            # Estimate package sizes
            if "pip install" in layer:
                size = 0
                for package, package_size in self.PACKAGE_SIZES.items():
                    if package in layer.lower():
                        size += package_size

                if size == 0:  # Unknown packages
                    size = 10 * 1024 * 1024  # Default 10MB

                impact["estimated_size"] = size
                impact["type"] = "python_packages"

            elif "apt-get install" in layer:
                # Rough estimate for system packages
                packages = re.findall(r"\b\w+\b", layer.split("install")[-1])
                impact["estimated_size"] = (
                    len(packages) * 5 * 1024 * 1024
                )  # 5MB per package average
                impact["type"] = "system_packages"

            elif layer.startswith("COPY"):
                # Can't estimate without context
                impact["estimated_size"] = 1024 * 1024  # 1MB default
                impact["type"] = "copy"

            impacts.append(impact)

        return impacts

    def generate_buildkit_config(
        self,
        enable_inline_cache: bool = True,
        cache_from: list[str] | None = None,
        target_platforms: list[str] | None = None,
    ) -> dict[str, Any]:
        """Generate BuildKit configuration.

        Args:
            enable_inline_cache: Enable inline cache
            cache_from: List of cache sources
            target_platforms: Target platforms

        Returns:
            BuildKit configuration
        """
        config = {}

        if enable_inline_cache:
            config["BUILDKIT_INLINE_CACHE"] = "1"

        if cache_from:
            config["cache_from"] = cache_from  # type: ignore

        if target_platforms:
            config["platforms"] = ",".join(target_platforms)

        config["DOCKER_BUILDKIT"] = "1"

        return config

    def identify_parallel_stages(self, dockerfile_content: str) -> dict[str, Any]:
        """Identify stages that can build in parallel.

        Args:
            dockerfile_content: Dockerfile content

        Returns:
            Parallel stage information
        """
        stages: dict[str, Any] = {}
        lines = dockerfile_content.strip().split("\n")

        current_stage = None

        for line in lines:
            line = line.strip()

            # Identify stage definitions
            if line.startswith("FROM") and " AS " in line:
                stage_name = line.split(" AS ")[-1].strip()
                current_stage = stage_name
                stages[stage_name] = {"depends_on": [], "parallel_with": []}

                # Check if it depends on another stage
                if " FROM " in line:
                    from_part = line.split(" FROM ")[-1].split(" AS ")[0].strip()
                    if from_part in stages:
                        stages[stage_name]["depends_on"].append(from_part)

            # Check for COPY --from dependencies
            elif current_stage and "COPY --from=" in line:
                from_stage = re.search(r"--from=(\w+)", line)
                if from_stage:
                    dep_stage = from_stage.group(1)
                    if dep_stage != current_stage:
                        stages[current_stage]["depends_on"].append(dep_stage)

        # Identify parallel opportunities
        for stage1 in stages:
            for stage2 in stages:
                if (
                    stage1 != stage2
                    and stage2 not in stages[stage1]["depends_on"]
                    and stage1 not in stages[stage2]["depends_on"]
                    and stage1 != "base"
                    and stage2 != "base"
                    and stage2 not in stages[stage1]["parallel_with"]
                ):
                    stages[stage1]["parallel_with"].append(stage2)

        return stages

    def optimize_copy_order(self, copies: list[str]) -> list[str]:
        """Optimize COPY instruction order for better caching.

        Args:
            copies: List of COPY commands

        Returns:
            Optimized order
        """
        # Sort by likelihood of change (less likely to change first)
        config_files = []
        dependency_files = []
        source_files = []
        other_files = []

        for copy in copies:
            if any(
                f in copy
                for f in ["requirements.txt", "package.json", "Gemfile", "go.mod"]
            ):
                dependency_files.append(copy)
            elif any(f in copy for f in [".yaml", ".yml", ".json", ".toml", "config"]):
                config_files.append(copy)
            elif any(f in copy for f in ["src/", "app/", "lib/"]):
                source_files.append(copy)
            else:
                other_files.append(copy)

        # Order: dependencies -> config -> other -> source (most likely to change)
        return dependency_files + config_files + other_files + source_files

    def generate_dockerignore(
        self, include_defaults: bool = True, custom_patterns: list[str] | None = None
    ) -> list[str]:
        """Generate .dockerignore patterns.

        Args:
            include_defaults: Include default patterns
            custom_patterns: Additional patterns

        Returns:
            List of ignore patterns
        """
        patterns = []

        if include_defaults:
            patterns.extend(
                [
                    "*.pyc",
                    "__pycache__",
                    ".git",
                    ".gitignore",
                    ".dockerignore",
                    "Dockerfile*",
                    "docker-compose*.yml",
                    ".env",
                    ".venv",
                    "venv",
                    "*.egg-info",
                    ".pytest_cache",
                    ".coverage",
                    "htmlcov",
                    ".vscode",
                    ".idea",
                    "*.swp",
                    "*.swo",
                    ".DS_Store",
                    "node_modules",
                    "npm-debug.log",
                ]
            )

        if custom_patterns:
            patterns.extend(custom_patterns)

        return patterns

    def deduplicate_layers(self, layers: list[str]) -> list[str]:
        """Remove duplicate layers.

        Args:
            layers: List of Dockerfile commands

        Returns:
            Deduplicated list
        """
        seen = set()
        deduped = []

        for layer in layers:
            if layer not in seen:
                seen.add(layer)
                deduped.append(layer)

        return deduped

    def optimize_for_size(self, dockerfile_content: str) -> str:
        """Optimize Dockerfile for minimal size.

        Args:
            dockerfile_content: Original Dockerfile

        Returns:
            Optimized Dockerfile
        """
        lines = dockerfile_content.strip().split("\n")
        optimized = []

        for line in lines:
            line = line.strip()

            # Add cleanup to apt-get installs
            if "apt-get install" in line and "apt-get clean" not in line:
                if line.startswith("RUN"):
                    line = (
                        line
                        + " && \\\n    apt-get clean && \\\n    rm -rf /var/lib/apt/lists/*"
                    )

            # Add --no-cache-dir to pip installs
            elif "pip install" in line and "--no-cache-dir" not in line:
                line = line.replace("pip install", "pip install --no-cache-dir")

            optimized.append(line)

        return "\n".join(optimized)

    def optimize_for_speed(self, dockerfile_content: str) -> str:
        """Optimize Dockerfile for build speed.

        Args:
            dockerfile_content: Original Dockerfile

        Returns:
            Optimized Dockerfile
        """
        lines = dockerfile_content.strip().split("\n")
        optimized = []

        for line in lines:
            line = line.strip()

            # Add cache mounts to package installations
            if line.startswith("RUN pip install"):
                line = self.add_cache_mount(line, "pip")
            elif line.startswith("RUN apt-get"):
                line = self.add_cache_mount(line, "apt")

            optimized.append(line)

        result = "\n".join(optimized)

        # Store metadata with the result string ID
        self.optimization_metadata[id(result)] = {"parallel": True}

        return result

    def optimize(self, dockerfile_content: str) -> str:
        """General optimization combining size and speed.

        Args:
            dockerfile_content: Original Dockerfile

        Returns:
            Optimized Dockerfile
        """
        # Combine RUN commands first to reduce layers
        lines = dockerfile_content.strip().split("\n")
        run_commands = [line for line in lines if line.startswith("RUN")]

        # Combine RUN commands
        if len(run_commands) > 1:
            combined = self.combine_run_commands(run_commands)
            # Rebuild dockerfile with combined commands
            result_lines = []
            run_inserted = False
            for line in lines:
                if line.startswith("RUN") and not run_inserted:
                    result_lines.extend(combined)
                    run_inserted = True
                elif not line.startswith("RUN"):
                    result_lines.append(line)

            dockerfile_content = "\n".join(result_lines)

        # Apply both optimizations
        optimized = self.optimize_for_size(dockerfile_content)
        optimized = self.optimize_for_speed(optimized)

        return optimized

    def measure_dockerfile(self, dockerfile_content: str) -> dict[str, Any]:
        """Measure Dockerfile metrics.

        Args:
            dockerfile_content: Dockerfile content

        Returns:
            Metrics dictionary
        """
        lines = dockerfile_content.strip().split("\n")
        layers = [
            line for line in lines if line.strip() and not line.strip().startswith("#")
        ]

        # Calculate estimated size
        impacts = self.calculate_size_impacts(layers)
        total_size = sum(i["estimated_size"] for i in impacts)

        return {
            "layer_count": len(layers),
            "estimated_size": total_size,
            "run_commands": len([line for line in layers if line.startswith("RUN")]),
        }

    def analyze_cache_performance(
        self, build_history: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Analyze cache performance from build history.

        Args:
            build_history: List of previous builds

        Returns:
            Cache analysis
        """
        total_builds = len(build_history)
        total_cache_hits = sum(b.get("cache_hits", 0) for b in build_history)

        # Find most cached layers
        layer_cache_counts: dict[str, int] = {}
        for build in build_history:
            if "dockerfile" in build:
                for line in build["dockerfile"].split("\n"):
                    if line.strip():
                        layer_cache_counts[line] = layer_cache_counts.get(
                            line, 0
                        ) + build.get("cache_hits", 0)

        most_cached = sorted(
            layer_cache_counts.items(), key=lambda x: x[1], reverse=True
        )[:5]

        return {
            "cache_hit_rate": total_cache_hits / max(total_builds, 1),
            "most_cached_layers": [layer for layer, _ in most_cached],
            "total_cache_hits": total_cache_hits,
        }

    def optimize_for_platform(self, dockerfile_content: str, platform: str) -> str:
        """Optimize for specific platform.

        Args:
            dockerfile_content: Original Dockerfile
            platform: Target platform

        Returns:
            Platform-optimized Dockerfile
        """
        # Store metadata with the content ID
        result = dockerfile_content
        self.optimization_metadata[id(result)] = {"platform": platform}

        # Platform-specific optimizations would go here
        if "arm64" in platform:
            # ARM-specific optimizations
            pass
        elif "amd64" in platform:
            # x86_64-specific optimizations
            pass

        return result

    def get_optimization_metadata(self, optimized_content: str) -> dict[str, Any]:
        """Get optimization metadata.

        Args:
            optimized_content: Optimized content

        Returns:
            Metadata dictionary
        """
        return self.optimization_metadata.get(id(optimized_content), {})

    def generate_build_script(
        self,
        dockerfile_path: str,
        image_tag: str,
        use_buildkit: bool = True,
        push: bool = False,
    ) -> str:
        """Generate optimized build script.

        Args:
            dockerfile_path: Path to Dockerfile
            image_tag: Image tag
            use_buildkit: Use BuildKit
            push: Push after build

        Returns:
            Build script
        """
        script = ["#!/bin/bash", "set -e", ""]

        if use_buildkit:
            script.append("export DOCKER_BUILDKIT=1")
            script.append("")

        build_cmd = f"docker build -f {dockerfile_path} --tag {image_tag} ."
        script.append(build_cmd)

        if push:
            script.append("")
            script.append(f"docker push {image_tag}")

        return "\n".join(script)

    def optimize_for_security(self, dockerfile_content: str) -> str:
        """Apply security-focused optimizations.

        Args:
            dockerfile_content: Original Dockerfile

        Returns:
            Security-optimized Dockerfile
        """
        lines = dockerfile_content.strip().split("\n")
        optimized = []

        has_user = False

        for line in lines:
            line = line.strip()

            # Remove explicit root user
            if line == "USER root":
                continue

            # Track if we have a user directive
            if line.startswith("USER") and "root" not in line:
                has_user = True

            optimized.append(line)

        # Add non-root user if missing
        if not has_user:
            optimized.append("")
            optimized.append("# Run as non-root user")
            optimized.append("USER appuser")

        return "\n".join(optimized)
