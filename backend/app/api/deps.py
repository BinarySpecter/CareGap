from __future__ import annotations

from collections.abc import Iterator

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Dataset
from app.seed import DEMO_DATASET_ID
from app.services.routing import TravelTimeRouter


def get_session(request: Request) -> Iterator[Session]:
    session_factory = request.app.state.session_factory
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def get_travel_router(request: Request) -> TravelTimeRouter:
    return request.app.state.travel_router


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def require_dataset(session: Session, dataset_id: str = DEMO_DATASET_ID) -> Dataset:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset
