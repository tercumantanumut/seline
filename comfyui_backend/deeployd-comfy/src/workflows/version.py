"""Version management for ComfyUI workflows."""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class WorkflowVersion:
    """Represents a version of a workflow."""

    workflow: dict[str, Any]
    version: str
    message: str = ""
    hash: str | None = None
    parent_hash: str | None = None
    timestamp: datetime | None = None
    tags: list[str] = field(default_factory=list)

    def __post_init__(self):
        """Initialize computed fields after dataclass init."""
        if self.hash is None:
            self.hash = self._generate_hash()
        if self.timestamp is None:
            self.timestamp = datetime.now()

    def _generate_hash(self) -> str:
        """Generate SHA-1 hash of workflow content.

        Returns:
            40-character hex hash string
        """
        # Create stable JSON representation
        workflow_json = json.dumps(self.workflow, sort_keys=True)
        return hashlib.sha256(workflow_json.encode()).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns:
            Dictionary with all version data
        """
        return {
            "workflow": self.workflow,
            "version": self.version,
            "message": self.message,
            "hash": self.hash,
            "parent_hash": self.parent_hash,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "tags": self.tags,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WorkflowVersion":
        """Create WorkflowVersion from dictionary.

        Args:
            data: Dictionary with version data

        Returns:
            WorkflowVersion instance
        """
        timestamp = None
        if data.get("timestamp"):
            timestamp = datetime.fromisoformat(data["timestamp"])

        return cls(
            workflow=data["workflow"],
            version=data["version"],
            message=data.get("message", ""),
            hash=data.get("hash"),
            parent_hash=data.get("parent_hash"),
            timestamp=timestamp,
            tags=data.get("tags", []),
        )


class VersionManager:
    """Manages workflow versions with git-like semantics."""

    def __init__(self):
        """Initialize version manager."""
        self.versions: list[WorkflowVersion] = []
        self.current_index: int = -1
        self.tags: dict[str, str] = {}  # tag -> hash mapping
        self.branches: dict[str, list[WorkflowVersion]] = {"main": []}
        self.current_branch: str = "main"

    def add_version(
        self, workflow: dict[str, Any], message: str, version: str | None = None
    ) -> WorkflowVersion:
        """Add a new version to the history.

        Args:
            workflow: Workflow dictionary
            message: Commit message
            version: Optional version string (auto-generated if None)

        Returns:
            Created WorkflowVersion
        """
        if version is None:
            version = self._generate_next_version()

        parent_hash = None
        if self.versions and self.current_index >= 0:
            parent_hash = self.versions[self.current_index].hash

        new_version = WorkflowVersion(
            workflow=workflow, version=version, message=message, parent_hash=parent_hash
        )

        self.versions.append(new_version)
        self.current_index = len(self.versions) - 1

        # Add to current branch
        self.branches[self.current_branch].append(new_version)

        return new_version

    def _generate_next_version(self) -> str:
        """Generate next version number.

        Returns:
            Version string (semantic versioning)
        """
        if not self.versions:
            return "1.0.0"

        last_version = self.versions[-1].version

        # Parse semantic version
        try:
            parts = last_version.split(".")
            if len(parts) == 3:
                major, minor, patch = parts
                # Increment patch version by default
                return f"{major}.{minor}.{int(patch) + 1}"
        except (ValueError, IndexError):
            pass

        # Fallback to simple increment
        return f"1.0.{len(self.versions)}"

    def get_version(self, identifier: str) -> WorkflowVersion | None:
        """Get version by hash, version string, or tag.

        Args:
            identifier: Hash, version string, or tag

        Returns:
            WorkflowVersion if found, None otherwise
        """
        # Check if it's a tag
        if identifier in self.tags:
            identifier = self.tags[identifier]

        # Search by hash or version string
        for version in self.versions:
            if version.hash == identifier or version.version == identifier:
                return version

        return None

    def get_latest(self) -> WorkflowVersion | None:
        """Get the latest version.

        Returns:
            Latest WorkflowVersion or None if no versions
        """
        if self.versions:
            return self.versions[-1]
        return None

    def get_current(self) -> WorkflowVersion | None:
        """Get the current checked-out version.

        Returns:
            Current WorkflowVersion or None
        """
        if 0 <= self.current_index < len(self.versions):
            return self.versions[self.current_index]
        return None

    def list_versions(self) -> list[WorkflowVersion]:
        """List all versions.

        Returns:
            List of all versions
        """
        return self.versions.copy()

    def get_history(self) -> list[WorkflowVersion]:
        """Get version history in reverse chronological order.

        Returns:
            List of versions from newest to oldest
        """
        return list(reversed(self.versions))

    def get_diff(self, hash1: str, hash2: str) -> dict[str, Any]:
        """Get differences between two versions.

        Args:
            hash1: First version hash
            hash2: Second version hash

        Returns:
            Dictionary describing differences
        """
        v1 = self.get_version(hash1)
        v2 = self.get_version(hash2)

        if not v1 or not v2:
            return {"error": "Version not found"}

        diff = {
            "added": {},
            "removed": {},
            "modified": {},
        }

        w1_keys = set(v1.workflow.keys())
        w2_keys = set(v2.workflow.keys())

        # Added nodes
        for key in w2_keys - w1_keys:
            diff["added"][key] = v2.workflow[key]

        # Removed nodes
        for key in w1_keys - w2_keys:
            diff["removed"][key] = v1.workflow[key]

        # Modified nodes
        for key in w1_keys & w2_keys:
            if v1.workflow[key] != v2.workflow[key]:
                diff["modified"][key] = {
                    "old": v1.workflow[key],
                    "new": v2.workflow[key],
                }

        return diff

    def checkout(self, identifier: str) -> bool:
        """Checkout a specific version.

        Args:
            identifier: Version hash, version string, or tag

        Returns:
            True if successful
        """
        version = self.get_version(identifier)
        if version:
            try:
                self.current_index = self.versions.index(version)
                return True
            except ValueError:
                pass
        return False

    def rollback(self) -> WorkflowVersion | None:
        """Rollback to previous version.

        Returns:
            Previous version or None if at beginning
        """
        if self.current_index > 0:
            self.current_index -= 1
            return self.versions[self.current_index]
        return None

    def tag_version(self, hash: str, tag: str):
        """Tag a specific version.

        Args:
            hash: Version hash
            tag: Tag name
        """
        if self.get_version(hash):
            self.tags[tag] = hash

    def create_branch(self, branch_name: str):
        """Create a new branch from current version.

        Args:
            branch_name: Name of the new branch
        """
        if branch_name not in self.branches:
            current = self.get_current()
            if current:
                self.branches[branch_name] = [current]
            else:
                self.branches[branch_name] = []
            self.current_branch = branch_name

    def checkout_branch(self, branch_name: str) -> bool:
        """Switch to a different branch.

        Args:
            branch_name: Name of the branch

        Returns:
            True if successful
        """
        if branch_name in self.branches:
            self.current_branch = branch_name
            branch_versions = self.branches[branch_name]
            if branch_versions:
                last_version = branch_versions[-1]
                return self.checkout(last_version.hash)
            return True
        return False

    def export_to_file(self, filepath: str):
        """Export version history to file.

        Args:
            filepath: Path to export file
        """
        data = {
            "versions": [v.to_dict() for v in self.versions],
            "tags": self.tags,
            "current_index": self.current_index,
            "branches": {
                name: [v.hash for v in versions]
                for name, versions in self.branches.items()
            },
            "current_branch": self.current_branch,
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)

    def import_from_file(self, filepath: str):
        """Import version history from file.

        Args:
            filepath: Path to import file
        """
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)

        self.versions = [WorkflowVersion.from_dict(v) for v in data["versions"]]
        self.tags = data.get("tags", {})
        self.current_index = data.get("current_index", -1)
        self.current_branch = data.get("current_branch", "main")

        # Rebuild branches
        self.branches = {"main": []}
        branch_data = data.get("branches", {})
        for branch_name, version_hashes in branch_data.items():
            self.branches[branch_name] = [
                v for v in self.versions if v.hash in version_hashes
            ]
