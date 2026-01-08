"""Workflow parser for ComfyUI JSON format."""

import json
from pathlib import Path
from typing import Any

from src.workflows.constants import BUILTIN_NODES
from src.workflows.converter import WorkflowConverter


class WorkflowParseResult:
    """Result object from workflow parsing."""

    def __init__(
        self,
        nodes: dict[str, dict[str, Any]],
        format: str,
        is_valid: bool = True,
        errors: list[str] | None = None,
    ):
        """Initialize workflow parse result.

        Args:
            nodes: Dictionary of nodes in the workflow
            format: Format of the workflow (api or ui)
            is_valid: Whether the workflow is valid
            errors: List of parsing errors if any
        """
        self.nodes = nodes
        self.format = format
        self.is_valid = is_valid
        self.errors = errors or []
        self._connections: list[dict[str, Any]] | None = None

    def get_connections(self) -> list[dict[str, Any]]:
        """Extract connections between nodes.

        Returns:
            List of connection dictionaries
        """
        if self._connections is not None:
            return self._connections

        connections = []
        for node_id, node_data in self.nodes.items():
            inputs = node_data.get("inputs", {})
            for input_name, input_value in inputs.items():
                # Check if input is a connection (list with [node_id, output_index])
                if isinstance(input_value, list) and len(input_value) == 2:  # noqa: SIM102
                    if isinstance(input_value[0], str) and isinstance(
                        input_value[1], int
                    ):
                        connections.append(
                            {
                                "from_node": input_value[0],
                                "from_output": input_value[1],
                                "to_node": node_id,
                                "to_input": input_name,
                            }
                        )

        self._connections = connections
        return connections

    def get_custom_nodes(self) -> set[str]:
        """Identify custom nodes in the workflow.

        Returns:
            Set of custom node class types
        """
        custom_nodes = set()
        for node_data in self.nodes.values():
            class_type = node_data.get("class_type", "")
            if class_type and class_type not in BUILTIN_NODES:
                custom_nodes.add(class_type)
        return custom_nodes

    def get_metadata(self) -> dict[str, Any]:
        """Extract workflow metadata.

        Returns:
            Dictionary containing workflow metadata
        """
        node_types = set()
        for node_data in self.nodes.values():
            if "class_type" in node_data:
                node_types.add(node_data["class_type"])

        return {
            "node_count": len(self.nodes),
            "node_types": list(node_types),
            "has_custom_nodes": len(self.get_custom_nodes()) > 0,
            "connection_count": len(self.get_connections()),
            "format": self.format,
        }

    def validate_connections(self) -> bool:
        """Validate connections and check for circular dependencies.

        Returns:
            True if connections are valid

        Raises:
            ValueError: If circular dependencies are detected
        """
        # Build adjacency list for dependency graph
        graph = {}
        for node_id in self.nodes:
            graph[node_id] = []

        for conn in self.get_connections():
            from_node = conn["from_node"]
            to_node = conn["to_node"]
            if from_node in graph and to_node in graph:
                graph[to_node].append(from_node)

        # Check for cycles using DFS
        visited = set()
        rec_stack = set()

        def has_cycle(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)

            for neighbor in graph.get(node, []):
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True

            rec_stack.remove(node)
            return False

        for node in graph:
            if node not in visited and has_cycle(node):
                raise ValueError(f"Circular dependency detected involving node {node}")

        return True


class WorkflowParser:
    """Parser for ComfyUI workflow JSON files."""

    def __init__(self):
        """Initialize the parser with a converter."""
        self.converter = WorkflowConverter()

    def parse(self, workflow_data: dict[str, Any]) -> WorkflowParseResult:
        """Parse a workflow dictionary.

        Args:
            workflow_data: Workflow data as dictionary

        Returns:
            WorkflowParseResult object

        Raises:
            ValueError: If workflow is invalid or empty
        """
        if not workflow_data:
            raise ValueError("Empty workflow provided")

        # Detect format
        format_type = self.converter.detect_format(workflow_data)

        # Convert to API format if needed
        if format_type == "ui":
            nodes = self.converter.ui_to_api(workflow_data)
        else:
            nodes = workflow_data

        # Validate workflow structure
        if not nodes:
            raise ValueError("No nodes found in workflow")

        # Validate each node
        for node_id, node_data in nodes.items():
            if not self._validate_node_structure(node_data):
                raise ValueError(
                    f"Invalid workflow: Node {node_id} has invalid structure"
                )

            # Ensure outputs field exists
            if "outputs" not in node_data:
                node_data["outputs"] = []

        return WorkflowParseResult(nodes=nodes, format=format_type, is_valid=True)

    def parse_string(self, workflow_json: str) -> WorkflowParseResult:
        """Parse a workflow from JSON string.

        Args:
            workflow_json: Workflow as JSON string

        Returns:
            WorkflowParseResult object

        Raises:
            json.JSONDecodeError: If JSON is malformed
        """
        workflow_data = json.loads(workflow_json)
        return self.parse(workflow_data)

    def parse_file(self, filepath: str | Path) -> WorkflowParseResult:
        """Parse a workflow from file.

        Args:
            filepath: Path to workflow JSON file

        Returns:
            WorkflowParseResult object

        Raises:
            FileNotFoundError: If file doesn't exist
        """
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"Workflow file not found: {filepath}")

        with open(filepath, encoding="utf-8") as f:
            workflow_data = json.load(f)

        return self.parse(workflow_data)

    def _validate_node_structure(self, node_data: Any) -> bool:
        """Validate individual node structure.

        Args:
            node_data: Node data to validate

        Returns:
            True if node structure is valid
        """
        if not isinstance(node_data, dict):
            return False

        # Must have class_type
        if "class_type" not in node_data:
            return False

        # class_type must be a string
        if not isinstance(node_data["class_type"], str):
            return False

        # If inputs exist, must be a dict
        return not ("inputs" in node_data and not isinstance(node_data["inputs"], dict))
