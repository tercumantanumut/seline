"""Node analyzer for ComfyUI workflows."""

from collections import defaultdict, deque
from typing import Any

from src.workflows.constants import BUILTIN_NODES
from src.workflows.converter import WorkflowConverter


class NodeAnalyzer:
    """Analyzer for ComfyUI workflow nodes."""

    def __init__(self):
        """Initialize analyzer with converter."""
        self.converter = WorkflowConverter()

    def identify_node_type(self, class_type: str | None) -> str:
        """Identify if a node is builtin, custom, or unknown.

        Args:
            class_type: The class type of the node

        Returns:
            'builtin', 'custom', or 'unknown'
        """
        if not class_type:
            return "unknown"

        if class_type in BUILTIN_NODES:
            return "builtin"

        return "custom"

    def analyze(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> dict[str, Any]:
        """Perform comprehensive analysis of workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            Analysis results dictionary
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        if not nodes:
            return {
                "total_nodes": 0,
                "builtin_nodes": 0,
                "custom_nodes": 0,
                "custom_node_types": [],
                "node_types": [],
            }

        builtin_count = 0
        custom_count = 0
        custom_node_types = set()
        node_types = set()

        for node_data in nodes.values():
            class_type = node_data.get("class_type", "")
            node_types.add(class_type)

            node_type = self.identify_node_type(class_type)
            if node_type == "builtin":
                builtin_count += 1
            elif node_type == "custom":
                custom_count += 1
                custom_node_types.add(class_type)

        return {
            "total_nodes": len(nodes),
            "builtin_nodes": builtin_count,
            "custom_nodes": custom_count,
            "custom_node_types": list(custom_node_types),
            "node_types": list(node_types),
        }

    def build_dependency_graph(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> dict[str, dict[str, Any]]:
        """Build a dependency graph from workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            Dependency graph with node relationships
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)
        graph = {}

        for node_id, node_data in nodes.items():
            dependencies = {}
            inputs = node_data.get("inputs", {})

            for input_name, input_value in inputs.items():
                # Check if input is a connection
                if isinstance(input_value, list) and len(input_value) == 2:  # noqa: SIM102
                    if isinstance(input_value[0], str):
                        dep_node = input_value[0]
                        if dep_node not in dependencies:
                            dependencies[dep_node] = []
                        dependencies[dep_node].append(input_name)

            graph[node_id] = {
                "class_type": node_data.get("class_type", ""),
                "dependencies": dependencies,
            }

        return graph

    def find_execution_order(
        self, workflow: dict[str, dict[str, Any]] | dict[str, Any]
    ) -> list[str]:
        """Find execution order using topological sort.

        Args:
            workflow: Workflow dictionary (can be UI or API format)

        Returns:
            List of node IDs in execution order
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)
        # Build adjacency list
        graph = defaultdict(list)
        in_degree = defaultdict(int)

        # Initialize all nodes
        for node_id in nodes:
            in_degree[node_id] = 0

        # Build graph
        for node_id, node_data in nodes.items():
            inputs = node_data.get("inputs", {})
            for input_value in inputs.values():
                if isinstance(input_value, list) and len(input_value) == 2:  # noqa: SIM102
                    if isinstance(input_value[0], str):
                        dep_node = input_value[0]
                        if dep_node in nodes:  # Valid dependency
                            graph[dep_node].append(node_id)
                            in_degree[node_id] += 1

        # Topological sort using Kahn's algorithm
        queue = deque([node for node in nodes if in_degree[node] == 0])
        result = []

        while queue:
            node = queue.popleft()
            result.append(node)

            for neighbor in graph[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return result

    def find_isolated_nodes(self, nodes: dict[str, dict[str, Any]]) -> set[str]:
        """Find nodes that are not connected to the main workflow.

        Args:
            nodes: Dictionary of nodes

        Returns:
            Set of isolated node IDs
        """
        connected = set()
        has_outputs = set()

        # Find all nodes that are referenced or reference others
        for node_id, node_data in nodes.items():
            inputs = node_data.get("inputs", {})
            outputs = node_data.get("outputs", [])

            if outputs:
                has_outputs.add(node_id)

            for input_value in inputs.values():
                if isinstance(input_value, list) and len(input_value) == 2:  # noqa: SIM102
                    if isinstance(input_value[0], str):
                        connected.add(node_id)
                        connected.add(input_value[0])

        # Isolated nodes are those not in connected set but have outputs
        isolated = set()
        for node_id in nodes:
            if node_id not in connected and node_id in has_outputs:
                isolated.add(node_id)

        return isolated

    def analyze_connections(self, nodes: dict[str, dict[str, Any]]) -> dict[str, Any]:
        """Analyze connections between nodes.

        Args:
            nodes: Dictionary of nodes

        Returns:
            Connection analysis results
        """
        total_connections = 0
        input_counts = {}
        output_consumers = defaultdict(int)

        for node_id, node_data in nodes.items():
            inputs = node_data.get("inputs", {})
            input_count = 0

            for input_value in inputs.values():
                if isinstance(input_value, list) and len(input_value) == 2:  # noqa: SIM102
                    if isinstance(input_value[0], str):
                        total_connections += 1
                        input_count += 1
                        output_consumers[input_value[0]] += 1

            input_counts[node_id] = input_count

        max_inputs_node = (
            max(input_counts, key=input_counts.get) if input_counts else None
        )
        max_outputs_consumers = (
            max(output_consumers.values()) if output_consumers else 0
        )

        return {
            "total_connections": total_connections,
            "max_inputs_node": max_inputs_node,
            "max_outputs_consumers": max_outputs_consumers,
            "input_counts": input_counts,
            "output_consumers": dict(output_consumers),
        }

    def find_model_loaders(
        self, nodes: dict[str, dict[str, Any]]
    ) -> dict[str, dict[str, Any]]:
        """Find model loader nodes.

        Args:
            nodes: Dictionary of nodes

        Returns:
            Dictionary of model loader nodes
        """
        loader_types = {
            "CheckpointLoaderSimple",
            "CheckpointLoader",
            "LoraLoader",
            "VAELoader",
            "CLIPLoader",
            "ControlNetLoader",
        }

        loaders = {}
        for node_id, node_data in nodes.items():
            class_type = node_data.get("class_type", "")
            if class_type in loader_types:
                model_name = None
                inputs = node_data.get("inputs", {})

                # Look for model file references
                for key in ["ckpt_name", "lora_name", "vae_name", "model_name"]:
                    if key in inputs:
                        model_name = inputs[key]
                        break

                loaders[node_id] = {"type": class_type, "model_name": model_name}

        return loaders

    def extract_python_dependencies(self, nodes: dict[str, dict[str, Any]]) -> set[str]:
        """Extract Python dependencies from custom nodes.

        Args:
            nodes: Dictionary of nodes

        Returns:
            Set of Python package dependencies
        """
        dependencies = set()

        for node_data in nodes.values():
            # Check for _meta field with dependencies
            meta = node_data.get("_meta", {})
            if "dependencies" in meta:
                deps = meta["dependencies"]
                if isinstance(deps, list):
                    dependencies.update(deps)

        return dependencies

    def find_output_nodes(
        self, nodes: dict[str, dict[str, Any]]
    ) -> dict[str, dict[str, Any]]:
        """Find output nodes (SaveImage, PreviewImage, etc).

        Args:
            nodes: Dictionary of nodes

        Returns:
            Dictionary of output nodes
        """
        output_types = {"SaveImage", "PreviewImage"}
        outputs = {}

        for node_id, node_data in nodes.items():
            class_type = node_data.get("class_type", "")
            if class_type in output_types:
                outputs[node_id] = {"type": class_type}

        return outputs

    def calculate_complexity(self, nodes: dict[str, dict[str, Any]]) -> dict[str, Any]:
        """Calculate workflow complexity metrics.

        Args:
            nodes: Dictionary of nodes

        Returns:
            Complexity metrics
        """
        analysis = self.analyze(nodes)
        connections = self.analyze_connections(nodes)
        execution_order = self.find_execution_order(nodes)

        # Calculate depth (longest path in execution order)
        depth = len(execution_order) if execution_order else 0

        # Simple complexity score
        score = (
            len(nodes)
            + connections["total_connections"] * 2
            + analysis["custom_nodes"] * 3
            + depth
        )

        return {
            "nodes": len(nodes),
            "connections": connections["total_connections"],
            "depth": depth,
            "custom_nodes": analysis["custom_nodes"],
            "score": score,
        }

    def validate_connections(self, nodes: dict[str, dict[str, Any]]) -> list[str]:
        """Validate node connections for issues.

        Args:
            nodes: Dictionary of nodes

        Returns:
            List of validation issues
        """
        issues = []

        for node_id, node_data in nodes.items():
            inputs = node_data.get("inputs", {})

            for input_name, input_value in inputs.items():
                if isinstance(input_value, list) and len(input_value) == 2:
                    ref_node = input_value[0]
                    input_value[1]

                    if isinstance(ref_node, str):  # noqa: SIM102
                        # Check if referenced node exists
                        if ref_node not in nodes:
                            issues.append(
                                f"Node {node_id}: Input '{input_name}' references "
                                f"non-existent node '{ref_node}'"
                            )

        return issues

    def extract_node_parameters(self, node_data: dict[str, Any]) -> dict[str, Any]:
        """Extract non-connection parameters from a node.

        Args:
            node_data: Single node data

        Returns:
            Dictionary of parameters (excluding connections)
        """
        parameters = {}
        inputs = node_data.get("inputs", {})

        for key, value in inputs.items():
            # Skip connections (lists with [node_id, output_index])
            if not (isinstance(value, list) and len(value) == 2):
                parameters[key] = value

        return parameters

    def group_by_type(self, nodes: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
        """Group nodes by their functional type.

        Args:
            nodes: Dictionary of nodes

        Returns:
            Dictionary grouping node IDs by type category
        """
        groups = {
            "loaders": [],
            "samplers": [],
            "encoders": [],
            "decoders": [],
            "outputs": [],
            "latents": [],
            "conditioning": [],
            "other": [],
        }

        for node_id, node_data in nodes.items():
            class_type = node_data.get("class_type", "")

            if "Loader" in class_type or "Load" in class_type:
                groups["loaders"].append(node_id)
            elif "Sampler" in class_type or "KSampler" in class_type:
                groups["samplers"].append(node_id)
            elif "Encode" in class_type:
                groups["encoders"].append(node_id)
            elif "Decode" in class_type:
                groups["decoders"].append(node_id)
            elif "Save" in class_type or "Preview" in class_type:
                groups["outputs"].append(node_id)
            elif "Latent" in class_type:
                groups["latents"].append(node_id)
            elif "Conditioning" in class_type or "CLIP" in class_type:
                groups["conditioning"].append(node_id)
            else:
                groups["other"].append(node_id)

        # Remove empty groups
        return {k: v for k, v in groups.items() if v}
