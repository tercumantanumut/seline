"""
Fix for rgthree Reroute node - creates a Python implementation for the frontend-only node.
This file is injected into containers to provide backend support for rgthree reroute nodes.
"""

RGTHREE_REROUTE_PY = '''
"""Reroute node implementation for rgthree - provides backend support for frontend-only node."""

class RerouteRgthree:
    """Simple reroute node that passes through any input."""
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "*": ("*",),  # Accept any input type
            }
        }
    
    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("*",)
    FUNCTION = "reroute"
    CATEGORY = "rgthree"
    
    def reroute(self, **kwargs):
        """Pass through the first input unchanged."""
        # Get the first input value
        for key, value in kwargs.items():
            if key != "unique_id":
                return (value,)
        return (None,)


# Register the node
NODE_CLASS_MAPPINGS = {
    "Reroute (rgthree)": RerouteRgthree,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Reroute (rgthree)": "Reroute (rgthree)"
}
'''

def get_rgthree_reroute_fix_script():
    """Get the script content to fix rgthree reroute nodes."""
    return f'''
# Fix for rgthree Reroute node
cat > /app/ComfyUI/custom_nodes/rgthree_reroute_fix.py << 'EOF'
{RGTHREE_REROUTE_PY}
EOF
echo "Added rgthree Reroute node fix"
'''