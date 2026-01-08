"""Simple event bus to broadcast build/execution events over WebSockets."""

from typing import Any, Protocol


class _ManagerProto(Protocol):
    async def broadcast_to_room(
        self, room: str, message: dict[str, Any]
    ) -> Any:  # pragma: no cover - protocol only
        ...


_manager: _ManagerProto | None = None


def set_manager(manager: _ManagerProto) -> None:
    """Attach a WebSocket manager used to broadcast events to rooms."""
    global _manager
    _manager = manager


async def emit_build_event(
    build_id: str, message_type: str, data: dict[str, Any]
) -> None:
    """Emit a build-scoped event to clients subscribed to the build room."""
    if not _manager:
        return
    await _manager.broadcast_to_room(
        f"build:{build_id}", {"type": message_type, **data}
    )


async def emit_execution_event(
    execution_id: str, message_type: str, data: dict[str, Any]
) -> None:
    """Emit an execution-scoped event to clients subscribed to the execution room."""
    if not _manager:
        return
    await _manager.broadcast_to_room(
        f"execution:{execution_id}", {"type": message_type, **data}
    )
