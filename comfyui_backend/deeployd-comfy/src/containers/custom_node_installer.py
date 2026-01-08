"""Custom node installer for ComfyUI workflows."""

import ast
import json
import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.error import URLError

import requests
from packaging import version

from src.workflows.constants import BUILTIN_NODES


class NodeInstallationError(Exception):
    """Custom exception for node installation failures."""

    pass


@dataclass
class NodeMetadata:
    """Metadata for a custom node."""

    name: str
    repository: str
    commit_hash: str | None = None
    python_dependencies: list[str] = field(default_factory=list)
    system_dependencies: list[str] = field(default_factory=list)
    models_required: list[str] = field(default_factory=list)
    depends_on: list[str] = field(default_factory=list)
    min_comfyui_version: str | None = None
    max_comfyui_version: str | None = None


class CustomNodeInstaller:
    """Handles installation of custom nodes for ComfyUI workflows."""

    def __init__(self, cache_dir: str | None = None):
        """Initialize custom node installer.

        Args:
            cache_dir: Optional directory for caching downloaded nodes
        """
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self._dependency_map = {
            "PIL": "pillow",
            "cv2": "opencv-python",
            "sklearn": "scikit-learn",
            "yaml": "pyyaml",
        }
        self._comfyui_manager_database: dict[str, Any] | None = None
        self._node_mapping_cache: dict[str, str | None] = {}
        self._comprehensive_node_mapping: dict[str, str] = {}
        self._database_cache_path = (
            self.cache_dir / "comfyui-manager-db.json" if self.cache_dir else None
        )
        self._node_mapping_cache_path = (
            self.cache_dir / "node-class-mappings.json" if self.cache_dir else None
        )
        # Known mappings for GGUF-related nodes (ComfyUI-GGUF)
        self._known_gguf_nodes: dict[str, str] = {
            "UnetLoaderGGUF": "https://github.com/city96/ComfyUI-GGUF",
            "DualCLIPLoaderGGUF": "https://github.com/city96/ComfyUI-GGUF",
            "CLIPLoaderGGUF": "https://github.com/city96/ComfyUI-GGUF",
        }
        # Additional known patterns/mappings
        self._known_mappings: dict[str, str] = {
            "IPAdapterApply": "https://github.com/cubiq/ComfyUI_IPAdapter_plus",
            "IPAdapterEncoder": "https://github.com/cubiq/ComfyUI_IPAdapter_plus",
            "ComfyUI_IPAdapter_plus": "https://github.com/cubiq/ComfyUI_IPAdapter_plus",
            "KJNodes": "https://github.com/kijai/ComfyUI-KJNodes",
            "ComfyUI-KJNodes": "https://github.com/kijai/ComfyUI-KJNodes",
        }

    def extract_custom_nodes(
        self, workflow_nodes: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Extract custom nodes from workflow.

        Args:
            workflow_nodes: Dictionary of workflow nodes

        Returns:
            List of custom node information
        """
        custom_nodes = []

        for node_id, node_data in workflow_nodes.items():
            class_type = node_data.get("class_type", "")

            # Check if it's a custom node
            if class_type and class_type not in BUILTIN_NODES:
                node_info = {
                    "class_type": class_type,
                    "node_id": node_id,
                }

                # Extract metadata if available
                if "_meta" in node_data:
                    meta = node_data["_meta"]
                    if "repository" in meta:
                        node_info["repository"] = meta["repository"]
                    if "commit" in meta:
                        node_info["commit"] = meta["commit"]

                custom_nodes.append(node_info)

        return custom_nodes

    def download_comfyui_manager_database(self) -> dict[str, Any]:
        """Download ComfyUI-Manager custom node database.

        Returns:
            Dictionary containing the custom node database

        Raises:
            NodeInstallationError: If download fails
        """
        database_url = "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/node_db/new/custom-node-list.json"

        def _assert_https(url: str) -> None:
            if not url.startswith("https://"):
                raise NodeInstallationError(
                    "Only https:// URLs are allowed for downloads"
                )

        try:
            _assert_https(database_url)
            resp = requests.get(database_url, timeout=30)
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()

            # Cache the database if cache directory is available
            if self._database_cache_path:
                self._database_cache_path.parent.mkdir(parents=True, exist_ok=True)
                with open(self._database_cache_path, "w") as f:
                    json.dump(data, f, indent=2)

            return data

        except (URLError, json.JSONDecodeError) as e:
            raise NodeInstallationError(
                f"Failed to download ComfyUI-Manager database: {e}"
            ) from e

    def load_comfyui_manager_database(self) -> dict[str, Any]:
        """Load ComfyUI-Manager database from cache or download.

        Returns:
            Dictionary containing the custom node database
        """
        # Check if already loaded
        if self._comfyui_manager_database is not None:
            return self._comfyui_manager_database

        # Try to load from cache first
        if self._database_cache_path and self._database_cache_path.exists():
            try:
                with open(self._database_cache_path) as f:
                    self._comfyui_manager_database = json.load(f)
                    if self._comfyui_manager_database is not None:
                        return self._comfyui_manager_database
            except (OSError, json.JSONDecodeError):
                # Cache corrupted, download fresh
                pass

        # Download fresh database
        try:
            self._comfyui_manager_database = self.download_comfyui_manager_database()
        except NodeInstallationError:
            # If download fails, return empty dict
            self._comfyui_manager_database = {}
        return self._comfyui_manager_database

    def find_repository_by_class_name(self, class_name: str) -> str | None:
        """Find repository URL for a custom node class name.

        Args:
            class_name: The class name of the custom node

        Returns:
            Repository URL if found, None otherwise
        """
        # Quick: known GGUF nodes
        if class_name in self._known_gguf_nodes:
            return self._known_gguf_nodes[class_name]
        # Quick: additional known mappings
        if class_name in self._known_mappings:
            return self._known_mappings[class_name]

        # Check cache first
        if class_name in self._node_mapping_cache:
            return self._node_mapping_cache[class_name]

        try:
            database = self.load_comfyui_manager_database()

            for entry in database.get("custom_nodes", []):
                # Check if this entry contains the class name
                # Look in various fields that might contain node class information
                entry_files = entry.get("files", [])
                entry_reference = entry.get("reference", "")
                entry_title = entry.get("title", "")

                # Simple heuristic: match class name with title or reference
                if (
                    class_name.lower() in entry_title.lower()
                    or class_name in entry_title
                    or class_name.replace("|", "").replace(" ", "")
                    in entry_title.replace(" ", "")
                ):
                    # Extract repository URL from reference or files
                    repo_url = entry_reference
                    if not repo_url and entry_files:
                        # Try to extract from first file URL
                        first_file = entry_files[0]
                        # Convert raw GitHub URL to repository URL
                        if "raw.githubusercontent.com" in first_file:
                            parts = first_file.split("/")
                            if len(parts) >= 5:
                                user = parts[3]
                                repo = parts[4]
                                repo_url = f"https://github.com/{user}/{repo}"

                    if repo_url and self.validate_repository_url(repo_url):
                        # Cache the result
                        self._node_mapping_cache[class_name] = repo_url
                        return str(repo_url) if isinstance(repo_url, str) else None

        except Exception:
            # Fallback silently - we'll use manual input
            pass

        # Pattern fallbacks
        if class_name.endswith("GGUF") or "GGUF" in class_name:
            return "https://github.com/city96/ComfyUI-GGUF"
        if "IPAdapter" in class_name:
            return "https://github.com/cubiq/ComfyUI_IPAdapter_plus"
        if "KJNodes" in class_name or class_name in {"SetNode", "GetNode", "SetGet"}:
            return "https://github.com/kijai/ComfyUI-KJNodes"

        return None

    def fetch_github_raw_file(self, repo_url: str, file_path: str) -> str | None:
        """Fetch raw file content from GitHub repository.

        Args:
            repo_url: GitHub repository URL
            file_path: Path to file in repository

        Returns:
            File content as string, None if not found
        """

        def _assert_https(url: str) -> None:
            if not url.startswith("https://"):
                raise ValueError("Only https:// URLs are allowed")

        try:
            # Convert repo URL to raw URL
            if "github.com" in repo_url:
                # Extract user/repo from URL
                parts = repo_url.rstrip("/").split("/")
                if len(parts) >= 2:
                    user = parts[-2]
                    repo = parts[-1].replace(".git", "")
                    raw_url = f"https://raw.githubusercontent.com/{user}/{repo}/main/{file_path}"
                    _assert_https(raw_url)
                    r = requests.get(raw_url, timeout=10)
                    if r.status_code == 200:
                        return r.text
        except Exception:
            # Try 'master' branch if 'main' fails
            try:
                if "github.com" in repo_url:
                    parts = repo_url.rstrip("/").split("/")
                    if len(parts) >= 2:
                        user = parts[-2]
                        repo = parts[-1].replace(".git", "")
                        raw_url = f"https://raw.githubusercontent.com/{user}/{repo}/master/{file_path}"
                        _assert_https(raw_url)
                        r2 = requests.get(raw_url, timeout=10)
                        if r2.status_code == 200:
                            return r2.text
            except Exception:
                pass

        return None

    def parse_node_class_mappings(self, python_content: str) -> dict[str, str]:
        """Parse NODE_CLASS_MAPPINGS from Python file content.

        Args:
            python_content: Python file content as string

        Returns:
            Dictionary mapping node class names to repository info
        """
        mappings = {}

        try:
            tree = ast.parse(python_content)

            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    # Look for NODE_CLASS_MAPPINGS assignment
                    for target in node.targets:
                        if (
                            isinstance(target, ast.Name)
                            and target.id == "NODE_CLASS_MAPPINGS"
                            and isinstance(node.value, ast.Dict)
                        ):
                            # Parse the dictionary
                            for key_node, _value_node in zip(
                                node.value.keys, node.value.values
                            ):
                                if isinstance(key_node, ast.Str):
                                    # Python < 3.8
                                    key = key_node.s
                                elif isinstance(key_node, ast.Constant) and isinstance(
                                    key_node.value, str
                                ):
                                    # Python >= 3.8
                                    key = key_node.value
                                else:
                                    continue

                                mappings[key] = key  # Map to itself for now

        except SyntaxError:
            # Fallback to regex parsing if AST fails
            pattern = r"NODE_CLASS_MAPPINGS\s*=\s*{([^}]*)}"
            match = re.search(pattern, python_content, re.DOTALL)

            if match:
                content = match.group(1)
                # Extract string keys
                key_pattern = r'"([^"]+)"\s*:'
                keys = re.findall(key_pattern, content)
                for key in keys:
                    mappings[key] = key

                # Also try single quotes
                key_pattern = r"'([^']+)'\s*:"
                keys = re.findall(key_pattern, content)
                for key in keys:
                    mappings[key] = key

        return mappings

    def analyze_repository_node_mappings(self, repo_url: str) -> dict[str, str]:
        """Analyze a repository to extract all NODE_CLASS_MAPPINGS.

        Args:
            repo_url: GitHub repository URL

        Returns:
            Dictionary mapping node class names to this repository
        """
        mappings = {}

        # Common file patterns to check
        files_to_check = [
            "__init__.py",
            "nodes.py",
            "node.py",
            "custom_nodes.py",
        ]

        # Also check for main Python files in root
        repo_name = repo_url.split("/")[-1].replace(".git", "")
        files_to_check.extend(
            [
                f"{repo_name}.py",
                "main.py",
            ]
        )

        for file_path in files_to_check:
            content = self.fetch_github_raw_file(repo_url, file_path)
            if content:
                file_mappings = self.parse_node_class_mappings(content)
                for class_name in file_mappings:
                    mappings[class_name] = repo_url

        return mappings

    def build_comprehensive_node_mapping(
        self, force_refresh: bool = False
    ) -> dict[str, str]:
        """Build comprehensive mapping of node class names to repositories.

        Args:
            force_refresh: Force refresh even if cache exists

        Returns:
            Dictionary mapping node class names to repository URLs
        """
        # Check if we have a cached version
        if (
            not force_refresh
            and self._node_mapping_cache_path
            and self._node_mapping_cache_path.exists()
        ):
            try:
                with open(self._node_mapping_cache_path) as f:
                    cached_data = json.load(f)

                # Check if cache is recent (less than 24 hours old)
                cache_time = cached_data.get("timestamp", 0)
                if time.time() - cache_time < 24 * 3600:  # 24 hours
                    self._comprehensive_node_mapping = cached_data.get("mappings", {})
                    return self._comprehensive_node_mapping
            except Exception:
                pass

        print(
            "Building comprehensive node class mapping (this may take a few minutes)..."
        )

        # Get all repositories from ComfyUI-Manager database
        try:
            database = self.load_comfyui_manager_database()
            repositories = []

            for entry in database.get("custom_nodes", []):
                repo_url = entry.get("reference", "")
                if repo_url and self.validate_repository_url(repo_url):
                    repositories.append(repo_url)

            print(f"Analyzing {len(repositories)} repositories...")

            comprehensive_mapping = {}
            processed = 0

            for repo_url in repositories:
                try:
                    repo_mappings = self.analyze_repository_node_mappings(repo_url)
                    comprehensive_mapping.update(repo_mappings)
                    processed += 1

                    if processed % 10 == 0:
                        print(
                            f"Processed {processed}/{len(repositories)} repositories..."
                        )

                except Exception:
                    # Continue with other repositories if one fails
                    continue

            # Cache the results
            if self._node_mapping_cache_path:
                self._node_mapping_cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_data = {
                    "timestamp": time.time(),
                    "mappings": comprehensive_mapping,
                    "total_repositories": len(repositories),
                    "processed_repositories": processed,
                    "total_node_classes": len(comprehensive_mapping),
                }

                with open(self._node_mapping_cache_path, "w") as f:
                    json.dump(cache_data, f, indent=2)

            self._comprehensive_node_mapping = comprehensive_mapping
            print(
                f"✓ Built mapping for {len(comprehensive_mapping)} node classes from {processed} repositories"
            )

            return comprehensive_mapping

        except Exception as e:
            print(f"Warning: Failed to build comprehensive mapping: {e}")
            return {}

    def find_repository_by_class_name_comprehensive(
        self, class_name: str
    ) -> str | None:
        """Find repository URL using comprehensive node class mapping.

        Args:
            class_name: The class name of the custom node

        Returns:
            Repository URL if found, None otherwise
        """
        # Load comprehensive mapping if not already loaded
        if not self._comprehensive_node_mapping:
            self._comprehensive_node_mapping = self.build_comprehensive_node_mapping()

        # Direct lookup
        if class_name in self._comprehensive_node_mapping:
            return self._comprehensive_node_mapping[class_name]

        # Try case-insensitive lookup
        for mapped_class_name, repo_url in self._comprehensive_node_mapping.items():
            if class_name.lower() == mapped_class_name.lower():
                return repo_url

        # Try partial matching (fallback)
        for mapped_class_name, repo_url in self._comprehensive_node_mapping.items():
            if (
                class_name.lower() in mapped_class_name.lower()
                or mapped_class_name.lower() in class_name.lower()
            ):
                return repo_url

        return None

    def resolve_custom_node_repositories(
        self,
        custom_nodes: list[dict[str, Any]],
        manual_repos: dict[str, str] | None = None,
        interactive: bool = True,
        use_comprehensive_lookup: bool = True,
        use_comfyui_json: bool = True,
    ) -> list[NodeMetadata]:
        """Resolve custom node class names to repositories with hybrid approach.

        Args:
            custom_nodes: List of custom node dictionaries from extract_custom_nodes
            manual_repos: Optional dictionary of class_name -> repository_url
            interactive: Whether to prompt for missing repositories
            use_comprehensive_lookup: Whether to use comprehensive NODE_CLASS_MAPPINGS analysis
            use_comfyui_json: Whether to use comfyui-json library for resolution

        Returns:
            List of NodeMetadata with resolved repository URLs
        """
        resolved_nodes = []
        manual_repos = manual_repos or {}

        # Try using comfyui-json resolver first if enabled
        if use_comfyui_json:
            try:
                from src.workflows.node_resolver import ComfyUIJsonResolver

                resolver = ComfyUIJsonResolver(cache_dir=self.cache_dir)

                # Extract node classes
                node_classes = []
                for node in custom_nodes:
                    class_name = node.get("class_type", "")
                    if class_name and class_name not in manual_repos:
                        node_classes.append(class_name)

                if node_classes:
                    print(
                        f"Resolving {len(node_classes)} custom nodes using comfyui-json..."
                    )
                    resolved, unresolved = resolver.resolve_node_classes(node_classes)

                    # Group nodes by repository to avoid duplicates
                    repos_to_nodes = {}
                    for class_name, info in resolved.items():
                        if info.get("url"):
                            repo_url = info["url"]
                            if repo_url not in repos_to_nodes:
                                repos_to_nodes[repo_url] = {
                                    "nodes": [],
                                    "pip": info.get("pip", []),
                                    "name": info.get("name", repo_url.split("/")[-1]),
                                }
                            repos_to_nodes[repo_url]["nodes"].append(class_name)

                    # Create one NodeMetadata per repository
                    for repo_url, repo_info in repos_to_nodes.items():
                        # Extract the actual repository name from the URL
                        # This should be the exact folder name ComfyUI expects
                        repo_name = (
                            repo_url.rstrip("/").split("/")[-1].replace(".git", "")
                        )
                        node_metadata = NodeMetadata(
                            name=repo_name,
                            repository=repo_url,
                            commit_hash=None,
                            python_dependencies=repo_info["pip"],
                        )
                        resolved_nodes.append(node_metadata)

                        # Log which nodes are covered by this repository
                        nodes_list = ", ".join(repo_info["nodes"])
                        print(f"  Repository {repo_name} provides: {nodes_list}")

                    # Handle manual repos
                    for class_name, repo_url in manual_repos.items():
                        if self.validate_repository_url(repo_url):
                            node_metadata = NodeMetadata(
                                name=class_name.replace("|", "_")
                                .replace(" ", "_")
                                .replace("(", "")
                                .replace(")", ""),
                                repository=repo_url,
                                commit_hash=None,
                            )
                            resolved_nodes.append(node_metadata)

                    # Handle unresolved nodes
                    if unresolved and interactive:
                        print(
                            f"\n⚠️  Could not automatically resolve {len(unresolved)} custom nodes:"
                        )
                        for node_class in unresolved:
                            print(f"  • {node_class}")
                        print("\nFalling back to manual resolution...")

                        for node_class in unresolved:
                            repo_url = self.prompt_for_manual_repository(node_class)
                            if repo_url and self.validate_repository_url(repo_url):
                                node_metadata = NodeMetadata(
                                    name=node_class.replace("|", "_")
                                    .replace(" ", "_")
                                    .replace("(", "")
                                    .replace(")", ""),
                                    repository=repo_url,
                                    commit_hash=None,
                                )
                                resolved_nodes.append(node_metadata)

                    return resolved_nodes

            except ImportError:
                print(
                    "Warning: comfyui-json resolver not available, falling back to legacy method"
                )
            except Exception as e:
                print(
                    f"Warning: comfyui-json resolver failed: {e}, falling back to legacy method"
                )

        # Fallback to original implementation
        # First, collect all unresolved custom nodes

        for node in custom_nodes:
            class_name = node.get("class_type", "")

            # Skip if no class name
            if not class_name:
                continue

            repository_url = None

            # 1. Check if already in metadata and not None
            if "repository" in node and node["repository"]:
                repository_url = node["repository"]

            # 2. Check manual repositories first
            elif class_name in manual_repos:
                repository_url = manual_repos[class_name]

            # 3. Try automatic lookup
            else:
                if use_comprehensive_lookup:
                    # Use comprehensive approach (parses actual NODE_CLASS_MAPPINGS)
                    repository_url = self.find_repository_by_class_name_comprehensive(
                        class_name
                    )

                    # Fallback to simple lookup if comprehensive fails
                    if not repository_url:
                        repository_url = self.find_repository_by_class_name(class_name)
                else:
                    # Use simple pattern matching approach
                    repository_url = self.find_repository_by_class_name(class_name)

            # 4. Fallback to manual input if interactive
            if not repository_url and interactive:
                repository_url = self.prompt_for_manual_repository(class_name)

            # Create NodeMetadata if we have a repository
            if repository_url and self.validate_repository_url(repository_url):
                node_metadata = NodeMetadata(
                    name=class_name.replace("|", "_").replace(
                        " ", "_"
                    ),  # Safe filename
                    repository=repository_url,
                    commit_hash=node.get("commit"),
                )
                resolved_nodes.append(node_metadata)
            else:
                print(
                    f"Warning: Could not resolve repository for custom node '{class_name}'"
                )

        return resolved_nodes

    def prompt_for_manual_repository(self, class_name: str) -> str | None:
        """Prompt user for manual repository URL input.

        Args:
            class_name: The class name of the custom node

        Returns:
            Repository URL if provided, None if skipped
        """
        print("\n" + "=" * 60)
        print(f"🔍 Custom Node Found: '{class_name}'")
        print("=" * 60)
        print("\nThis custom node was not found in the ComfyUI-Manager database.")
        print("Please provide the GitHub repository URL for this node.")
        print("\nExample: https://github.com/username/repository-name")
        print("(Press Enter to skip this node)")
        print("-" * 60)

        while True:
            try:
                repo_url = input(f"GitHub URL for '{class_name}': ").strip()

                if not repo_url:
                    print(f"⚠️  Skipping '{class_name}'")
                    return None

                if self.validate_repository_url(repo_url):
                    # Cache the manual mapping
                    self._node_mapping_cache[class_name] = repo_url
                    print(f"✅ Repository URL accepted for '{class_name}'")
                    return repo_url
                else:
                    print(f"❌ Invalid repository URL: {repo_url}")
                    print(
                        "Please enter a valid GitHub URL (e.g., https://github.com/user/repo)"
                    )
                    continue

            except (KeyboardInterrupt, EOFError):
                print("\n⚠️  Skipping remaining custom nodes")
                return None

    def generate_install_commands(self, node_metadata: NodeMetadata) -> list[str]:
        """Generate installation commands for a custom node.

        Args:
            node_metadata: Metadata for the custom node

        Returns:
            List of installation commands
        """
        commands = []

        # Clone repository
        commands.append(
            f"RUN git clone {node_metadata.repository} "
            f"/app/custom_nodes/{node_metadata.name}"
        )

        # Checkout specific commit if provided
        if node_metadata.commit_hash:
            commands.append(
                f"RUN cd /app/custom_nodes/{node_metadata.name} && "
                f"git checkout {node_metadata.commit_hash}"
            )

        # Install Python dependencies
        if node_metadata.python_dependencies:
            deps = " ".join(node_metadata.python_dependencies)
            commands.append(f"RUN pip install --no-cache-dir {deps}")

        # Install system dependencies
        if node_metadata.system_dependencies:
            system_deps = " ".join(node_metadata.system_dependencies)
            commands.append(
                f"RUN apt-get update && apt-get install -y {system_deps} && "
                f"apt-get clean && rm -rf /var/lib/apt/lists/*"
            )

        return commands

    def generate_requirements_txt(self, nodes: list[NodeMetadata]) -> str:
        """Generate requirements.txt for custom nodes.

        Args:
            nodes: List of custom node metadata

        Returns:
            Requirements.txt content
        """
        requirements = set()

        for node in nodes:
            for dep in node.python_dependencies:
                requirements.add(dep)

        return "\n".join(sorted(requirements))

    def detect_dependencies_from_code(self, filepath: str) -> set[str]:
        """Detect Python dependencies from source code.

        Args:
            filepath: Path to Python file

        Returns:
            Set of detected dependencies
        """
        dependencies = set()

        with open(filepath, encoding="utf-8") as f:
            content = f.read()

        # Parse AST to find imports
        try:
            tree = ast.parse(content)

            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        module = alias.name.split(".")[0]
                        # Map to proper package name
                        package = self._dependency_map.get(module, module)
                        # Skip standard library modules
                        if not self._is_stdlib(module):
                            dependencies.add(package)

                elif isinstance(node, ast.ImportFrom) and node.module:
                    module = node.module.split(".")[0]
                    package = self._dependency_map.get(module, module)
                    if not self._is_stdlib(module):
                        dependencies.add(package)

        except SyntaxError:
            # If parsing fails, try regex fallback
            import_pattern = r"(?:from|import)\s+(\w+)"
            for match in re.finditer(import_pattern, content):
                module = match.group(1)
                package = self._dependency_map.get(module, module)
                if not self._is_stdlib(module):
                    dependencies.add(package)

        return dependencies

    def validate_repository_url(self, url: str) -> bool:
        """Validate repository URL.

        Args:
            url: Repository URL

        Returns:
            True if valid GitHub URL
        """
        github_patterns = [
            r"^https://github\.com/[\w-]+/[\w-]+(?:\.git)?$",
            r"^git@github\.com:[\w-]+/[\w-]+(?:\.git)?$",
        ]

        return any(re.match(pattern, url) for pattern in github_patterns)

    def generate_dockerfile_section(self, nodes: list[NodeMetadata]) -> str:
        """Generate Dockerfile section for custom nodes.

        Args:
            nodes: List of custom node metadata

        Returns:
            Dockerfile section as string
        """
        lines = ["# Install custom nodes"]
        lines.append("WORKDIR /app/custom_nodes")
        lines.append("")

        def _safe_dir(name: str) -> str:
            allowed = set(
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
            )
            name = (name or "custom_node").replace(" ", "_")
            name = name.replace("/", "_").replace("\\", "_")
            return "".join(ch for ch in name if ch in allowed) or "custom_node"

        for node in nodes:
            safe_name = _safe_dir(node.name)
            lines.append(f"# Install {safe_name}")
            lines.append(f"RUN git clone {node.repository} {safe_name}")

            if node.commit_hash:
                lines.append(f"RUN cd {safe_name} && git checkout {node.commit_hash}")

            if node.python_dependencies:
                deps = " ".join(node.python_dependencies)
                lines.append(f"RUN pip install --no-cache-dir {deps}")

            lines.append("")

        lines.append("WORKDIR /app")
        return "\n".join(lines)

    def resolve_dependency_order(self, nodes: list[NodeMetadata]) -> list[NodeMetadata]:
        """Resolve installation order based on dependencies.

        Args:
            nodes: List of custom nodes

        Returns:
            Ordered list with dependencies first
        """
        # Build dependency graph
        node_map = {node.name: node for node in nodes}
        visited = set()
        result = []

        def visit(node_name: str) -> None:
            if node_name in visited:
                return

            visited.add(node_name)
            node = node_map.get(node_name)

            if not node:
                return

            # Visit dependencies first
            for dep in node.depends_on:
                if dep in node_map:
                    visit(dep)

            result.append(node)

        # Visit all nodes
        for node in nodes:
            visit(node.name)

        return result

    def set_cache_directory(self, cache_dir: str) -> None:
        """Set cache directory for downloaded nodes.

        Args:
            cache_dir: Path to cache directory
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def download_and_cache_node(self, node_metadata: NodeMetadata) -> None:
        """Download and cache a custom node.

        Args:
            node_metadata: Node metadata
        """
        if not self.cache_dir:
            raise ValueError("Cache directory not set")

        # Create cache key
        cache_key = f"{node_metadata.name}_{node_metadata.commit_hash or 'latest'}"
        cache_path = self.cache_dir / cache_key

        # Check if already cached
        if cache_path.exists():
            return

        # Download node
        cmd = ["git", "clone", node_metadata.repository, str(cache_path)]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise NodeInstallationError(f"Failed to clone repository: {result.stderr}")

        # Checkout specific commit if provided
        if node_metadata.commit_hash:
            cmd = ["git", "checkout", node_metadata.commit_hash]
            result = subprocess.run(
                cmd, cwd=str(cache_path), capture_output=True, text=True
            )

            if result.returncode != 0:
                raise NodeInstallationError(
                    f"Failed to checkout commit: {result.stderr}"
                )

    def install_node(self, node_metadata: NodeMetadata) -> None:
        """Install a custom node.

        Args:
            node_metadata: Node metadata

        Raises:
            NodeInstallationError: If installation fails
        """
        if not self.validate_repository_url(node_metadata.repository):
            raise NodeInstallationError(
                f"Invalid repository URL: {node_metadata.repository}"
            )

        # Generate and execute install commands
        commands = self.generate_install_commands(node_metadata)

        for cmd in commands:
            # This would execute the commands in a real implementation
            # For testing, we just validate the command format
            if not cmd.startswith("RUN "):
                raise NodeInstallationError(f"Invalid command format: {cmd}")

    def verify_installation(self, node_name: str, custom_nodes_dir: str) -> bool:
        """Verify if a custom node is properly installed.

        Args:
            node_name: Name of the node
            custom_nodes_dir: Path to custom nodes directory

        Returns:
            True if node is installed
        """
        node_path = Path(custom_nodes_dir) / node_name

        if not node_path.exists():
            return False

        # Check for basic module structure
        if not (node_path / "__init__.py").exists():
            return False

        # Check for at least one Python file
        python_files = list(node_path.glob("*.py"))
        return len(python_files) > 0

    def generate_batch_install_commands(self, nodes: list[NodeMetadata]) -> list[str]:
        """Generate batch installation commands for multiple nodes.

        Args:
            nodes: List of custom nodes

        Returns:
            Optimized list of commands
        """
        commands = []

        def _safe_dir(name: str) -> str:
            allowed = set(
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
            )
            name = (name or "custom_node").replace(" ", "_")
            name = name.replace("/", "_").replace("\\", "_")
            return "".join(ch for ch in name if ch in allowed) or "custom_node"

        # Clone all repositories
        for node in nodes:
            safe_name = _safe_dir(node.name)
            commands.append(
                f"RUN git clone {node.repository} /app/custom_nodes/{safe_name}"
            )

        # Collect all Python dependencies
        all_deps = set()
        for node in nodes:
            all_deps.update(node.python_dependencies)

        # Install all dependencies in one command
        if all_deps:
            deps_str = " ".join(sorted(all_deps))
            commands.append(f"RUN pip install --no-cache-dir {deps_str}")

        return commands

    def extract_node_mappings(self, filepath: str) -> dict[str, Any]:
        """Extract node class mappings from custom node file.

        Args:
            filepath: Path to node mappings file

        Returns:
            Dictionary with class and display name mappings
        """
        with open(filepath, encoding="utf-8") as f:
            content = f.read()

        mappings: dict[str, dict[str, Any]] = {
            "class_mappings": {},
            "display_names": {},
        }

        # Extract NODE_CLASS_MAPPINGS
        class_pattern = r"NODE_CLASS_MAPPINGS\s*=\s*{([^}]+)}"
        class_match = re.search(class_pattern, content, re.DOTALL)

        if class_match:
            entries = class_match.group(1)
            entry_pattern = r'"([^"]+)":\s*(\w+)'
            for match in re.finditer(entry_pattern, entries):
                mappings["class_mappings"][match.group(1)] = match.group(2)

        # Extract NODE_DISPLAY_NAME_MAPPINGS
        display_pattern = r"NODE_DISPLAY_NAME_MAPPINGS\s*=\s*{([^}]+)}"
        display_match = re.search(display_pattern, content, re.DOTALL)

        if display_match:
            entries = display_match.group(1)
            entry_pattern = r'"([^"]+)":\s*"([^"]+)"'
            for match in re.finditer(entry_pattern, entries):
                mappings["display_names"][match.group(1)] = match.group(2)

        return mappings

    def generate_custom_nodes_init(self, nodes: list[NodeMetadata]) -> str:
        """Generate __init__.py for custom nodes directory.

        Args:
            nodes: List of custom nodes

        Returns:
            Content for __init__.py file
        """
        lines = [
            '"""Custom nodes initialization."""',
            "",
        ]

        # Import statements
        for node in nodes:
            lines.append(f"from .{node.name} import *")

        lines.append("")
        lines.append("__all__ = [")

        for node in nodes:
            lines.append(f'    "{node.name}",')

        lines.append("]")

        return "\n".join(lines)

    def check_compatibility(self, node: NodeMetadata, comfyui_version: str) -> bool:
        """Check if node is compatible with ComfyUI version.

        Args:
            node: Node metadata
            comfyui_version: ComfyUI version string

        Returns:
            True if compatible
        """
        current_version = version.parse(comfyui_version)

        if node.min_comfyui_version:
            min_version = version.parse(node.min_comfyui_version)
            if current_version < min_version:
                return False

        if node.max_comfyui_version:
            max_version = version.parse(node.max_comfyui_version)
            if current_version > max_version:
                return False

        return True

    def _is_stdlib(self, module: str) -> bool:
        """Check if module is part of Python standard library.

        Args:
            module: Module name

        Returns:
            True if standard library module
        """
        stdlib_modules = {
            "os",
            "sys",
            "re",
            "json",
            "math",
            "random",
            "datetime",
            "collections",
            "itertools",
            "functools",
            "pathlib",
            "typing",
            "subprocess",
            "threading",
            "multiprocessing",
            "asyncio",
            "urllib",
            "http",
            "socket",
            "time",
            "logging",
            "argparse",
            "configparser",
            "sqlite3",
            "csv",
            "xml",
            "html",
            "base64",
            "hashlib",
            "hmac",
            "uuid",
            "tempfile",
            "shutil",
            "glob",
            "ast",
            "inspect",
            "importlib",
            "copy",
            "pickle",
            "io",
        }
        return module in stdlib_modules
