"""WebSocket connection manager for real-time updates."""

import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from fastapi import WebSocketDisconnect

logger = logging.getLogger(__name__)


@dataclass
class ConnectionInfo:
    """Information about a WebSocket connection."""

    websocket: Any
    prompt_id: str | None = None
    connected_at: datetime = field(default_factory=datetime.now)
    last_ping: datetime = field(default_factory=datetime.now)
    client_id: str = ""
    room: str | None = None


class WebSocketManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self, max_connections: int = 100):
        """Initialize WebSocket manager.

        Args:
            max_connections: Maximum number of concurrent connections
        """
        self.max_connections = max_connections
        self.active_connections: dict[str, ConnectionInfo] = {}
        self.rooms: dict[str, set[str]] = defaultdict(set)
        self.prompt_connections: dict[str, set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._heartbeat_task: asyncio.Task | None = None

    async def connect(
        self,
        websocket: Any,
        client_id: str,
        prompt_id: str | None = None,
        room: str | None = None,
    ) -> bool:
        """Accept a new WebSocket connection.

        Args:
            websocket: WebSocket connection
            client_id: Unique client identifier
            prompt_id: Optional prompt ID to monitor
            room: Optional room name for broadcasting

        Returns:
            True if connection accepted, False if rejected
        """
        async with self._lock:
            # Check connection limit
            if len(self.active_connections) >= self.max_connections:
                logger.warning(
                    f"Connection rejected for {client_id}: max connections reached"
                )
                await websocket.close(code=1008, reason="Max connections reached")
                return False

            # Accept connection
            await websocket.accept()

            # Store connection info
            conn_info = ConnectionInfo(
                websocket=websocket, prompt_id=prompt_id, client_id=client_id, room=room
            )
            self.active_connections[client_id] = conn_info

            # Add to room if specified
            if room:
                self.rooms[room].add(client_id)

            # Track prompt connection
            if prompt_id:
                self.prompt_connections[prompt_id].add(client_id)

            logger.info(
                f"WebSocket connected: {client_id} (room: {room}, prompt: {prompt_id})"
            )

            # Start heartbeat if not running
            if not self._heartbeat_task or self._heartbeat_task.done():
                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

            return True

    async def disconnect(self, client_id: str) -> None:
        """Disconnect a WebSocket connection.

        Args:
            client_id: Client identifier to disconnect
        """
        async with self._lock:
            if client_id not in self.active_connections:
                return

            conn_info = self.active_connections[client_id]

            # Remove from room
            if conn_info.room:
                self.rooms[conn_info.room].discard(client_id)
                if not self.rooms[conn_info.room]:
                    del self.rooms[conn_info.room]

            # Remove from prompt tracking
            if conn_info.prompt_id:
                self.prompt_connections[conn_info.prompt_id].discard(client_id)
                if not self.prompt_connections[conn_info.prompt_id]:
                    del self.prompt_connections[conn_info.prompt_id]

            # Close connection
            try:
                await conn_info.websocket.close()
            except Exception as e:
                logger.error(f"Error closing WebSocket for {client_id}: {e}")

            # Remove from active connections
            del self.active_connections[client_id]

            logger.info(f"WebSocket disconnected: {client_id}")

    async def send_to_client(self, client_id: str, message: dict[str, Any]) -> None:
        """Send message to specific client.

        Args:
            client_id: Client identifier
            message: Message to send
        """
        if client_id not in self.active_connections:
            logger.warning(f"Client {client_id} not connected")
            return

        conn_info = self.active_connections[client_id]
        try:
            await conn_info.websocket.send_json(message)
        except WebSocketDisconnect:
            await self.disconnect(client_id)
        except Exception as e:
            logger.error(f"Error sending to {client_id}: {e}")
            await self.disconnect(client_id)

    async def broadcast_to_room(self, room: str, message: dict[str, Any]) -> None:
        """Broadcast message to all clients in a room.

        Args:
            room: Room name
            message: Message to broadcast
        """
        if room not in self.rooms:
            return

        # Get list of clients to avoid modification during iteration
        clients = list(self.rooms[room])

        # Send to all clients in parallel
        tasks = [self.send_to_client(client_id, message) for client_id in clients]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_to_prompt(
        self, prompt_id: str, message: dict[str, Any]
    ) -> None:
        """Broadcast message to all clients monitoring a prompt.

        Args:
            prompt_id: Prompt ID
            message: Message to broadcast
        """
        if prompt_id not in self.prompt_connections:
            return

        # Get list of clients
        clients = list(self.prompt_connections[prompt_id])

        # Send to all clients in parallel
        tasks = [self.send_to_client(client_id, message) for client_id in clients]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_to_all(self, message: dict[str, Any]) -> None:
        """Broadcast message to all connected clients.

        Args:
            message: Message to broadcast
        """
        clients = list(self.active_connections.keys())
        tasks = [self.send_to_client(client_id, message) for client_id in clients]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def handle_client_message(
        self, client_id: str, message: dict[str, Any]
    ) -> None:
        """Handle message from client.

        Args:
            client_id: Client identifier
            message: Message from client
        """
        if client_id not in self.active_connections:
            return

        conn_info = self.active_connections[client_id]

        # Handle different message types
        msg_type = message.get("type")

        if msg_type == "ping":
            # Update last ping time
            conn_info.last_ping = datetime.now()
            # Send pong response
            await self.send_to_client(client_id, {"type": "pong"})

        elif msg_type == "subscribe":
            # Subscribe to a prompt
            prompt_id = message.get("prompt_id")
            if prompt_id:
                async with self._lock:
                    conn_info.prompt_id = prompt_id
                    self.prompt_connections[prompt_id].add(client_id)
                await self.send_to_client(
                    client_id, {"type": "subscribed", "prompt_id": prompt_id}
                )

        elif msg_type == "unsubscribe":
            # Unsubscribe from prompt
            if conn_info.prompt_id:
                async with self._lock:
                    self.prompt_connections[conn_info.prompt_id].discard(client_id)
                    conn_info.prompt_id = None
                await self.send_to_client(client_id, {"type": "unsubscribed"})

        elif msg_type == "join_room":
            # Join a room
            room = message.get("room")
            if room:
                async with self._lock:
                    if conn_info.room:
                        self.rooms[conn_info.room].discard(client_id)
                    conn_info.room = room
                    self.rooms[room].add(client_id)
                await self.send_to_client(
                    client_id, {"type": "joined_room", "room": room}
                )

    async def _heartbeat_loop(self) -> None:
        """Send periodic heartbeat to keep connections alive."""
        while self.active_connections:
            try:
                await asyncio.sleep(30)  # Send heartbeat every 30 seconds

                # Check for stale connections
                now = datetime.now()
                stale_clients = []

                for client_id, conn_info in self.active_connections.items():
                    # Check if connection is stale (no ping for 2 minutes)
                    if now - conn_info.last_ping > timedelta(minutes=2):
                        stale_clients.append(client_id)
                    else:
                        # Send heartbeat
                        await self.send_to_client(client_id, {"type": "heartbeat"})

                # Disconnect stale clients
                for client_id in stale_clients:
                    logger.warning(f"Disconnecting stale client: {client_id}")
                    await self.disconnect(client_id)

            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")

    def get_connection_count(self) -> int:
        """Get number of active connections."""
        return len(self.active_connections)

    def get_room_count(self, room: str) -> int:
        """Get number of connections in a room."""
        return len(self.rooms.get(room, set()))

    def get_prompt_count(self, prompt_id: str) -> int:
        """Get number of connections monitoring a prompt."""
        return len(self.prompt_connections.get(prompt_id, set()))

    async def close_all(self) -> None:
        """Close all connections."""
        clients = list(self.active_connections.keys())
        for client_id in clients:
            await self.disconnect(client_id)

        # Cancel heartbeat task
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()


class ProgressTracker:
    """Tracks workflow execution progress."""

    def __init__(self, websocket_manager: WebSocketManager):
        """Initialize progress tracker.

        Args:
            websocket_manager: WebSocket manager for sending updates
        """
        self.ws_manager = websocket_manager
        self.progress_data: dict[str, dict[str, Any]] = {}
        self.start_times: dict[str, datetime] = {}

    async def start_execution(self, prompt_id: str, total_steps: int = 25) -> None:
        """Mark execution start.

        Args:
            prompt_id: Prompt ID
            total_steps: Total number of steps
        """
        self.start_times[prompt_id] = datetime.now()
        self.progress_data[prompt_id] = {
            "status": "started",
            "current_step": 0,
            "total_steps": total_steps,
            "percentage": 0,
            "current_node": None,
            "eta": None,
        }

        await self.ws_manager.broadcast_to_prompt(
            prompt_id,
            {
                "type": "execution_started",
                "prompt_id": prompt_id,
                "total_steps": total_steps,
            },
        )

    async def update_progress(
        self,
        prompt_id: str,
        current_step: int,
        current_node: str | None = None,
        preview_image: str | None = None,
    ) -> None:
        """Update execution progress.

        Args:
            prompt_id: Prompt ID
            current_step: Current step number
            current_node: Current node being executed
            preview_image: Optional preview image URL
        """
        if prompt_id not in self.progress_data:
            return

        data = self.progress_data[prompt_id]
        data["current_step"] = current_step
        data["percentage"] = (current_step / data["total_steps"]) * 100
        data["current_node"] = current_node

        # Calculate ETA
        if prompt_id in self.start_times:
            elapsed = (datetime.now() - self.start_times[prompt_id]).total_seconds()
            if current_step > 0:
                avg_time_per_step = elapsed / current_step
                remaining_steps = data["total_steps"] - current_step
                eta_seconds = avg_time_per_step * remaining_steps
                data["eta"] = int(eta_seconds)

        # Send update
        message = {"type": "progress_update", "prompt_id": prompt_id, **data}

        if preview_image:
            message["preview_image"] = preview_image

        await self.ws_manager.broadcast_to_prompt(prompt_id, message)

    async def complete_execution(
        self, prompt_id: str, images: list[Any] | None = None, error: str | None = None
    ) -> None:
        """Mark execution complete.

        Args:
            prompt_id: Prompt ID
            images: Generated images
            error: Error message if failed
        """
        if prompt_id not in self.progress_data:
            return

        status = "failed" if error else "completed"
        self.progress_data[prompt_id]["status"] = status

        # Calculate total time
        total_time = None
        if prompt_id in self.start_times:
            total_time = (datetime.now() - self.start_times[prompt_id]).total_seconds()

        message: dict[str, Any] = {
            "type": "execution_complete",
            "prompt_id": prompt_id,
            "status": status,
            "total_time": total_time,
        }

        if images:
            message["images"] = images
        if error:
            message["error"] = error

        await self.ws_manager.broadcast_to_prompt(prompt_id, message)

        # Clean up
        self.progress_data.pop(prompt_id, None)
        self.start_times.pop(prompt_id, None)

    async def send_queue_update(self, prompt_id: str, queue_position: int) -> None:
        """Send queue position update.

        Args:
            prompt_id: Prompt ID
            queue_position: Position in queue
        """
        await self.ws_manager.broadcast_to_prompt(
            prompt_id,
            {
                "type": "queue_update",
                "prompt_id": prompt_id,
                "queue_position": queue_position,
            },
        )
