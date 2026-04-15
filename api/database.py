from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import get_settings

def normalize_database_url(url: str) -> str:
    if url.startswith("file:"):
        raw_path = url.removeprefix("file:")
        repo_root = Path(__file__).resolve().parents[1]
        candidates = [
            (repo_root / raw_path).resolve(),
            (repo_root / "dashboard" / "prisma" / raw_path).resolve(),
            (Path.cwd() / raw_path).resolve(),
        ]

        for candidate in candidates:
            if candidate.parent.exists():
                return f"sqlite:///{candidate}"

        return f"sqlite:///{candidates[0]}"
    return url


db_url = normalize_database_url(get_settings().database_url)
connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
engine = create_engine(db_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
