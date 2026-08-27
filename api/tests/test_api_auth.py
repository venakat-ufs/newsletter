import os

os.environ["INTERNAL_API_KEY"] = "test-secret-key"

from config import get_settings

# get_settings() is @lru_cache'd, so if another test module imported it
# before INTERNAL_API_KEY was set above, the cached Settings would still
# have an empty key. Clear it so this module's env var always takes effect
# regardless of test run/import order.
get_settings.cache_clear()

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
