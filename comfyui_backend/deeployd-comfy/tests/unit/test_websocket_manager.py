"""Tests for WebSocket manager with real connections."""

import pytest
import asyncio
import json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import WebSocket
from fastapi.testclient import TestClient

from src.api.websocket_manager import (
    WebSocketManager,
    ProgressTracker,
    ConnectionInfo
)


class TestWebSocketManager:
    """Test WebSocket manager functionality."""
    
    @pytest.fixture
    def manager(self):
        """Create WebSocket manager instance."""
        return WebSocketManager(max_connections=5)
    
    @pytest.fixture
    def mock_websocket(self):
        """Create mock WebSocket."""
        ws = MagicMock(spec=WebSocket)
        ws.accept = AsyncMock()
        ws.send_json = AsyncMock()
        ws.close = AsyncMock()
        return ws
    
    @pytest.mark.asyncio
    async def test_connect_success(self, manager, mock_websocket):
        """Test successful connection."""
        result = await manager.connect(
            websocket=mock_websocket,
            client_id="test-client-1",
            prompt_id="prompt-123",
            room="room-1"
        )
        
        assert result is True
        mock_websocket.accept.assert_called_once()
        assert "test-client-1" in manager.active_connections
        assert "test-client-1" in manager.rooms["room-1"]
        assert "test-client-1" in manager.prompt_connections["prompt-123"]
    
    @pytest.mark.asyncio
    async def test_connect_max_connections(self, manager, mock_websocket):
        """Test connection rejected when max reached."""
        # Fill up connections
        for i in range(5):
            ws = MagicMock(spec=WebSocket)
            ws.accept = AsyncMock()
            ws.close = AsyncMock()
            await manager.connect(ws, f"client-{i}")
        
        # Try one more
        result = await manager.connect(mock_websocket, "client-overflow")
        
        assert result is False
        mock_websocket.close.assert_called_once_with(
            code=1008,
            reason="Max connections reached"
        )
    
    @pytest.mark.asyncio
    async def test_disconnect(self, manager, mock_websocket):
        """Test disconnection."""
        # Connect first
        await manager.connect(
            websocket=mock_websocket,
            client_id="test-client",
            prompt_id="prompt-123",
            room="room-1"
        )
        
        # Disconnect
        await manager.disconnect("test-client")
        
        assert "test-client" not in manager.active_connections
        assert "test-client" not in manager.rooms.get("room-1", set())
        assert "test-client" not in manager.prompt_connections.get("prompt-123", set())
        mock_websocket.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_send_to_client(self, manager, mock_websocket):
        """Test sending message to specific client."""
        await manager.connect(mock_websocket, "test-client")
        
        message = {"type": "test", "data": "hello"}
        await manager.send_to_client("test-client", message)
        
        mock_websocket.send_json.assert_called_once_with(message)
    
    @pytest.mark.asyncio
    async def test_broadcast_to_room(self, manager):
        """Test broadcasting to room."""
        # Create multiple clients in same room
        clients = []
        for i in range(3):
            ws = MagicMock(spec=WebSocket)
            ws.accept = AsyncMock()
            ws.send_json = AsyncMock()
            await manager.connect(ws, f"client-{i}", room="test-room")
            clients.append(ws)
        
        message = {"type": "broadcast", "data": "test"}
        await manager.broadcast_to_room("test-room", message)
        
        # All clients should receive message
        for ws in clients:
            ws.send_json.assert_called_once_with(message)
    
    @pytest.mark.asyncio
    async def test_broadcast_to_prompt(self, manager):
        """Test broadcasting to prompt subscribers."""
        # Create multiple clients monitoring same prompt
        clients = []
        for i in range(3):
            ws = MagicMock(spec=WebSocket)
            ws.accept = AsyncMock()
            ws.send_json = AsyncMock()
            await manager.connect(ws, f"client-{i}", prompt_id="prompt-123")
            clients.append(ws)
        
        message = {"type": "progress", "step": 5}
        await manager.broadcast_to_prompt("prompt-123", message)
        
        # All clients should receive message
        for ws in clients:
            ws.send_json.assert_called_once_with(message)
    
    @pytest.mark.asyncio
    async def test_handle_ping_message(self, manager, mock_websocket):
        """Test handling ping message."""
        await manager.connect(mock_websocket, "test-client")
        
        await manager.handle_client_message("test-client", {"type": "ping"})
        
        mock_websocket.send_json.assert_called_once_with({"type": "pong"})
    
    @pytest.mark.asyncio
    async def test_handle_subscribe_message(self, manager, mock_websocket):
        """Test handling subscribe message."""
        await manager.connect(mock_websocket, "test-client")
        
        await manager.handle_client_message(
            "test-client",
            {"type": "subscribe", "prompt_id": "new-prompt"}
        )
        
        assert "test-client" in manager.prompt_connections["new-prompt"]
        mock_websocket.send_json.assert_called_with({
            "type": "subscribed",
            "prompt_id": "new-prompt"
        })
    
    @pytest.mark.asyncio
    async def test_handle_join_room_message(self, manager, mock_websocket):
        """Test handling join room message."""
        await manager.connect(mock_websocket, "test-client", room="old-room")
        
        await manager.handle_client_message(
            "test-client",
            {"type": "join_room", "room": "new-room"}
        )
        
        assert "test-client" not in manager.rooms.get("old-room", set())
        assert "test-client" in manager.rooms["new-room"]
        mock_websocket.send_json.assert_called_with({
            "type": "joined_room",
            "room": "new-room"
        })
    
    @pytest.mark.asyncio
    async def test_heartbeat_loop(self, manager, mock_websocket):
        """Test heartbeat loop sends heartbeats."""
        await manager.connect(mock_websocket, "test-client")
        
        # Manually trigger heartbeat
        await manager.send_to_client("test-client", {"type": "heartbeat"})
        
        mock_websocket.send_json.assert_called_with({"type": "heartbeat"})
    
    @pytest.mark.asyncio
    async def test_stale_connection_removal(self, manager, mock_websocket):
        """Test stale connections are removed."""
        await manager.connect(mock_websocket, "test-client")
        
        # Make connection appear stale
        conn_info = manager.active_connections["test-client"]
        conn_info.last_ping = datetime.now() - timedelta(minutes=3)
        
        # Run heartbeat check
        await manager._heartbeat_loop()
        
        # Should be disconnected
        assert "test-client" not in manager.active_connections
    
    def test_get_connection_count(self, manager):
        """Test getting connection count."""
        assert manager.get_connection_count() == 0
        
        # Add some connections
        manager.active_connections["client-1"] = ConnectionInfo(MagicMock())
        manager.active_connections["client-2"] = ConnectionInfo(MagicMock())
        
        assert manager.get_connection_count() == 2
    
    def test_get_room_count(self, manager):
        """Test getting room member count."""
        assert manager.get_room_count("test-room") == 0
        
        manager.rooms["test-room"] = {"client-1", "client-2", "client-3"}
        
        assert manager.get_room_count("test-room") == 3
    
    def test_get_prompt_count(self, manager):
        """Test getting prompt subscriber count."""
        assert manager.get_prompt_count("prompt-123") == 0
        
        manager.prompt_connections["prompt-123"] = {"client-1", "client-2"}
        
        assert manager.get_prompt_count("prompt-123") == 2
    
    @pytest.mark.asyncio
    async def test_close_all(self, manager):
        """Test closing all connections."""
        # Create multiple connections
        for i in range(3):
            ws = MagicMock(spec=WebSocket)
            ws.accept = AsyncMock()
            ws.close = AsyncMock()
            await manager.connect(ws, f"client-{i}")
        
        await manager.close_all()
        
        assert manager.get_connection_count() == 0
        assert len(manager.rooms) == 0
        assert len(manager.prompt_connections) == 0


class TestProgressTracker:
    """Test progress tracker functionality."""
    
    @pytest.fixture
    def ws_manager(self):
        """Create WebSocket manager."""
        return WebSocketManager()
    
    @pytest.fixture
    def tracker(self, ws_manager):
        """Create progress tracker."""
        return ProgressTracker(ws_manager)
    
    @pytest.mark.asyncio
    async def test_start_execution(self, tracker, ws_manager):
        """Test starting execution tracking."""
        # Mock broadcast
        ws_manager.broadcast_to_prompt = AsyncMock()
        
        await tracker.start_execution("prompt-123", total_steps=30)
        
        assert "prompt-123" in tracker.progress_data
        assert tracker.progress_data["prompt-123"]["status"] == "started"
        assert tracker.progress_data["prompt-123"]["total_steps"] == 30
        
        ws_manager.broadcast_to_prompt.assert_called_once()
        call_args = ws_manager.broadcast_to_prompt.call_args[0]
        assert call_args[0] == "prompt-123"
        assert call_args[1]["type"] == "execution_started"
    
    @pytest.mark.asyncio
    async def test_update_progress(self, tracker, ws_manager):
        """Test updating progress."""
        ws_manager.broadcast_to_prompt = AsyncMock()
        
        # Start execution first
        await tracker.start_execution("prompt-123", total_steps=20)
        
        # Update progress
        await tracker.update_progress(
            "prompt-123",
            current_step=10,
            current_node="KSampler",
            preview_image="/preview/123.png"
        )
        
        data = tracker.progress_data["prompt-123"]
        assert data["current_step"] == 10
        assert data["percentage"] == 50.0
        assert data["current_node"] == "KSampler"
        
        # Check broadcast
        calls = ws_manager.broadcast_to_prompt.call_args_list
        last_call = calls[-1][0]
        assert last_call[1]["type"] == "progress_update"
        assert last_call[1]["percentage"] == 50.0
        assert last_call[1]["preview_image"] == "/preview/123.png"
    
    @pytest.mark.asyncio
    async def test_calculate_eta(self, tracker, ws_manager):
        """Test ETA calculation."""
        ws_manager.broadcast_to_prompt = AsyncMock()
        
        await tracker.start_execution("prompt-123", total_steps=10)
        
        # Simulate some time passing
        tracker.start_times["prompt-123"] = datetime.now() - timedelta(seconds=5)
        
        # Update to step 5 (halfway)
        await tracker.update_progress("prompt-123", current_step=5)
        
        data = tracker.progress_data["prompt-123"]
        # Should estimate ~5 seconds remaining (1 second per step)
        assert data["eta"] is not None
        assert 4 <= data["eta"] <= 6  # Allow some variance
    
    @pytest.mark.asyncio
    async def test_complete_execution_success(self, tracker, ws_manager):
        """Test completing successful execution."""
        ws_manager.broadcast_to_prompt = AsyncMock()
        
        await tracker.start_execution("prompt-123")
        await tracker.complete_execution(
            "prompt-123",
            images=["image1.png", "image2.png"]
        )
        
        # Should be cleaned up
        assert "prompt-123" not in tracker.progress_data
        assert "prompt-123" not in tracker.start_times
        
        # Check broadcast
        call_args = ws_manager.broadcast_to_prompt.call_args[0]
        assert call_args[1]["type"] == "execution_complete"
        assert call_args[1]["status"] == "completed"
        assert call_args[1]["images"] == ["image1.png", "image2.png"]
    
    @pytest.mark.asyncio
    async def test_complete_execution_error(self, tracker, ws_manager):
        """Test completing failed execution."""
        ws_manager.broadcast_to_prompt = AsyncMock()
        
        await tracker.start_execution("prompt-123")
        await tracker.complete_execution(
            "prompt-123",
            error="Out of memory"
        )
        
        # Check broadcast
        call_args = ws_manager.broadcast_to_prompt.call_args[0]
        assert call_args[1]["type"] == "execution_complete"
        assert call_args[1]["status"] == "failed"
        assert call_args[1]["error"] == "Out of memory"
    
    @pytest.mark.asyncio
    async def test_queue_update(self, tracker, ws_manager):
        """Test sending queue position update."""
        ws_manager.broadcast_to_prompt = AsyncMock()
        
        await tracker.send_queue_update("prompt-123", queue_position=3)
        
        call_args = ws_manager.broadcast_to_prompt.call_args[0]
        assert call_args[0] == "prompt-123"
        assert call_args[1]["type"] == "queue_update"
        assert call_args[1]["queue_position"] == 3