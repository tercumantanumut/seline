"""Workflow validator for ComfyUI workflows."""

from dataclasses import dataclass, field
from typing import Any

from src.workflows.analyzer import NodeAnalyzer
from src.workflows.constants import BUILTIN_NODES
from src.workflows.converter import WorkflowConverter


class ValidationError(Exception):
    """Custom exception for validation errors."""

    pass


@dataclass
class ValidationResult:
    """Result of workflow validation."""

    is_valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def get_report(self) -> str:
        """Generate a human-readable validation report.

        Returns:
            Formatted validation report
        """
        report_lines = []

        # Status
        status = "VALID" if self.is_valid else "INVALID"
        report_lines.append(f"Validation Status: {status}")

        # Metadata
        if "node_count" in self.metadata:
            report_lines.append(f"Total: {self.metadata['node_count']} nodes")

        # Errors
        report_lines.append(f"Errors: {len(self.errors)}")
        for error in self.errors:
            report_lines.append(f"  - {error}")

        # Warnings
        report_lines.append(f"Warnings: {len(self.warnings)}")
        for warning in self.warnings:
            report_lines.append(f"  - {warning}")

        # Complexity
        if "complexity" in self.metadata:
            complexity = self.metadata["complexity"]
            report_lines.append(f"Complexity: {complexity.get('level', 'unknown')}")

        return "\n".join(report_lines)


class WorkflowValidator:
    """Validator for ComfyUI workflows."""

    # Required inputs for common nodes
    REQUIRED_INPUTS = {
        "KSampler": ["model", "positive", "negative", "latent_image"],
        "KSamplerAdvanced": ["model", "positive", "negative", "latent_image"],
        "VAEDecode": ["samples", "vae"],
        "VAEEncode": ["pixels", "vae"],
        "CLIPTextEncode": ["text", "clip"],
        "SaveImage": ["images"],
        "LoadImage": [],
        "CheckpointLoaderSimple": ["ckpt_name"],
    }

    def __init__(self):
        """Initialize validator."""
        self.analyzer = NodeAnalyzer()
        self.converter = WorkflowConverter()

    def validate(
        self,
        workflow: dict[str, dict[str, Any]] | dict[str, Any],
        strict: bool = False,  # noqa: ARG002
        check_circular: bool = True,
        check_connections: bool = True,
        strict_types: bool = False,
    ) -> ValidationResult:
        """Validate a workflow.

        Args:
            workflow: Workflow dictionary (can be UI or API format)
            strict: Enable strict validation
            check_circular: Check for circular dependencies
            check_connections: Validate node connections
            strict_types: Enforce strict type checking

        Returns:
            ValidationResult object
        """
        # Convert to API format if needed
        nodes = self.converter.convert(workflow)

        errors = []
        warnings = []
        metadata = {}

        # Check for empty workflow
        if not nodes:
            errors.append("Workflow is empty")
            return ValidationResult(
                is_valid=False, errors=errors, warnings=warnings, metadata=metadata
            )

        metadata["node_count"] = len(nodes)

        # Basic structure validation
        for node_id, node_data in nodes.items():
            if not self._validate_node_structure(
                node_id, node_data, errors, strict_types
            ):
                continue

        # Check connections if enabled
        if check_connections:
            self._validate_connections(nodes, errors)

        # Check for circular dependencies
        if check_circular:
            self._check_circular_dependencies(nodes, errors)

        # Check for required inputs
        self._validate_required_inputs(nodes, errors)

        # Check for output nodes
        self._check_output_nodes(nodes, warnings)

        # Check for custom nodes
        self._check_custom_nodes(nodes, warnings)

        # Check for disconnected nodes
        self._check_disconnected_nodes(nodes, warnings)

        # Validate model paths
        self._validate_model_paths(nodes, errors)

        # Calculate complexity
        metadata["complexity"] = self._calculate_complexity(nodes)

        # Determine if valid
        is_valid = len(errors) == 0

        return ValidationResult(
            is_valid=is_valid, errors=errors, warnings=warnings, metadata=metadata
        )

    def _validate_node_structure(
        self, node_id: str, node_data: Any, errors: list[str], strict_types: bool
    ) -> bool:
        """Validate basic node structure.

        Args:
            node_id: Node identifier
            node_data: Node data
            errors: List to append errors to
            strict_types: Whether to enforce strict type checking

        Returns:
            True if structure is valid
        """
        if not isinstance(node_data, dict):
            errors.append(f"Node {node_id}: Invalid structure (not a dictionary)")
            return False

        if "class_type" not in node_data:
            errors.append(f"Node {node_id}: Missing 'class_type' field")
            return False

        # Validate input types if strict
        if strict_types and "inputs" in node_data:
            inputs = node_data["inputs"]
            class_type = node_data["class_type"]

            # Check specific input types for known nodes
            if class_type == "EmptyLatentImage":
                for field in ["width", "height", "batch_size"]:
                    if field in inputs and not isinstance(inputs[field], int | float):
                        errors.append(
                            f"Node {node_id}: Input '{field}' has invalid type "
                            f"(expected number, got {type(inputs[field]).__name__})"
                        )

        return True

    def _validate_connections(self, workflow: dict[str, Any], errors: list[str]):
        """Validate node connections.

        Args:
            workflow: Workflow dictionary
            errors: List to append errors to
        """
        for node_id, node_data in workflow.items():
            inputs = node_data.get("inputs", {})

            for input_name, input_value in inputs.items():
                # Check if it's a connection
                if isinstance(input_value, list) and len(input_value) == 2:
                    ref_node_id = input_value[0]
                    ref_output_idx = input_value[1]

                    # Check if referenced node exists
                    if ref_node_id not in workflow:
                        errors.append(
                            f"Node {node_id}: Input '{input_name}' references "
                            f"non-existent node '{ref_node_id}'"
                        )
                        continue

                    # Check if output index is valid
                    # Note: Most nodes don't have explicit outputs defined in the workflow
                    # The connections are validated by ComfyUI when creating the workflow
                    # We only validate if outputs are explicitly defined
                    ref_node = workflow[ref_node_id]
                    ref_outputs = ref_node.get("outputs")

                    if ref_outputs is not None and isinstance(ref_output_idx, int):  # noqa: SIM102
                        # Only validate if outputs are explicitly defined
                        if ref_output_idx >= len(ref_outputs):
                            errors.append(
                                f"Node {node_id}: Input '{input_name}' references "
                                f"invalid output index {ref_output_idx} "
                                f"(node '{ref_node_id}' has {len(ref_outputs)} outputs)"
                            )

    def _check_circular_dependencies(self, workflow: dict[str, Any], errors: list[str]):
        """Check for circular dependencies.

        Args:
            workflow: Workflow dictionary
            errors: List to append errors to
        """
        # Build adjacency list
        graph = {node_id: [] for node_id in workflow}

        for node_id, node_data in workflow.items():
            inputs = node_data.get("inputs", {})
            for input_value in inputs.values():
                if isinstance(input_value, list) and len(input_value) == 2:
                    ref_node_id = input_value[0]
                    if ref_node_id in workflow:
                        graph[ref_node_id].append(node_id)

        # Check for cycles using DFS
        visited = set()
        rec_stack = set()

        def has_cycle(node: str, path: list[str]) -> bool:
            visited.add(node)
            rec_stack.add(node)
            path.append(node)

            for neighbor in graph[node]:
                if neighbor not in visited:
                    if has_cycle(neighbor, path.copy()):
                        return True
                elif neighbor in rec_stack:
                    cycle_path = path[path.index(neighbor) :] + [neighbor]
                    errors.append(
                        f"Circular dependency detected: {' -> '.join(cycle_path)}"
                    )
                    return True

            rec_stack.remove(node)
            return False

        for node in graph:
            if node not in visited:
                has_cycle(node, [])

    def _validate_required_inputs(self, workflow: dict[str, Any], errors: list[str]):
        """Validate required inputs for known nodes.

        Args:
            workflow: Workflow dictionary
            errors: List to append errors to
        """
        for node_id, node_data in workflow.items():
            class_type = node_data.get("class_type", "")

            if class_type in self.REQUIRED_INPUTS:
                required = self.REQUIRED_INPUTS[class_type]
                inputs = node_data.get("inputs", {})

                for req_input in required:
                    if req_input not in inputs:
                        errors.append(
                            f"Node {node_id} ({class_type}): "
                            f"Missing required input '{req_input}'"
                        )

    def _check_output_nodes(self, workflow: dict[str, Any], warnings: list[str]):
        """Check for output nodes.

        Args:
            workflow: Workflow dictionary
            warnings: List to append warnings to
        """
        output_types = {"SaveImage", "PreviewImage"}
        has_output = False

        for node_data in workflow.values():
            if node_data.get("class_type", "") in output_types:
                has_output = True
                break

        if not has_output:
            warnings.append(
                "No output nodes found (SaveImage or PreviewImage). "
                "Workflow may not produce visible results."
            )

    def _check_custom_nodes(self, workflow: dict[str, Any], warnings: list[str]):
        """Check for custom nodes.

        Args:
            workflow: Workflow dictionary
            warnings: List to append warnings to
        """
        custom_nodes = set()

        for node_data in workflow.values():
            class_type = node_data.get("class_type", "")
            if class_type and class_type not in BUILTIN_NODES:
                custom_nodes.add(class_type)

        if custom_nodes:
            warnings.append(
                f"Workflow contains custom nodes: {', '.join(sorted(custom_nodes))}. "
                "Ensure these are installed."
            )

    def _check_disconnected_nodes(self, workflow: dict[str, Any], warnings: list[str]):
        """Check for disconnected/unused nodes.

        Args:
            workflow: Workflow dictionary
            warnings: List to append warnings to
        """
        # Find nodes that have outputs but aren't connected to anything
        nodes_with_outputs = set()
        referenced_nodes = set()

        for node_id, node_data in workflow.items():
            outputs = node_data.get("outputs", [])
            if outputs:
                nodes_with_outputs.add(node_id)

            inputs = node_data.get("inputs", {})
            for input_value in inputs.values():
                if isinstance(input_value, list) and len(input_value) == 2:
                    referenced_nodes.add(input_value[0])

        # Find nodes with outputs that aren't referenced
        unused_nodes = nodes_with_outputs - referenced_nodes

        # Exclude output nodes (they don't need to be referenced)
        output_types = {"SaveImage", "PreviewImage"}
        unused_nodes = {
            node_id
            for node_id in unused_nodes
            if workflow[node_id].get("class_type", "") not in output_types
        }

        if unused_nodes:
            warnings.append(
                f"Disconnected or unused nodes found: {', '.join(sorted(unused_nodes))}"
            )

    def _validate_model_paths(self, workflow: dict[str, Any], errors: list[str]):
        """Validate model file paths for security.

        Args:
            workflow: Workflow dictionary
            errors: List to append errors to
        """
        dangerous_patterns = ["../", "..\\", "/etc/", "C:\\", "\\\\"]

        for node_id, node_data in workflow.items():
            inputs = node_data.get("inputs", {})

            # Check model-related inputs
            for key in [
                "ckpt_name",
                "lora_name",
                "vae_name",
                "model_name",
                "control_net_name",
            ]:
                if key in inputs:
                    path = inputs[key]
                    if isinstance(path, str):
                        for pattern in dangerous_patterns:
                            if pattern in path:
                                errors.append(
                                    f"Node {node_id}: Invalid path in '{key}' "
                                    f"(security risk: contains '{pattern}')"
                                )
                                break

    def _calculate_complexity(self, workflow: dict[str, Any]) -> dict[str, Any]:
        """Calculate workflow complexity.

        Args:
            workflow: Workflow dictionary

        Returns:
            Complexity metrics
        """
        node_count = len(workflow)

        # Count connections
        connection_count = 0
        for node_data in workflow.values():
            inputs = node_data.get("inputs", {})
            for input_value in inputs.values():
                if isinstance(input_value, list) and len(input_value) == 2:
                    connection_count += 1

        # Count custom nodes
        custom_count = 0
        for node_data in workflow.values():
            class_type = node_data.get("class_type", "")
            if class_type and class_type not in BUILTIN_NODES:
                custom_count += 1

        # Calculate score
        score = node_count + (connection_count * 2) + (custom_count * 3)

        # Determine level
        if score < 20:
            level = "simple"
        elif score < 50:
            level = "moderate"
        else:
            level = "complex"

        return {
            "score": score,
            "level": level,
            "nodes": node_count,
            "connections": connection_count,
            "custom_nodes": custom_count,
        }
