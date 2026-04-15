from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import Base, engine
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

app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(newsletter.router, prefix="/api/newsletter", tags=["Newsletter"])
app.include_router(articles.router, prefix="/api/articles", tags=["Articles"])
app.include_router(sources.router, prefix="/api/sources", tags=["Sources"])
app.include_router(reo.router, prefix="/api/reo", tags=["REO New Sources"])
app.include_router(reo.router, prefix="/reo", tags=["REO New Sources"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ufs-newsletter-api"}
