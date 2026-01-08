"""Dockerfile builder for ComfyUI containers."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class DockerfileBuilder:
    """Builder for generating optimized Dockerfiles."""

    def __init__(self) -> None:
        """Initialize Dockerfile builder."""
        self.instructions: list[str] = []

    def create_basic(self, base_image: str, workdir: str = "/app") -> str:
        """Create basic Dockerfile.

        Args:
            base_image: Base Docker image
            workdir: Working directory

        Returns:
            Dockerfile content
        """
        dockerfile = [
            f"FROM {base_image}",
            "",
            "# Create non-root user",
            "RUN useradd -m -u 1000 -s /bin/bash comfyuser",
            "",
            f"WORKDIR {workdir}",
            "",
        ]
        return "\n".join(dockerfile)

    def create_multi_stage(
        self,
        base_image: str,
        runtime_image: str,
        builder_name: str = "builder",
        runtime_name: str = "runtime",
    ) -> str:
        """Create multi-stage Dockerfile.

        Args:
            base_image: Base image for builder stage
            runtime_image: Base image for runtime stage
            builder_name: Name of builder stage
            runtime_name: Name of runtime stage

        Returns:
            Dockerfile content
        """
        dockerfile = [
            "# Builder stage",
            f"FROM {base_image} AS {builder_name}",
            "WORKDIR /build",
            "",
            "# Runtime stage",
            f"FROM {runtime_image} AS {runtime_name}",
            "",
            "# Copy from builder",
            f"COPY --from={builder_name} /build /app",
            "WORKDIR /app",
            "",
        ]
        return "\n".join(dockerfile)

    def add_python_packages(self, packages: list[str]) -> list[str]:
        """Add Python package installation commands.

        Args:
            packages: List of Python packages

        Returns:
            List of RUN commands
        """
        if not packages:
            return []

        packages_str = " ".join(sorted(packages))
        return [f"RUN pip install --no-cache-dir {packages_str}"]

    def add_system_packages(self, packages: list[str]) -> list[str]:
        """Add system package installation commands.

        Args:
            packages: List of system packages

        Returns:
            List of RUN commands
        """
        if not packages:
            return []

        packages_str = " ".join(sorted(packages))
        return [
            "RUN apt-get update && \\",
            f"    apt-get install -y --no-install-recommends {packages_str} && \\",
            "    apt-get clean && \\",
            "    rm -rf /var/lib/apt/lists/*",
        ]

    def create_with_cuda(
        self,
        cuda_version: str = "12.8.0",
        ubuntu_version: str = "22.04",
    ) -> str:
        """Create Dockerfile with CUDA support.

        Args:
            cuda_version: CUDA version
            ubuntu_version: Ubuntu version

        Returns:
            Dockerfile content
        """
        dockerfile = [
            f"FROM nvidia/cuda:{cuda_version}-runtime-ubuntu{ubuntu_version}",
            "",
            "# Install Python",
            "RUN apt-get update && \\",
            "    apt-get install -y python3 python3-pip && \\",
            "    ln -s /usr/bin/python3 /usr/bin/python && \\",
            "    ln -s /usr/bin/pip3 /usr/bin/pip && \\",
            "    apt-get clean && \\",
            "    rm -rf /var/lib/apt/lists/*",
            "",
            "WORKDIR /app",
            "",
        ]
        return "\n".join(dockerfile)

    def add_custom_nodes(self, custom_nodes: list[dict[str, Any]]) -> list[str]:
        """Add custom node installation commands.

        Args:
            custom_nodes: List of custom node configurations

        Returns:
            List of RUN commands
        """
        commands = []

        def _safe_dir(name: str) -> str:
            # Replace spaces with underscores and strip problematic characters
            allowed = set(
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
            )
            name = (name or "custom_node").replace(" ", "_")
            # Remove path separators just in case
            name = name.replace("/", "_").replace("\\", "_")
            # Filter to allowed chars
            return "".join(ch for ch in name if ch in allowed) or "custom_node"

        for node in custom_nodes:
            repository = node.get("repository")
            class_type = _safe_dir(node.get("class_type", "custom_node"))
            commit = node.get("commit")
            python_deps = node.get("python_dependencies", [])

            if repository:
                # Clone repository
                clone_cmd = f"RUN git clone {repository} /app/custom_nodes/{class_type}"
                if commit:
                    clone_cmd += f" && \\\n    cd /app/custom_nodes/{class_type} && \\\n    git checkout {commit}"
                commands.append(clone_cmd)

                # Install Python dependencies
                if python_deps:
                    deps_str = " ".join(python_deps)
                    commands.append(f"RUN pip install --no-cache-dir {deps_str}")

        return commands

    def add_model_downloads(self, models: dict[str, list[str]]) -> list[str]:
        """Add model download commands.

        Args:
            models: Dictionary of model types and files

        Returns:
            List of RUN commands
        """
        commands = []

        for model_type, model_files in models.items():
            if model_files:
                for model_file in model_files:
                    # Use wget for downloading (placeholder URL)
                    commands.append(
                        f"# Download {model_type}: {model_file}\n"
                        f"RUN wget -O /app/models/{model_type}/{model_file} \\\n"
                        f"    https://models.example.com/{model_type}/{model_file}"
                    )

        return commands

    def optimize_layers(self, commands: list[str]) -> list[str]:
        """Optimize Dockerfile layers by combining commands.

        Args:
            commands: List of Docker commands

        Returns:
            Optimized list of commands
        """
        optimized = []
        current_group = []

        for cmd in commands:
            if cmd.startswith("RUN apt-get") or cmd.startswith("RUN pip install"):
                current_group.append(cmd.replace("RUN ", ""))
            else:
                # Flush current group
                if current_group:
                    if all("apt-get" in c for c in current_group):
                        combined = " && \\\n    ".join(current_group)
                        optimized.append(f"RUN {combined}")
                    elif all("pip install" in c for c in current_group):
                        # Combine pip installs
                        packages = []
                        for c in current_group:
                            parts = c.split("pip install")[-1].strip()
                            packages.extend(parts.split())
                        optimized.append(
                            f"RUN pip install --no-cache-dir {' '.join(packages)}"
                        )
                    else:
                        optimized.extend([f"RUN {c}" for c in current_group])
                    current_group = []
                optimized.append(cmd)

        # Flush remaining
        if current_group:
            combined = " && \\\n    ".join(current_group)
            optimized.append(f"RUN {combined}")

        return optimized

    def add_healthcheck(
        self,
        command: str,
        interval: str = "30s",
        timeout: str = "10s",
        retries: int = 3,
        start_period: str = "0s",
    ) -> str:
        """Add healthcheck to Dockerfile.

        Args:
            command: Healthcheck command
            interval: Check interval
            timeout: Check timeout
            retries: Number of retries
            start_period: Start period

        Returns:
            HEALTHCHECK instruction
        """
        return (
            f"HEALTHCHECK --interval={interval} --timeout={timeout} "
            f"--retries={retries} --start-period={start_period} \\\n"
            f"    CMD {command}"
        )

    def add_environment_variables(self, env_vars: dict[str, str]) -> list[str]:
        """Add environment variables.

        Args:
            env_vars: Dictionary of environment variables

        Returns:
            List of ENV commands
        """
        return [f"ENV {key}={value}" for key, value in env_vars.items()]

    def add_volumes(self, volumes: list[str]) -> list[str]:
        """Add volume declarations.

        Args:
            volumes: List of volume paths

        Returns:
            List of VOLUME commands
        """
        if not volumes:
            return []

        volumes_str = " ".join(f'"{v}"' for v in volumes)
        return [f"VOLUME [{volumes_str}]"]

    def add_entrypoint(
        self, entrypoint: list[str] | None = None, command: list[str] | None = None
    ) -> str:
        """Add entrypoint and command.

        Args:
            entrypoint: Entrypoint command
            command: Default command

        Returns:
            ENTRYPOINT and CMD instructions
        """
        result = []

        if entrypoint:
            entrypoint_str = ", ".join(f'"{e}"' for e in entrypoint)
            result.append(f"ENTRYPOINT [{entrypoint_str}]")

        if command:
            command_str = ", ".join(f'"{c}"' for c in command)
            result.append(f"CMD [{command_str}]")

        return "\n".join(result)

    def build_for_workflow(
        self,
        dependencies: dict[str, Any],
        custom_nodes: list | None = None,
        base_image: str = "python:3.12-slim",
        use_cuda: bool = False,
        torch_version: str | None = None,
        cuda_variant: str | None = None,
        python_version: str | None = None,
        enable_accelerators: bool = False,
        accelerators: list[str] | None = None,
        compile_fallback: bool = False,
        cuda_devel_version: str = "12.9.0",
        ubuntu_version: str = "22.04",
        nunchaku_version: str | None = None,
        nunchaku_wheel_url: str | None = None,
        enable_nunchaku: bool = False,
        nunchaku_models_path: str | None = None,
        extra_commands: list[str] | None = None,
    ) -> str:
        """Build complete Dockerfile for workflow.

        Args:
            dependencies: Workflow dependencies
            custom_nodes: List of custom node metadata
            base_image: Base Docker image
            use_cuda: Whether to use CUDA

        Returns:
            Complete Dockerfile
        """
        # Auto-detect Python version based on base image if not specified
        if python_version is None:
            if "nvidia/cuda" in base_image or "cuda:" in base_image:
                # CUDA images use apt-installed Python which is 3.10 on Ubuntu 22.04
                python_version = "3.10"
            elif "python:" in base_image:
                # Extract version from python:X.Y-slim format
                import re
                match = re.search(r'python:(\d+\.\d+)', base_image)
                if match:
                    python_version = match.group(1)
                else:
                    python_version = "3.12"  # default
            else:
                python_version = "3.10"  # default for other images

        lines = []

        # Base image
        lines.append(f"FROM {base_image}")
        lines.append("")

        # Avoid interactive prompts during apt operations
        lines.append("ENV DEBIAN_FRONTEND=noninteractive")
        lines.append("")

        # Install Python and create symlinks for CUDA images
        if use_cuda:
            lines.append(f"# Install Python {python_version} and create symlinks")
            if python_version == "3.10":
                # Ubuntu 22.04 has Python 3.10 by default
                lines.append("RUN apt-get update && \\")
                lines.append("    apt-get install -y python3 python3-pip && \\")
                lines.append("    ln -sf /usr/bin/python3 /usr/bin/python && \\")
                lines.append("    ln -sf /usr/bin/pip3 /usr/bin/pip && \\")
                lines.append("    apt-get clean && \\")
                lines.append("    rm -rf /var/lib/apt/lists/*")
            else:
                # For other versions, use deadsnakes PPA
                lines.append("RUN apt-get update && \\")
                lines.append(
                    "    apt-get install -y software-properties-common && \\"
                )
                lines.append("    add-apt-repository -y ppa:deadsnakes/ppa && \\")
                lines.append("    apt-get update && \\")
                lines.append(
                    f"    apt-get install -y python{python_version} "
                    f"python{python_version}-dev python{python_version}-venv && \\"
                )
                lines.append(
                    "    apt-get install -y curl && \\"
                )
                lines.append(
                    f"    curl -sS https://bootstrap.pypa.io/get-pip.py | python{python_version} && \\"
                )
                lines.append(
                    f"    ln -sf /usr/bin/python{python_version} /usr/bin/python && \\"
                )
                lines.append(
                    f"    ln -sf /usr/bin/python{python_version} /usr/bin/python3 && \\"
                )
                lines.append(
                    f"    ln -sf /usr/local/bin/pip{python_version} /usr/bin/pip && \\"
                )
                lines.append(
                    f"    ln -sf /usr/local/bin/pip{python_version} /usr/bin/pip3 && \\"
                )
                lines.append("    apt-get clean && \\")
                lines.append("    rm -rf /var/lib/apt/lists/*")
            lines.append("")

        # System dependencies
        lines.append("# Install system dependencies")
        # Build tools and OpenGL/OpenCV deps that are broadly available on Debian/Ubuntu (arm64/x86_64)
        # Use libgl1 and libxrender1 (mesa-glx and -dev variants can be missing on some distros/arches)
        system_packages = [
            "git",
            "wget",
            "curl",
            "g++",
            "gcc",
            "cmake",
            "build-essential",
            "libgl1",
            "libglib2.0-0",
            "libsm6",
            "libxext6",
            "libxrender1",
            "libgomp1",
            "libglu1-mesa",
            "ffmpeg",
        ]

        lines.extend(self.add_system_packages(system_packages))
        lines.append("")

        # Install ComfyUI
        lines.append("# Install ComfyUI")
        lines.append(
            "RUN git clone https://github.com/comfyanonymous/ComfyUI.git /app/ComfyUI"
        )
        lines.append("WORKDIR /app/ComfyUI")
        lines.append("")

        # Install PyTorch/accelerators
        from src.containers.accelerator_manager import AcceleratorManager

        if enable_accelerators and use_cuda:
            # Install PyTorch first (required for custom nodes that need torch during build)
            lines.append("# Install PyTorch first (required for some custom nodes during build)")
            torch_ver = torch_version or "2.8.0"
            cuda_var = cuda_variant or "cu129"
            index_url = f"https://download.pytorch.org/whl/{cuda_var}"

            # For PyTorch 2.8.0, just use package names without version pinning
            if torch_ver == "2.8.0":
                torch_pkgs = ["torch", "torchvision", "torchaudio"]
            else:
                torch_pkgs = [
                    f"torch=={torch_ver}",
                    f"torchvision=={_infer_vision_version(torch_ver)}",
                    f"torchaudio=={_infer_audio_version(torch_ver)}",
                ]

            lines.append(
                f"RUN pip install --no-cache-dir {' '.join(torch_pkgs)} --index-url {index_url}"
            )
            lines.append("")

            # Resolve a guarded requirements snippet based on matrix for other accelerators
            plan = AcceleratorManager().resolve(
                python_version=python_version,
                torch_version=torch_version,
                cuda_variant=cuda_variant,
                accelerators=accelerators,
                enable_nunchaku=enable_nunchaku,
            )
            if plan.supported and plan.lines:
                lines.append(
                    "# Install accelerators (precompiled wheels) - platform guarded"
                )

                # Write file using printf with safe quoting to avoid option parsing
                def _sq(s: str) -> str:
                    # shell single-quote escaping: ' -> '\''
                    return "'" + s.replace("'", "'\"'\"'") + "'"

                quoted = " ".join(_sq(item) for item in plan.lines)
                lines.append(f"RUN printf '%s\\n' {quoted} > /tmp/accelerators.txt")
                lines.append(
                    "RUN pip install --no-cache-dir -r /tmp/accelerators.txt && rm -f /tmp/accelerators.txt"
                )
                lines.append("")
            else:
                # Optionally compile from source using a devel CUDA stage
                if compile_fallback:
                    py_minor = {
                        None: "3.12",
                        "3.11": "3.11",
                        "3.12": "3.12",
                        "3.13": "3.13",
                    }.get(python_version, "3.12")
                    torch_ver = torch_version or "2.8.0"
                    # Choose FA/Sage versions conservatively
                    fa_ver = "2.8.3" if torch_ver == "2.8.0" else "2.8.0"
                    sage_ver = "2.2.0"

                    lines_multistage: list[str] = []
                    lines_multistage.append(
                        "# Builder stage for compiling accelerators from source"
                    )
                    lines_multistage.append(
                        f"FROM nvidia/cuda:{cuda_devel_version}-devel-ubuntu{ubuntu_version} AS builder"
                    )
                    lines_multistage.append("WORKDIR /build")
                    lines_multistage.append("ENV DEBIAN_FRONTEND=noninteractive")
                    lines_multistage.extend(
                        [
                            "RUN apt-get update && \\",
                            "    apt-get install -y --no-install-recommends \\",
                            "        software-properties-common curl ca-certificates git build-essential \\",
                            "        cmake ninja-build pkg-config && \\",
                            # get Python via deadsnakes for matching minor
                            "    add-apt-repository -y ppa:deadsnakes/ppa && apt-get update && \\",
                            f"    apt-get install -y python{py_minor} python{py_minor}-dev python{py_minor}-venv && \\",
                            "    curl -sS https://bootstrap.pypa.io/get-pip.py | python3 && \\",
                            "    apt-get clean && rm -rf /var/lib/apt/lists/*",
                        ]
                    )
                    # Create a venv with the specific Python minor to ensure ensurepip is present
                    lines_multistage.append(f"RUN python{py_minor} -m venv /opt/venv")
                    lines_multistage.append('ENV PATH="/opt/venv/bin:$PATH"')
                    # Torch install in builder to ensure headers/ABI present for builds
                    variant = (cuda_variant or "cu129").replace("cu", "cu")
                    idx = (
                        f"https://download.pytorch.org/whl/{variant}"
                        if (variant and variant != "cpu")
                        else "https://download.pytorch.org/whl/cpu"
                    )
                    torch_pkgs = [
                        f"torch=={torch_ver}",
                        f"torchvision=={_infer_vision_version(torch_ver)}",
                        f"torchaudio=={_infer_audio_version(torch_ver)}",
                    ]
                    lines_multistage.append(
                        "RUN pip install --upgrade pip wheel setuptools cmake ninja && \\"
                    )
                    lines_multistage.append(
                        "    pip install --no-cache-dir "
                        + " ".join(torch_pkgs)
                        + f" --index-url {idx}"
                    )
                    # Preinstall triton (wheel) to satisfy SageAttention build
                    lines_multistage.append(
                        "RUN pip install --no-cache-dir triton==3.4.0"
                    )
                    # Build wheels into /wheels
                    lines_multistage.append("RUN mkdir -p /wheels")
                    lines_multistage.append(
                        f"RUN pip wheel --no-deps --no-binary :all: flash-attn=={fa_ver} -w /wheels || true"
                    )
                    lines_multistage.append(
                        f"RUN pip wheel --no-deps --no-binary :all: sageattention=={sage_ver} -w /wheels || true"
                    )

                    # Runtime stage continues current base image
                    lines_multistage.append("")
                    lines_multistage.append("# Runtime stage")
                    lines_multistage.append(f"FROM {base_image} AS runtime")
                    lines_multistage.append("WORKDIR /app")
                    # Copy wheels
                    lines_multistage.append("COPY --from=builder /wheels /wheels")

                    # Replace the initial FROM with our multi-stage prelude
                    # Prepend now-built multi-stage lines and restart lines list for runtime steps
                    prelude = "\n".join(lines_multistage) + "\n\n"
                    # Begin runtime lines freshly
                    runtime_lines: list[str] = []

                    # Install PyTorch in runtime
                    runtime_lines.append("# Install PyTorch (runtime)")
                    torch_pkgs_rt = torch_pkgs  # reuse
                    idx_rt = idx
                    runtime_lines.append(
                        "RUN pip install --no-cache-dir "
                        + " ".join(torch_pkgs_rt)
                        + f" --index-url {idx_rt}"
                    )
                    runtime_lines.append("")

                    # Install compiled wheels, if present
                    runtime_lines.append(
                        "# Install compiled accelerator wheels if available"
                    )
                    runtime_lines.append(
                        "RUN if [ -d /wheels ] && ls -1 /wheels/*.whl >/dev/null 2>&1; then \\"
                    )
                    runtime_lines.append(
                        "    pip install --no-cache-dir --no-index --find-links=/wheels flash-attn sageattention || true; \\"
                    )
                    runtime_lines.append("    fi")
                    runtime_lines.append("")

                    # Attach prelude and reset lines
                    lines = [prelude] + runtime_lines
                else:
                    # Fallback to regular torch install if matrix unsupported
                    lines.append(
                        "# Matrix unsupported; installing PyTorch from official index"
                    )
                    torch_pkgs = []
                    if torch_version:
                        torch_pkgs = [
                            f"torch=={torch_version}",
                            f"torchvision=={_infer_vision_version(torch_version)}",
                            f"torchaudio=={_infer_audio_version(torch_version)}",
                        ]
                    else:
                        torch_pkgs = ["torch", "torchvision", "torchaudio"]
                    variant = cuda_variant or "cu121"
                    idx = f"https://download.pytorch.org/whl/{variant}"
                    lines.append(
                        "RUN pip install --no-cache-dir "
                        + " ".join(torch_pkgs)
                        + f" --index-url {idx}"
                    )
                    lines.append("")
        else:
            # CPU mode or accelerators disabled
            lines.append("# Install PyTorch (CPU or accelerators disabled)")
            torch_pkgs = []
            if torch_version:
                torch_pkgs = [
                    f"torch=={torch_version}",
                    f"torchvision=={_infer_vision_version(torch_version)}",
                    f"torchaudio=={_infer_audio_version(torch_version)}",
                ]
            else:
                torch_pkgs = ["torch", "torchvision", "torchaudio"]
            idx = (
                "https://download.pytorch.org/whl/cpu"
                if not use_cuda
                else f"https://download.pytorch.org/whl/{cuda_variant or 'cu121'}"
            )
            lines.append(
                "RUN pip install --no-cache-dir "
                + " ".join(torch_pkgs)
                + f" --index-url {idx}"
            )
            lines.append("")

        # Install ComfyUI requirements (if present in build context)
        lines.append("# Install ComfyUI requirements (optional)")
        # Normalize SciPy for Python >= 3.12 to avoid old pins like scipy~=1.10.1
        lines.append("RUN if [ -f requirements.txt ]; then \\")
        lines.append(
            "    python -c \"import sys, re; "
            "p='requirements.txt'; "
            "c=open(p,'r').read() if sys.version_info[:2]>=(3,12) else None; "
            "open(p,'w').write(re.sub(r'scipy[^#\\\\s]*', 'scipy>=1.11.0', c)) if c else None\" || true; \\"
        )
        lines.append(
            "    pip install --no-cache-dir -r requirements.txt; \\"
        )
        lines.append("fi")
        lines.append("")

        # Optional: install Nunchaku wheel BEFORE custom nodes
        if enable_nunchaku:
            lines.append("# Install Nunchaku acceleration library")
            py_cp = {
                "3.10": "cp310",
                "3.11": "cp311",
                "3.12": "cp312",
                "3.13": "cp313",
            }.get(str(python_version or "3.12"), "cp312")

            # Parse torch version
            tv = (torch_version or "2.7.1").split(".")
            torch_minor = f"{tv[0]}.{tv[1]}" if len(tv) >= 2 else "2.7"

            # Handle PyTorch 2.8+ compatibility
            if torch_minor >= "2.8":
                logger.warning(f"PyTorch {torch_minor} detected. Nunchaku wheels only support up to 2.7. Using 2.7 wheel which may have limited compatibility.")
                torch_minor = "2.7"  # Use latest available wheel

            # Use v1.0.0 as default (latest stable)
            nunchaku_ver = (nunchaku_version or "v1.0.0").lstrip("v")
            wheel = nunchaku_wheel_url or (
                f"https://github.com/nunchaku-tech/nunchaku/releases/download/"
                f"v{nunchaku_ver}/"
                f"nunchaku-{nunchaku_ver}+torch{torch_minor}-{py_cp}-{py_cp}-linux_x86_64.whl"
            )

            lines.append(f"# Installing Nunchaku wheel for Python {python_version}, PyTorch {torch_minor}")
            lines.append(f"RUN pip install --no-cache-dir {wheel} || echo 'Warning: Nunchaku wheel installation failed, continuing without it'")
            lines.append("")

        # Install custom nodes
        if custom_nodes:
            lines.append("# Install custom nodes")
            lines.append("WORKDIR /app/ComfyUI/custom_nodes")
            lines.append("")

            # Collect all dependencies from custom nodes
            all_python_deps = set()

            # Helper to sanitize directory names
            def _safe_dir(name: str) -> str:
                allowed = set(
                    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
                )
                name = (name or "custom_node").replace(" ", "_")
                name = name.replace("/", "_").replace("\\", "_")
                return "".join(ch for ch in name if ch in allowed) or "custom_node"

            for node in custom_nodes:
                # Clone repository
                safe_name = _safe_dir(getattr(node, "name", "custom_node"))
                repo = getattr(node, "repository", None)
                lines.append(f"# Install {safe_name}")
                lines.append(f"RUN git clone {repo} {safe_name}")

                # Checkout specific commit if provided
                if getattr(node, "commit_hash", None):
                    lines.append(
                        f"RUN cd {safe_name} && git checkout {node.commit_hash}"
                    )

                # Normalize SciPy and filter problematic packages in node requirements, then install
                lines.append(
                    f"RUN if [ -f {safe_name}/requirements.txt ]; then \\"
                )
                lines.append(
                    f"    python -c \"import sys, re; "
                    f"p='{safe_name}/requirements.txt'; "
                    f"c=open(p,'r').read(); "
                    f"c=re.sub(r'scipy[^#\\\\s]*', 'scipy>=1.11.0', c) if sys.version_info[:2]>=(3,12) else c; "
                    f"c=re.sub(r'^flash_attn.*$', '', c, flags=re.MULTILINE); "
                    f"c=re.sub(r'^dfloat11.*$', '', c, flags=re.MULTILINE); "
                    f"open(p,'w').write(c)\" || true; \\"
                )
                lines.append(
                    f"    pip install --no-cache-dir --no-build-isolation -r {safe_name}/requirements.txt 2>/dev/null || "
                    f"pip install --no-cache-dir -r {safe_name}/requirements.txt; \\"
                )
                lines.append(
                    "fi"
                )

                # Collect Python dependencies
                all_python_deps.update(node.python_dependencies)

                lines.append("")

            # Install collected Python dependencies
            if all_python_deps:
                deps_str = " ".join(sorted(all_python_deps))
                lines.append(
                    "# Install additional Python dependencies for custom nodes"
                )
                lines.append(f"RUN pip install --no-cache-dir {deps_str}")
                lines.append("")

            lines.append("WORKDIR /app/ComfyUI")
            lines.append("")

        # Python packages
        python_packages = list(dependencies.get("python_packages", []))
        if python_packages:
            lines.append("# Install Python packages")
            lines.extend(self.add_python_packages(python_packages))
            lines.append("")

        # Custom nodes
        custom_nodes = dependencies.get("custom_nodes", [])
        if custom_nodes:
            lines.append("# Install custom nodes")
            lines.extend(self.add_custom_nodes(custom_nodes))
            lines.append("")

        # Nunchaku models path environment variable (if specified)
        if enable_nunchaku and nunchaku_models_path:
            lines.append(f"ENV NUNCHAKU_MODELS_PATH={nunchaku_models_path}")
            lines.append("")

        # Extra provisioning commands (e.g., model downloads)
        if extra_commands:
            lines.append("# Additional provisioning commands")
            lines.extend(extra_commands)
            lines.append("")

        # Expose port
        lines.append("EXPOSE 8188")
        lines.append("")

        # Default command
        if use_cuda:
            lines.append(
                'CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]'
            )
        else:
            # Force CPU mode for non-CUDA environments
            lines.append(
                'CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188", "--cpu"]'
            )

        # Shared models volume link
        lines.append("# Shared models volume")
        lines.append(
            "RUN mkdir -p /models && ln -s /models /app/ComfyUI/models_external || true"
        )
        lines.append('VOLUME ["/models"]')

        return "\n".join(lines)

    def add_model_url_downloads(self, assets: list[dict[str, Any]]) -> list[str]:
        """Generate Docker RUN commands to download model assets by URL.

        Args:
            assets: List of dicts with at least {type, filename, url}

        Returns:
            A list of RUN commands that create folders and wget files
        """
        if not assets:
            return []
        cmds: list[str] = []
        seen: set[str] = set()
        for a in assets:
            mtype = str(a.get("type", "misc")).strip() or "misc"
            fname = str(a.get("filename", "")).strip()
            url = str(a.get("url", "")).strip()
            if not fname or not url:
                continue
            if mtype not in seen:
                cmds.append(f"RUN mkdir -p /app/ComfyUI/models/{mtype}")
                seen.add(mtype)
            dst = f"/app/ComfyUI/models/{mtype}/{fname}"
            cmds.append(
                "RUN wget -q --show-progress --progress=dot:giga --retry-connrefused -t 3 -O "
                + dst
                + " "
                + url
            )
        return cmds

    def create_with_cache_mounts(self) -> str:
        """Create Dockerfile with cache mount optimization.

        Returns:
            Dockerfile with cache mounts
        """
        dockerfile = [
            "# syntax=docker/dockerfile:1",
            "FROM python:3.12-slim",
            "",
            "WORKDIR /app",
            "",
            "# Use cache mount for pip",
            "RUN --mount=type=cache,target=/root/.cache/pip \\",
            "    pip install --upgrade pip && \\",
            "    pip install numpy torch",
            "",
        ]
        return "\n".join(dockerfile)

    def create_secure(self, base_image: str = "python:3.12-slim") -> str:
        """Create security-hardened Dockerfile.

        Args:
            base_image: Base Docker image

        Returns:
            Security-hardened Dockerfile
        """
        dockerfile = [
            f"FROM {base_image}",
            "",
            "# Create non-root user",
            "RUN useradd -m -u 1000 -s /bin/bash appuser && \\",
            "    mkdir -p /app && \\",
            "    chown -R appuser:appuser /app",
            "",
            "WORKDIR /app",
            "",
            "# Switch to non-root user",
            "USER appuser",
            "",
            "# Copy application files",
            "COPY --chown=appuser:appuser . /app",
            "",
        ]
        return "\n".join(dockerfile)

    def add_build_args(self, args: dict[str, str]) -> list[str]:
        """Add ARG instructions for build arguments.

        Args:
            args: Dictionary of build arguments

        Returns:
            List of ARG commands
        """
        return [f"ARG {key}={value}" for key, value in args.items()]

    def add_copy_instructions(self, copies: list[tuple[str, str]]) -> list[str]:
        """Add COPY instructions.

        Args:
            copies: List of (source, destination) tuples

        Returns:
            List of COPY commands
        """
        return [f"COPY {src} {dst}" for src, dst in copies]

    def setup_non_root_user(
        self, username: str = "appuser", uid: int = 1000
    ) -> list[str]:
        """Set up non-root user.

        Args:
            username: Username
            uid: User ID

        Returns:
            List of commands
        """
        return [
            f"RUN useradd -m -u {uid} -s /bin/bash {username}",
            f"USER {username}",
        ]

    def create_minimal(self, base_image: str, packages: list[str]) -> str:
        """Create minimal sized Dockerfile.

        Args:
            base_image: Base Docker image
            packages: Python packages to install

        Returns:
            Minimal Dockerfile
        """
        dockerfile = [
            "# Builder stage",
            f"FROM {base_image} AS builder",
            "",
            "WORKDIR /build",
            "",
            "# Install packages in virtual environment",
            "RUN python -m venv /opt/venv",
            'ENV PATH="/opt/venv/bin:$PATH"',
            "",
            f"RUN pip install --no-cache-dir {' '.join(packages)}",
            "",
            "# Runtime stage",
            f"FROM {base_image} AS runtime",
            "",
            "# Copy virtual environment",
            "COPY --from=builder /opt/venv /opt/venv",
            'ENV PATH="/opt/venv/bin:$PATH"',
            "",
            "WORKDIR /app",
            "",
            "# Clean up",
            "RUN apt-get clean && \\",
            "    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*",
            "",
        ]
        return "\n".join(dockerfile)


# Simple helpers to map torch minor to matching vision/audio where needed
def _infer_vision_version(torch_version: str) -> str:
    # conservative mapping based on common releases
    mapping = {
        "2.8.0": "0.23.0",
        "2.7.1": "0.22.1",
        "2.7.0": "0.22.0",
        "2.6.0": "0.21.0",
        "2.5.1": "0.20.1",
        "2.5.0": "0.20.0",
        "2.4.1": "0.19.1",
        "2.4.0": "0.19.0",
        "2.3.1": "0.18.1",
        "2.3.0": "0.18.0",
        "2.2.2": "0.17.2",
        "2.2.1": "0.17.1",
        "2.2.0": "0.17.0",
        "2.1.2": "0.16.2",
        "2.1.1": "0.16.1",
        "2.1.0": "0.16.0",
        "2.0.1": "0.15.2",
        "2.0.0": "0.15.1",
    }
    return mapping.get(torch_version, "0.22.1")


def _infer_audio_version(torch_version: str) -> str:
    mapping = {
        "2.8.0": "2.8.0",
        "2.7.1": "2.7.1",
        "2.7.0": "2.7.0",
        "2.6.0": "2.6.0",
        "2.5.1": "2.5.1",
        "2.5.0": "2.5.0",
        "2.4.1": "2.4.1",
        "2.4.0": "2.4.0",
        "2.3.1": "2.3.1",
        "2.3.0": "2.3.0",
        "2.2.2": "2.2.2",
        "2.2.1": "2.2.1",
        "2.2.0": "2.2.0",
        "2.1.2": "2.1.2",
        "2.1.1": "2.1.1",
        "2.1.0": "2.1.0",
        "2.0.1": "2.0.2",
        "2.0.0": "2.0.1",
    }
    return mapping.get(torch_version, "2.7.1")
