"""Smoke tests to verify basic project setup."""

import importlib.util
import sys
from pathlib import Path

import pytest

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_project_structure_exists():
    """Test that the expected project structure exists."""
    root = Path(__file__).parent.parent

    # Check main directories
    assert (root / "src").exists()
    assert (root / "tests").exists()
    assert (root / "docs").exists()
    assert (root / "frontend").exists()
    assert (root / "config").exists()
    assert (root / "scripts").exists()

    # Check src subdirectories
    assert (root / "src" / "workflows").exists()
    assert (root / "src" / "containers").exists()
    assert (root / "src" / "models").exists()
    assert (root / "src" / "api").exists()
    assert (root / "src" / "utils").exists()
    assert (root / "src" / "db").exists()

    # Check test subdirectories
    assert (root / "tests" / "unit").exists()
    assert (root / "tests" / "integration").exists()
    assert (root / "tests" / "e2e").exists()


def test_configuration_files_exist():
    """Test that configuration files are present."""
    root = Path(__file__).parent.parent

    assert (root / ".gitignore").exists()
    assert (root / "pyproject.toml").exists()
    assert (root / "pytest.ini").exists()
    assert (root / "requirements.in").exists()
    assert (root / "requirements-dev.in").exists()


def test_python_packages_importable():
    """Test that Python packages can be imported."""
    packages = [
        "src",
        "src.workflows",
        "src.containers",
        "src.models",
        "src.api",
        "src.utils",
        "src.db",
    ]

    for package in packages:
        try:
            spec = importlib.util.find_spec(package)
            assert spec is not None, f"Package {package} not found"
        except ModuleNotFoundError:
            pytest.fail(f"Failed to find package: {package}")


def test_version_check_module():
    """Test the version check module functionality."""
    from src.utils.version_check import check_python_version, get_python_version

    # Test get_python_version returns a valid string
    version_str = get_python_version()
    assert isinstance(version_str, str)
    assert "." in version_str
    parts = version_str.split(".")
    assert len(parts) == 3
    assert all(p.isdigit() for p in parts)

    # Test check_python_version with current version (should pass)
    try:
        check_python_version(minimum=(3, 8))  # Set lower minimum to ensure pass
    except RuntimeError:
        pytest.fail("check_python_version raised RuntimeError unexpectedly")

    # Test check_python_version with future version (should fail)
    with pytest.raises(RuntimeError, match="Python .* or higher is required"):
        check_python_version(minimum=(3, 99))


def test_docker_availability():
    """Test that Docker is available and accessible."""
    import docker

    try:
        client = docker.from_env()
        # Try to ping the Docker daemon
        client.ping()
        # Get Docker version
        version = client.version()
        assert "Version" in version
        assert "ApiVersion" in version
    except docker.errors.DockerException as e:
        pytest.skip(f"Docker not available: {e}")
    finally:
        if "client" in locals():
            client.close()


@pytest.mark.unit
def test_basic_imports():
    """Test that we can import basic Python modules."""
    modules_to_test = ["json", "os", "sys", "pathlib", "typing", "asyncio", "unittest"]

    for module_name in modules_to_test:
        try:
            module = importlib.import_module(module_name)
            assert module is not None
        except ImportError:
            pytest.fail(f"Failed to import standard library module: {module_name}")


@pytest.mark.unit
def test_dev_track_file_exists():
    """Test that the development tracking file exists."""
    root = Path(__file__).parent.parent
    dev_track = root / "dev_track.md"

    assert dev_track.exists(), "dev_track.md file not found"

    # Check that it has content
    content = dev_track.read_text()
    assert len(content) > 100, "dev_track.md appears to be empty or too short"
    assert "Phase 1" in content, "dev_track.md missing Phase 1"
    assert "TDD" in content or "Test" in content, "dev_track.md missing test references"


@pytest.mark.unit
def test_virtual_environment():
    """Test that we're running in a virtual environment."""
    # Check if we're in a virtual environment
    assert hasattr(sys, "real_prefix") or (
        hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix
    ), "Not running in a virtual environment"

    # Check that the venv directory exists
    root = Path(__file__).parent.parent
    venv_path = root / "venv"
    assert venv_path.exists(), "Virtual environment directory not found"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
