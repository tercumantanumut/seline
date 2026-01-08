"""Python version compatibility checker."""

import sys

MINIMUM_PYTHON_VERSION = (3, 10)
RECOMMENDED_PYTHON_VERSION = (3, 12)


def check_python_version(
    minimum: tuple[int, int] = MINIMUM_PYTHON_VERSION,
    recommended: tuple[int, int] = RECOMMENDED_PYTHON_VERSION,
) -> None:
    """Check if Python version meets requirements.

    Args:
        minimum: Minimum required Python version (major, minor)
        recommended: Recommended Python version (major, minor)

    Raises:
        RuntimeError: If Python version is below minimum
    """
    current = sys.version_info[:2]

    if current < minimum:
        raise RuntimeError(
            f"Python {minimum[0]}.{minimum[1]} or higher is required, "
            f"but you are using Python {current[0]}.{current[1]}"
        )

    if current < recommended:
        print(
            f"Warning: Python {recommended[0]}.{recommended[1]} is recommended, "
            f"but you are using Python {current[0]}.{current[1]}"
        )


def get_python_version() -> str:
    """Get current Python version as a string.

    Returns:
        Python version string
    """
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
