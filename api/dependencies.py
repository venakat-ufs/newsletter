from fastapi import Header, HTTPException

from config import get_settings


def require_internal_api_key(x_internal_api_key: str = Header(default="")) -> None:
    """Require a shared-secret header on every non-health route.

    This service has no per-user auth (it's an internal automation API), so a
    single shared secret is the minimum bar to stop it being driven directly
    by anyone who can reach the host/port.
    """
    settings = get_settings()
    if not settings.internal_api_key:
        raise HTTPException(status_code=503, detail="INTERNAL_API_KEY is not configured")
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
