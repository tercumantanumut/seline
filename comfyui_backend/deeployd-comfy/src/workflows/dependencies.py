"""Dependency extraction for ComfyUI workflows."""

import ast
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from src.workflows.constants import BUILTIN_NODES
from src.workflows.converter import WorkflowConverter


class DependencyExtractor:
    """Extract dependencies from ComfyUI workflows."""

    def __init__(self):
        """Initialize extractor with converter."""
        self.converter = WorkflowConverter()

    def extract_all(
        self,
        workflow: dict[str, dict[str, Any]] | dict[str, Any],
        resolve_transitive: bool = False,  # noqa: ARG002
    ) -> dict[str, Any]:
        """Extract all types of dependencies from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)
            resolve_transitive: Whether to resolve transitive dependencies

        Returns:
            Dictionary containing all dependency types
        """
        return {
            "models": self.extract_models(workflow),
            "custom_nodes": self.extract_custom_nodes(workflow),
            "python_packages": self.extract_python_packages(workflow),
        }

    def extract_models(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> dict[str, list[str]]:
        """Extract model dependencies from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            Dictionary of model types and their files
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        models = {
            "checkpoints": [],
            "loras": [],
            "vaes": [],
            "controlnets": [],
            "embeddings": [],
            "upscalers": [],
        }

        for node_data in nodes.values():
            inputs = node_data.get("inputs", {})
            class_type = node_data.get("class_type", "")

            # Checkpoint models
            if "ckpt_name" in inputs:
                model_name = inputs["ckpt_name"]
                if model_name and model_name not in models["checkpoints"]:
                    models["checkpoints"].append(model_name)

            # LoRA models
            if "lora_name" in inputs:
                model_name = inputs["lora_name"]
                if model_name and model_name not in models["loras"]:
                    models["loras"].append(model_name)

            # VAE models
            if "vae_name" in inputs:
                model_name = inputs["vae_name"]
                if model_name and model_name not in models["vaes"]:
                    models["vaes"].append(model_name)

            # ControlNet models
            if "control_net_name" in inputs or "controlnet_name" in inputs:
                model_name = inputs.get("control_net_name") or inputs.get(
                    "controlnet_name"
                )
                if model_name and model_name not in models["controlnets"]:
                    models["controlnets"].append(model_name)

            # Embeddings
            if "embedding_name" in inputs:
                model_name = inputs["embedding_name"]
                if model_name and model_name not in models["embeddings"]:
                    models["embeddings"].append(model_name)

            # Upscalers
            if (
                "upscale_model" in inputs
                or "model_name" in inputs
                and "Upscale" in class_type
            ):
                model_name = inputs.get("upscale_model") or inputs.get("model_name")
                if model_name and model_name not in models["upscalers"]:
                    models["upscalers"].append(model_name)

        return models

    def extract_custom_nodes(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Extract custom node dependencies from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            List of custom node information
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        custom_nodes = []
        seen_types = set()

        for node_data in nodes.values():
            class_type = node_data.get("class_type", "")

            # Skip if built-in node or already processed
            if class_type in BUILTIN_NODES or class_type in seen_types:
                continue

            # Check if it's a custom node (not in built-in list)
            if class_type:
                seen_types.add(class_type)

                node_info = {
                    "class_type": class_type,
                    "repository": None,
                    "commit": None,
                    "python_dependencies": [],
                }

                # Extract metadata if available
                meta = node_data.get("_meta", {})
                if meta:
                    node_info["repository"] = meta.get("repository")
                    node_info["commit"] = meta.get("commit")
                    node_info["python_dependencies"] = meta.get(
                        "python_dependencies", []
                    )

                custom_nodes.append(node_info)

        return custom_nodes

    def extract_python_packages(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> set[str]:
        """Extract Python package dependencies from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            Set of Python package names
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        packages = set()

        for node_data in nodes.values():
            # Check _meta field for dependencies
            meta = node_data.get("_meta", {})
            if "python_dependencies" in meta:
                deps = meta["python_dependencies"]
                if isinstance(deps, list):
                    packages.update(deps)

        return packages

    def extract_python_imports(self, code: str) -> set[str]:
        """Extract Python imports from code string.

        Args:
            code: Python code as string

        Returns:
            Set of imported module names
        """
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return set()

        imports = set()

        class ImportVisitor(ast.NodeVisitor):
            def visit_Import(self, node):
                for alias in node.names:
                    imports.add(alias.name.split(".")[0])

            def visit_ImportFrom(self, node):
                if node.module:
                    imports.add(node.module.split(".")[0])

        ImportVisitor().visit(tree)
        return imports

    def get_model_file_info(self, model_path: str) -> dict[str, str]:
        """Get information about a model file.

        Args:
            model_path: Path to model file

        Returns:
            Dictionary with file information
        """
        path = Path(model_path)
        return {
            "filename": path.name,
            "extension": path.suffix,
            "type": self._determine_model_type(model_path),
            "full_path": model_path,
        }

    def _determine_model_type(self, model_path: str) -> str:
        """Determine model type from path.

        Args:
            model_path: Path to model file

        Returns:
            Model type string
        """
        path_lower = model_path.lower()

        if "checkpoint" in path_lower or "ckpt" in path_lower:
            return "checkpoint"
        elif "lora" in path_lower:
            return "lora"
        elif "vae" in path_lower:
            return "vae"
        elif "controlnet" in path_lower or "control" in path_lower:
            return "controlnet"
        elif "embedding" in path_lower:
            return "embedding"
        elif "upscale" in path_lower:
            return "upscaler"
        else:
            return "checkpoint"  # Default

    def resolve_repository(self, repo_url: str) -> dict[str, str]:
        """Resolve repository information from URL.

        Args:
            repo_url: Repository URL

        Returns:
            Dictionary with repository information
        """
        parsed = urlparse(repo_url)
        path_parts = parsed.path.strip("/").split("/")

        if len(path_parts) >= 2:
            owner = path_parts[0]
            repo = path_parts[1].replace(".git", "")
        else:
            owner = "unknown"
            repo = "unknown"

        platform = "github" if "github.com" in parsed.netloc else "gitlab"

        return {
            "platform": platform,
            "owner": owner,
            "repo": repo,
            "url": repo_url,
        }

    def generate_requirements_txt(self, workflow: dict[str, Any]) -> str:
        """Generate requirements.txt content from workflow.

        Args:
            workflow: Workflow dictionary

        Returns:
            Requirements.txt content as string
        """
        packages = self.extract_python_packages(workflow)
        return "\n".join(sorted(packages))

    def validate_model_path(self, path: str) -> bool:
        """Validate model file path for security.

        Args:
            path: Path to validate

        Returns:
            True if path is safe
        """
        # Check for path traversal attempts
        if ".." in path or path.startswith("/") or path.startswith("\\"):
            return False

        # Check for absolute Windows paths
        if re.match(r"^[A-Za-z]:[\\\/]", path):
            return False

        # Check for suspicious paths
        suspicious_paths = ["/etc/", "/usr/", "/bin/", "/sbin/", "C:\\Windows"]
        return all(suspicious not in path for suspicious in suspicious_paths)

    def categorize_dependencies(self, workflow: dict[str, Any]) -> dict[str, list[Any]]:
        """Categorize dependencies by priority.

        Args:
            workflow: Workflow dictionary

        Returns:
            Categorized dependencies
        """
        all_deps = self.extract_all(workflow)

        # Basic categorization
        required = []
        optional = []
        recommended = []

        # Models are usually required
        for model_type, models in all_deps["models"].items():
            if models:
                required.append({"type": f"models.{model_type}", "items": models})

        # Custom nodes are required
        if all_deps["custom_nodes"]:
            required.append({"type": "custom_nodes", "items": all_deps["custom_nodes"]})

        # Python packages are required
        if all_deps["python_packages"]:
            required.append(
                {"type": "python_packages", "items": list(all_deps["python_packages"])}
            )

        return {
            "required": required,
            "optional": optional,
            "recommended": recommended,
        }

    def generate_dockerfile_requirements(self, workflow: dict[str, Any]) -> list[str]:
        """Generate Dockerfile commands for dependencies.

        Args:
            workflow: Workflow dictionary

        Returns:
            List of Dockerfile commands
        """
        commands = []

        # Python packages
        packages = self.extract_python_packages(workflow)
        if packages:
            pip_cmd = f"RUN pip install {' '.join(sorted(packages))}"
            commands.append(pip_cmd)

        # Custom nodes
        custom_nodes = self.extract_custom_nodes(workflow)
        for node in custom_nodes:
            if node["repository"]:
                clone_cmd = f"RUN git clone {node['repository']} /app/custom_nodes/{node['class_type']}"
                commands.append(clone_cmd)

                # Install node-specific requirements
                if node["python_dependencies"]:
                    pip_cmd = f"RUN pip install {' '.join(node['python_dependencies'])}"
                    commands.append(pip_cmd)

        return commands

    def detect_cuda_requirements(self, workflow: dict[str, Any]) -> dict[str, Any]:
        """Detect CUDA/GPU requirements from workflow.

        Args:
            workflow: Workflow dictionary

        Returns:
            CUDA requirement information
        """
        cuda_packages = {"torch", "xformers", "triton", "cupy", "pycuda"}
        packages = self.extract_python_packages(workflow)

        found_cuda = []
        for package in packages:
            # Check package name (remove version specifier)
            package_name = package.split(">=")[0].split("==")[0].split("<")[0]
            if package_name in cuda_packages:
                found_cuda.append(package_name)

        return {
            "requires_cuda": len(found_cuda) > 0,
            "cuda_packages": found_cuda,
            "recommended_cuda_version": "11.8" if "torch" in found_cuda else None,
        }
