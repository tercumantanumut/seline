"""Converter for ComfyUI workflow formats (UI to API and vice versa)."""

import logging
from typing import Any, TypedDict

logger = logging.getLogger(__name__)


class WorkflowConverter:
    """Convert between ComfyUI workflow formats (UI and API)."""

    # Known widget mappings for common nodes
    WIDGET_MAPPINGS = {
        "KSampler": [
            "seed",
            "control_after_generate",
            "steps",
            "cfg",
            "sampler_name",
            "scheduler",
            "denoise",
        ],
        "KSamplerAdvanced": [
            "add_noise",
            "noise_seed",
            "control_after_generate",
            "steps",
            "end_at_step",
            "sampler_name",
            "scheduler",
            "start_at_step",
            "return_with_leftover_noise",
        ],
        "CheckpointLoaderSimple": ["ckpt_name"],
        "CheckpointLoader": ["config_name", "ckpt_name"],
        "CLIPTextEncode": ["text"],
        "VAEDecode": [],
        "VAEEncode": [],
        "VAELoader": ["vae_name"],
        "LoraLoader": ["lora_name", "strength_model", "strength_clip"],
        "LoraLoaderModelOnly": ["lora_name", "strength_model"],
        "CLIPLoader": ["clip_name", "type", "device"],
        "UNETLoader": ["unet_name", "weight_dtype"],
        "EmptyLatentImage": ["width", "height", "batch_size"],
        "SaveImage": ["filename_prefix"],
        "PreviewImage": [],
        "LoadImage": ["image", "upload"],
        "ImageScale": ["upscale_method", "width", "height", "crop"],
        "LatentUpscale": ["upscale_method", "width", "height", "crop"],
        "ModelSamplingSD3": ["shift"],
        "ModelSamplingFlux": ["max_shift", "base_shift", "width", "height"],
        "ConditioningCombine": [],
        "ConditioningSetArea": ["width", "height", "x", "y", "strength"],
        "ConditioningSetMask": ["strength", "set_cond_area"],
        "CLIPSetLastLayer": ["stop_at_clip_layer"],
        "easy seed": ["seed", "control_after_generate", "control_before_generate"],
        "ShowText|pysssss": ["text"],
        "TextInput_": ["text"],
        "MagCache": ["cache_mode", "alpha", "beta", "h_w", "start_step", "end_step"],
        "Reroute": [],
    }

    def detect_format(self, workflow: dict[str, Any]) -> str:
        """Detect the format of the workflow (UI or API).

        Args:
            workflow: The workflow dictionary to analyze

        Returns:
            'ui' for UI format, 'api' for API format
        """
        # UI format has 'nodes' and 'links' arrays
        if "nodes" in workflow and isinstance(workflow["nodes"], list):
            return "ui"

        # UI format might also have these keys
        if any(
            key in workflow
            for key in ["last_node_id", "last_link_id", "groups", "config", "extra"]
        ):
            return "ui"

        # API format has node IDs as keys with node data as values
        # Check if all top-level values are dicts with 'class_type'
        if workflow and all(
            isinstance(v, dict) and "class_type" in v
            for k, v in workflow.items()
            if not k.startswith("_")
        ):
            return "api"

        # Default to API if unclear
        return "api"

    def convert(self, workflow: dict[str, Any]) -> dict[str, Any]:
        """Convert workflow to API format if needed.

        Args:
            workflow: The workflow to convert

        Returns:
            Workflow in API format
        """
        format_type = self.detect_format(workflow)

        if format_type == "ui":
            return self.ui_to_api(workflow)
        else:
            # Already in API format
            return workflow

    def ui_to_api(self, ui_workflow: dict[str, Any]) -> dict[str, Any]:
        """Convert UI format workflow to API format.

        Args:
            ui_workflow: Workflow in UI format

        Returns:
            Workflow in API format
        """
        api_workflow: dict[str, Any] = {}

        # Handle empty workflow
        if "nodes" not in ui_workflow or not ui_workflow["nodes"]:
            return api_workflow

        # Build link mapping first
        link_map = self._build_link_map(ui_workflow.get("links", []))

        # Build quick node lookup
        node_map: dict[int, dict[str, Any]] = {}
        for node in ui_workflow.get("nodes", []) or []:
            if isinstance(node, dict) and isinstance(node.get("id"), int):
                node_map[int(node["id"])] = node

        # Detect simple pass-through nodes like Reroute/GetNode (including vendor variants)
        # and precompute their upstream source
        # In UI format, Reroute has a single input and a single output, but ComfyUI server
        # has no executable "Reroute" class; prompts containing it will fail.
        # We flatten Reroute by reconnecting its consumers to the Reroute's upstream source.
        passthrough_upstream: dict[int, tuple[int, int]] = {}

        def _is_ui_passthrough(node_type: str) -> bool:
            t = (node_type or "").strip().lower()
            # Handle names like "Reroute", "Reroute (rgthree)", "GetNode", "Get Node" etc.
            return (
                t.startswith("reroute")
                or t.startswith("getnode")
                or t.startswith("get node")
            )

        try:
            for node in ui_workflow.get("nodes", []) or []:
                if not isinstance(node, dict):
                    continue
                if not _is_ui_passthrough(str(node.get("type"))):
                    continue
                nid = node.get("id")
                if not isinstance(nid, int):
                    # Only standard numeric ids are expected
                    continue
                # Find the first linked input
                for input_config in node.get("inputs", []) or []:
                    if isinstance(input_config, dict):
                        link_id = input_config.get("link")
                        if link_id is not None and link_id in link_map:
                            passthrough_upstream[nid] = link_map[link_id]
                            break
        except Exception:
            # Non-fatal; if anything goes wrong we just won't flatten
            pass

        # Extract literal values from TextInput_-style nodes to inline later
        textinput_values: dict[int, Any] = {}
        try:
            for node in ui_workflow.get("nodes", []) or []:
                if not isinstance(node, dict):
                    continue
                if str(node.get("type")) != "TextInput_":
                    continue
                nid = node.get("id")
                if not isinstance(nid, int):
                    continue
                values = node.get("widgets_values") or []
                if isinstance(values, list) and values:
                    textinput_values[nid] = values[0]
        except Exception:
            pass

        # Convert each node
        for node in ui_workflow["nodes"]:
            node_id = str(node.get("id", ""))
            if not node_id:
                continue

            # Extract class type
            class_type = node.get("type", "")
            if not class_type:
                logger.warning(f"Node {node_id} has no type field")
                continue

            # Skip UI-only helpers like Reroute/GetNode variants or TextInput_ in the API prompt
            if _is_ui_passthrough(class_type) or class_type in (
                "TextInput_",
                "ShowText|pysssss",
            ):
                continue

            # Build API node
            api_node = {"class_type": class_type, "inputs": {}}

            # Process inputs (connections)
            if "inputs" in node and node["inputs"]:
                for input_config in node["inputs"]:
                    if isinstance(input_config, dict):
                        input_name = input_config.get("name", "")
                        link_id = input_config.get("link")

                        if link_id is not None and link_id in link_map:
                            # This input is connected to another node
                            source_node, source_slot = link_map[link_id]
                            # Flatten chains of passthrough nodes if present
                            visited: set[int] = set()
                            while (
                                isinstance(source_node, int)
                                and source_node in passthrough_upstream
                                and source_node not in visited
                            ):
                                visited.add(source_node)
                                upstream = passthrough_upstream.get(source_node)
                                if upstream is None:
                                    break
                                source_node, source_slot = upstream

                            # If source is a TextInput_ node, inline its literal value
                            if isinstance(source_node, int):
                                src_node_obj = node_map.get(source_node)
                                if (
                                    src_node_obj is not None
                                    and str(src_node_obj.get("type")) == "TextInput_"
                                    and source_node in textinput_values
                                ):
                                    # Inline literal (fallback to widget value lookup)
                                    api_node["inputs"][input_name] = textinput_values[
                                        source_node
                                    ]
                                    continue

                            # Default: keep as a connection
                            api_node["inputs"][input_name] = [
                                str(source_node),
                                source_slot,
                            ]
                        elif "widget" in input_config:
                            # This input is controlled by a widget
                            # The value will be set from widgets_values
                            pass

            # Process widget values
            if "widgets_values" in node and node["widgets_values"]:
                self._map_widget_values(api_node, class_type, node["widgets_values"])

            # Add node to API workflow
            api_workflow[node_id] = api_node

        # Add any metadata if needed
        if "_meta" in ui_workflow:
            api_workflow["_meta"] = ui_workflow["_meta"]

        return api_workflow

    def _build_link_map(self, links: list) -> dict[int, tuple[int, int]]:
        """Build a mapping of link IDs to source node and output slot.

        Args:
            links: List of link definitions from UI format

        Returns:
            Dictionary mapping link_id to (source_node_id, source_output_slot)
        """
        link_map = {}

        for link in links:
            if isinstance(link, list) and len(link) >= 5:
                # Link format: [link_id, source_node_id, source_output_slot, target_node_id, target_input_slot, ...]
                link_id = link[0]
                source_node = link[1]
                source_slot = link[2]
                link_map[link_id] = (source_node, source_slot)

        return link_map

    def _map_widget_values(
        self, api_node: dict[str, Any], class_type: str, widget_values: list[Any]
    ) -> None:
        """Map widget values to input fields based on node type.

        Args:
            api_node: The API format node being built
            class_type: The type of the node
            widget_values: List of widget values from UI format
        """
        # Get known widget names for this node type
        widget_names = self.WIDGET_MAPPINGS.get(class_type, [])

        # Map values to names
        for i, value in enumerate(widget_values):
            if i < len(widget_names):
                widget_name = widget_names[i]
                # Skip None values and "randomize" strings for seed fields
                if value is not None and value != "randomize":
                    api_node["inputs"][widget_name] = value
            else:
                # For unknown widgets, try to infer or use generic names
                if class_type == "KSamplerAdvanced":
                    # KSamplerAdvanced has a specific order
                    if i == 0:  # add_noise
                        api_node["inputs"]["add_noise"] = value
                    elif i == 1:  # noise_seed
                        if value != "randomize":
                            api_node["inputs"]["noise_seed"] = value
                    elif i == 2:  # control_after_generate
                        api_node["inputs"]["control_after_generate"] = value
                    elif i == 3:  # steps
                        api_node["inputs"]["steps"] = value
                    elif i == 4:  # end_at_step
                        api_node["inputs"]["end_at_step"] = value
                    elif i == 5:  # sampler_name
                        api_node["inputs"]["sampler_name"] = value
                    elif i == 6:  # scheduler
                        api_node["inputs"]["scheduler"] = value
                    elif i == 7:  # start_at_step
                        api_node["inputs"]["start_at_step"] = value
                    elif i == 8:  # return_with_leftover_noise
                        api_node["inputs"]["return_with_leftover_noise"] = value
                elif value is not None:
                    # Store as generic widget value if we don't know the mapping
                    logger.debug(
                        f"Unknown widget {i} for node type {class_type}: {value}"
                    )

    def api_to_ui(self, api_workflow: dict[str, Any]) -> dict[str, Any]:
        """Convert API format workflow to UI format.

        Args:
            api_workflow: Workflow in API format

        Returns:
            Workflow in UI format
        """
        # This is a more complex operation that requires layout information.
        # Provide precise typing so mypy knows the shapes of values in the UI workflow.

        class UINode(TypedDict):
            id: int | str
            type: str
            pos: list[int]
            size: list[int]
            flags: dict[str, Any]
            order: int
            mode: int
            inputs: list[Any]
            outputs: list[Any]
            properties: dict[str, Any]
            widgets_values: list[Any]

        class UIWorkflow(TypedDict):
            last_node_id: int
            last_link_id: int
            nodes: list[UINode]
            links: list[list[Any]]
            groups: list[Any]
            config: dict[str, Any]
            extra: dict[str, Any]
            version: float

        ui_workflow: UIWorkflow = {
            "last_node_id": 0,
            "last_link_id": 0,
            "nodes": [],
            "links": [],
            "groups": [],
            "config": {},
            "extra": {},
            "version": 0.4,
        }

        node_positions = {}
        current_x = 0
        current_y = 0
        link_id_counter = 1

        # First pass: create nodes
        for node_id, node_data in api_workflow.items():
            if node_id.startswith("_"):
                continue

            # Calculate position (simple grid layout)
            pos_x = current_x
            pos_y = current_y
            current_x += 300
            if current_x > 1200:
                current_x = 0
                current_y += 200

            ui_node: UINode = {
                "id": int(node_id) if node_id.isdigit() else node_id,
                "type": node_data.get("class_type", "Unknown"),
                "pos": [pos_x, pos_y],
                "size": [270, 100],  # Default size
                "flags": {},
                "order": 0,  # Will be calculated later
                "mode": 0,
                "inputs": [],
                "outputs": [],
                "properties": {},
                "widgets_values": [],
            }

            # Extract widget values
            class_type = node_data.get("class_type", "")
            widget_names = self.WIDGET_MAPPINGS.get(class_type, [])
            for widget_name in widget_names:
                if widget_name in node_data.get("inputs", {}):
                    ui_node["widgets_values"].append(node_data["inputs"][widget_name])

            ui_workflow["nodes"].append(ui_node)
            node_positions[node_id] = len(ui_workflow["nodes"]) - 1

            # Update last_node_id
            try:
                numeric_id = int(node_id)
                if numeric_id > ui_workflow["last_node_id"]:
                    ui_workflow["last_node_id"] = numeric_id
            except ValueError:
                pass

        # Second pass: create links
        for node_id, node_data in api_workflow.items():
            if node_id.startswith("_"):
                continue

            target_node_idx = node_positions.get(node_id)
            if target_node_idx is None:
                continue

            for _input_name, input_value in node_data.get("inputs", {}).items():
                if isinstance(input_value, list) and len(input_value) == 2:
                    # This is a connection
                    source_node_id = str(input_value[0])
                    source_slot = input_value[1]

                    if source_node_id in node_positions:
                        # Create link
                        link = [
                            link_id_counter,  # link_id
                            int(source_node_id)
                            if source_node_id.isdigit()
                            else source_node_id,  # source_node
                            source_slot,  # source_slot
                            int(node_id)
                            if node_id.isdigit()
                            else node_id,  # target_node
                            0,  # target_slot (would need more info to determine)
                        ]
                        ui_workflow["links"].append(link)
                        link_id_counter += 1

        ui_workflow["last_link_id"] = link_id_counter - 1

        # Return as a plain dict[str, Any] to satisfy callers and mypy
        return dict(ui_workflow)
