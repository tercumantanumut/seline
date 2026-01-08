"""Unit tests for container router endpoints."""

from fastapi.testclient import TestClient

from src.api.app import create_app


def _create_sample_workflow(client: TestClient) -> str:
    content = b'{"1": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}}}'
    files = {"file": ("wf.json", content, "application/json")}
    data = {"name": "wf1"}
    resp = client.post("/api/v1/workflows/", files=files, data=data)
    assert resp.status_code == 200
    return resp.json()["id"]


class TestContainerRouter:
    def test_create_and_list_builds(self):
        app = create_app()
        client = TestClient(app)

        wid = _create_sample_workflow(client)

        # Create build
        resp = client.post(
            "/api/v1/containers/builds",
            json={"workflow_id": wid, "image_name": "img", "tag": "test"},
        )
        assert resp.status_code == 200
        build = resp.json()
        assert build["workflow_id"] == wid
        assert build["image_name"] == "img"

        # List builds
        resp = client.get("/api/v1/containers/builds?limit=5")
        assert resp.status_code == 200
        items = resp.json()
        assert isinstance(items, list)
        assert any(b["id"] == build["id"] for b in items)

        # Get build by id
        resp = client.get(f"/api/v1/containers/builds/{build['id']}")
        assert resp.status_code == 200
        assert resp.json()["id"] == build["id"]

        # Logs endpoint
        resp = client.get(f"/api/v1/containers/builds/{build['id']}/logs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["build_id"] == build["id"]
