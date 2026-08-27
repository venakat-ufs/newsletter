from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import Base, engine
from dependencies import require_internal_api_key
from routes import pipeline, drafts, newsletter, articles, sources, reo

Base.metadata.create_all(bind=engine)
settings = get_settings()

app = FastAPI(
    title="UFS Newsletter API",
    description="The Disposition Desk — Weekly REO Newsletter System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.dashboard_url.rstrip("/"),
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

auth_dependency = [Depends(require_internal_api_key)]

# articles.router mixes the public /public/{article_id} email click-through
# page (must stay open, mirrors the Next.js side) with private routes, so it
# is NOT protected at the router level — see routes/articles.py, where the
# two private routes take the dependency individually instead.
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"], dependencies=auth_dependency)
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"], dependencies=auth_dependency)
app.include_router(newsletter.router, prefix="/api/newsletter", tags=["Newsletter"], dependencies=auth_dependency)
app.include_router(articles.router, prefix="/api/articles", tags=["Articles"])
app.include_router(sources.router, prefix="/api/sources", tags=["Sources"], dependencies=auth_dependency)
app.include_router(reo.router, prefix="/api/reo", tags=["REO New Sources"], dependencies=auth_dependency)
app.include_router(reo.router, prefix="/reo", tags=["REO New Sources"], dependencies=auth_dependency)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ufs-newsletter-api"}
