from fastapi import APIRouter

from services.reo_aggregator import collect_all_sources

router = APIRouter()


@router.get("/new-sources")
async def collect_new_reo_sources():
    merged = await collect_all_sources()
    return {
        "listings_count_per_source": {
            source: info.get("listings_count", 0)
            for source, info in merged.get("by_source", {}).items()
        },
        "merged_dataset": merged,
    }
