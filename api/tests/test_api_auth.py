import os

os.environ["INTERNAL_API_KEY"] = "test-secret-key"

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_does_not_require_api_key():
    response = client.get("/api/health")
    assert response.status_code == 200


def test_drafts_list_requires_api_key():
    response = client.get("/api/drafts/")
    assert response.status_code == 401


def test_drafts_list_accepts_correct_api_key():
    response = client.get(
        "/api/drafts/",
        headers={"X-Internal-Api-Key": "test-secret-key"},
    )
    assert response.status_code != 401
