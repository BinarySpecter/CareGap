from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Dataset
from app.seed import DEMO_DATASET_ID


def get_session(request: Request) -> Iterator[Session]:
    session_factory = request.app.state.session_factory
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def get_travel_router(request: Request):
    return request.app.state.travel_router


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_active_dataset_id(request: Request) -> str:
    return str(request.app.state.dataset_id)


def require_dataset(session: Session, dataset_id: str = DEMO_DATASET_ID) -> Dataset:
    """Return a stored dataset or fail with a clear, non-synthetic error."""
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Dataset '{dataset_id}' is not loaded. The server starts with the "
                "dataset selected by CAREGAP_ACTIVE_DATASET; see /health for status."
            ),
        )
    return dataset


def require_active_dataset(
    request: Request,
    session: Session = Depends(get_session),
) -> Dataset:
    return require_dataset(session, get_active_dataset_id(request))


def require_writable(settings: Settings = Depends(get_app_settings)) -> None:
    if settings.read_only:
        raise HTTPException(
            status_code=403,
            detail=(
                "This deployment is read-only. Scenario creation and data imports "
                "are disabled for the public demonstration."
            ),
        )
