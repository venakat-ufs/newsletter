from fastapi import APIRouter, HTTPException

from services.data_aggregator import collect_all_legacy_sources, get_all_sources, get_source_by_name

router = APIRouter()


@router.get("/")
def list_sources():
    """List the available Python source collectors."""
    return {
        "sources": [
            {
                "name": source.name,
                "collector": source.__class__.__name__,
            }
            for source in get_all_sources()
        ]
    }


@router.post("/collect")
def collect_sources():
    """Run every source collector once and return the live summary."""
    raw_data, sources_used, sources_warning, sources_failed = collect_all_legacy_sources()
    return {
        "sources": raw_data,
        "sources_used": sources_used,
        "sources_warning": sources_warning,
        "sources_failed": sources_failed,
    }


@router.post("/collect/{source_name}")
def collect_source(source_name: str):
    """Run a single source collector for manual debugging."""
    source = get_source_by_name(source_name)
    if source is None:
        raise HTTPException(status_code=404, detail=f"Unknown source: {source_name}")

    return source.safe_collect().to_dict()
