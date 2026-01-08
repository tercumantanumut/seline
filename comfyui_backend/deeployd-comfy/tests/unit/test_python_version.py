"""Test Python version compatibility."""

import sys

import pytest


def test_python_version_minimum():
    """Test that Python version meets minimum requirements."""
    assert sys.version_info >= (
        3,
        10,
    ), f"Python 3.10 or higher is required, but got {sys.version}"


def test_python_version_recommended():
    """Test if using recommended Python version."""
    recommended = (3, 12)
    if sys.version_info[:2] < recommended:
        pytest.skip(
            f"Recommended Python {recommended[0]}.{recommended[1]}, "
            f"but using {sys.version_info.major}.{sys.version_info.minor}"
        )
    assert sys.version_info[:2] >= recommended
