"""Workflow preprocessor to handle frontend-only nodes and rerouting issues."""

import copy
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


class WorkflowPreprocessor:
    """Preprocesses workflows to handle frontend-only nodes and routing issues."""
    
    # Frontend-only nodes that need to be handled
    FRONTEND_ONLY_NODES = {
        "Reroute (rgthree)",
        "Bookmark (rgthree)",
        "Label (rgthree)",
        "Note",
        "Note (rgthree)",
        "GetNode",
        "SetNode",
        "GetNode (rgthree)",
        "SetNode (rgthree)",
    }
    
    # Nodes that are pure routing (can be bypassed)
    REROUTE_NODES = {
        "Reroute",
        "Reroute (rgthree)",
    }
    
    def __init__(self):
        """Initialize the preprocessor."""
        self.removed_nodes: Set[str] = set()
        self.connection_map: Dict[str, List[Tuple[str, int]]] = {}
        
    def preprocess(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """Preprocess a workflow to handle problematic nodes.
        
        Args:
            workflow: The workflow dictionary (can be UI or API format)
            
        Returns:
            Preprocessed workflow with problematic nodes handled
        """
        # Deep copy to avoid modifying original
        workflow = copy.deepcopy(workflow)
        
        # Detect format
        if "nodes" in workflow and isinstance(workflow.get("nodes"), list):
            # UI format - convert to API format first
            from src.workflows.converter import WorkflowConverter
            converter = WorkflowConverter()
            workflow = converter.convert(workflow)
        
        # Process API format workflow
        return self._preprocess_api_workflow(workflow)
    
    def _preprocess_api_workflow(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """Preprocess API format workflow.
        
        Args:
            workflow: API format workflow
            
        Returns:
            Preprocessed workflow
        """
        # Build connection map
        self._build_connection_map(workflow)
        
        # Find and handle problematic nodes
        nodes_to_remove = set()
        nodes_to_bypass = set()
        get_set_nodes = {}
        
        for node_id, node_data in list(workflow.items()):
            if not isinstance(node_data, dict):
                continue
                
            class_type = node_data.get("class_type", "")
            
            # Check if it's a frontend-only node
            if class_type in self.FRONTEND_ONLY_NODES:
                if class_type in self.REROUTE_NODES:
                    # Reroute nodes can be bypassed
                    nodes_to_bypass.add(node_id)
                elif class_type in ["GetNode", "GetNode (rgthree)"]:
                    # GetNode nodes need special handling
                    get_set_nodes[node_id] = ("get", node_data)
                elif class_type in ["SetNode", "SetNode (rgthree)"]:
                    # SetNode nodes need special handling
                    get_set_nodes[node_id] = ("set", node_data)
                else:
                    # Other frontend-only nodes should be removed
                    nodes_to_remove.add(node_id)
                    logger.warning(f"Removing frontend-only node: {node_id} ({class_type})")
        
        # Handle GetNode/SetNode pairs
        for node_id, (node_type, node_data) in get_set_nodes.items():
            if node_type == "get":
                self._handle_get_node(workflow, node_id, node_data)
            else:
                self._handle_set_node(workflow, node_id, node_data)
        
        # Bypass reroute nodes
        for node_id in nodes_to_bypass:
            self._bypass_node(workflow, node_id)
        
        # Remove nodes that can't be bypassed
        for node_id in nodes_to_remove:
            self._remove_node(workflow, node_id)
        
        # Clean up the workflow
        self._cleanup_workflow(workflow)
        
        return workflow
    
    def _build_connection_map(self, workflow: Dict[str, Any]) -> None:
        """Build a map of connections in the workflow.
        
        Args:
            workflow: The workflow dictionary
        """
        self.connection_map.clear()
        
        for node_id, node_data in workflow.items():
            if not isinstance(node_data, dict):
                continue
                
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
                
            for input_name, input_value in inputs.items():
                if isinstance(input_value, list) and len(input_value) == 2:
                    # This is a connection [source_node_id, source_output_index]
                    source_node_id = str(input_value[0])
                    source_output = input_value[1]
                    
                    if source_node_id not in self.connection_map:
                        self.connection_map[source_node_id] = []
                    
                    self.connection_map[source_node_id].append((node_id, input_name))
    
    def _bypass_node(self, workflow: Dict[str, Any], node_id: str) -> None:
        """Bypass a node by connecting its inputs directly to its outputs.
        
        Args:
            workflow: The workflow dictionary
            node_id: ID of the node to bypass
        """
        if node_id not in workflow:
            return
            
        node_data = workflow[node_id]
        if not isinstance(node_data, dict):
            return
            
        # For reroute nodes, they typically have one input and pass it through
        inputs = node_data.get("inputs", {})
        
        # Find the input connection
        input_connection = None
        for input_name, input_value in inputs.items():
            if isinstance(input_value, list) and len(input_value) == 2:
                input_connection = input_value
                break
        
        if not input_connection:
            # No input connection, just remove the node
            del workflow[node_id]
            return
        
        # Find all nodes that connect to this node
        if node_id in self.connection_map:
            for target_node_id, target_input in self.connection_map[node_id]:
                if target_node_id in workflow:
                    # Redirect the connection to bypass this node
                    if "inputs" in workflow[target_node_id]:
                        workflow[target_node_id]["inputs"][target_input] = input_connection
        
        # Remove the bypassed node
        del workflow[node_id]
        logger.info(f"Bypassed reroute node: {node_id}")
    
    def _handle_get_node(self, workflow: Dict[str, Any], node_id: str, node_data: Dict[str, Any]) -> None:
        """Handle GetNode by removing it and updating connections.
        
        GetNode typically references another node's output.
        We'll remove it since it's frontend-only.
        
        Args:
            workflow: The workflow dictionary
            node_id: ID of the GetNode
            node_data: Data of the GetNode
        """
        # For now, just remove it like other problematic nodes
        # In the future, we could try to resolve the reference
        logger.warning(f"Removing GetNode: {node_id}")
        self._remove_node(workflow, node_id)
    
    def _handle_set_node(self, workflow: Dict[str, Any], node_id: str, node_data: Dict[str, Any]) -> None:
        """Handle SetNode by removing it and updating connections.
        
        SetNode typically stores a value that GetNode retrieves.
        We'll remove it since it's frontend-only.
        
        Args:
            workflow: The workflow dictionary
            node_id: ID of the SetNode
            node_data: Data of the SetNode
        """
        # For now, just remove it like other problematic nodes
        logger.warning(f"Removing SetNode: {node_id}")
        self._remove_node(workflow, node_id)
    
    def _remove_node(self, workflow: Dict[str, Any], node_id: str) -> None:
        """Remove a node and clean up connections.
        
        Args:
            workflow: The workflow dictionary
            node_id: ID of the node to remove
        """
        if node_id not in workflow:
            return
            
        # Find all nodes that connect to this node and remove those connections
        if node_id in self.connection_map:
            for target_node_id, target_input in self.connection_map[node_id]:
                if target_node_id in workflow and "inputs" in workflow[target_node_id]:
                    # Set to a default value or remove the input
                    inputs = workflow[target_node_id]["inputs"]
                    if target_input in inputs:
                        # Try to set a reasonable default
                        del inputs[target_input]
        
        # Remove the node
        del workflow[node_id]
        self.removed_nodes.add(node_id)
    
    def _cleanup_workflow(self, workflow: Dict[str, Any]) -> None:
        """Clean up the workflow after preprocessing.
        
        Args:
            workflow: The workflow dictionary
        """
        # Remove any broken connections
        for node_id, node_data in list(workflow.items()):
            if not isinstance(node_data, dict):
                continue
                
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
                
            for input_name, input_value in list(inputs.items()):
                if isinstance(input_value, list) and len(input_value) == 2:
                    source_node_id = str(input_value[0])
                    # Check if the source node still exists
                    if source_node_id not in workflow:
                        # Remove the broken connection
                        logger.warning(
                            f"Removing broken connection from {source_node_id} to {node_id}.{input_name}"
                        )
                        del inputs[input_name]
    
    def get_removed_nodes(self) -> Set[str]:
        """Get the set of nodes that were removed.
        
        Returns:
            Set of removed node IDs
        """
        return self.removed_nodes.copy()


def preprocess_workflow(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """Convenience function to preprocess a workflow.
    
    Args:
        workflow: The workflow to preprocess
        
    Returns:
        Preprocessed workflow
    """
    preprocessor = WorkflowPreprocessor()
    return preprocessor.preprocess(workflow)