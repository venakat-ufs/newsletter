from unittest.mock import patch

from services.pinchtab_client import PinchTabClient


def test_prime_url_stops_profile_even_on_navigate_failure(monkeypatch):
    monkeypatch.setenv("PINCHTAB_ENABLED", "true")
    client = PinchTabClient()

    stopped_ids = []

    def fake_request(method, path, **kwargs):
        if path == "/profiles":
            return {"data": [{"id": "profile-1", "name": client.profile_name}]}
        if path == "/profiles/profile-1/start":
            return {"port": 9999}
        if path == "/navigate":
            raise RuntimeError("navigate failed")
        raise AssertionError(f"unexpected call: {method} {path}")

    def fake_stop(profile_id):
        stopped_ids.append(profile_id)

    with patch.object(client, "_request", side_effect=fake_request):
        with patch.object(client, "stop_profile", side_effect=fake_stop):
            try:
                client.prime_url("https://example.com")
            except RuntimeError:
                pass

    assert stopped_ids == ["profile-1"]
