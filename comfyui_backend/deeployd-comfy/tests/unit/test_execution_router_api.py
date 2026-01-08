"""Unit tests for execution router endpoints."""

from fastapi.testclient import TestClient

from src.api.app import create_app


def _create_sample_workflow(client: TestClient) -> str:
    content = b'{"1": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}}}'
    files = {"file": ("wf.json", content, "application/json")}
    data = {"name": "wf-exe"}
    resp = client.post("/api/v1/workflows/", files=files, data=data)
    assert resp.status_code == 200
    return resp.json()["id"]


class TestExecutionRouter:
    def test_create_and_list_executions(self):
        app = create_app()
        client = TestClient(app)

        wid = _create_sample_workflow(client)

        # Create execution
        resp = client.post(
            "/api/v1/executions/",
            json={"workflow_id": wid, "parameters": {"prompt": "test"}},
        )
        assert resp.status_code == 200
        exe = resp.json()
        assert exe["workflow_id"] == wid
        assert exe["status"] in ["pending", "running", "completed", "failed"]

        # Get by id
        resp = client.get(f"/api/v1/executions/{exe['id']}")
        assert resp.status_code == 200
        assert resp.json()["id"] == exe["id"]

        # List executions
        resp = client.get("/api/v1/executions?limit=5")
        assert resp.status_code == 200
        items = resp.json()
        assert isinstance(items, list)
        assert any(e["id"] == exe["id"] for e in items)
