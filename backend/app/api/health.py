from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_session
from app.api.schemas import HealthResponse
from app.config import Settings
from app.models import Dataset

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> HealthResponse:
    dataset_count = session.scalar(select(func.count()).select_from(Dataset)) or 0
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.version,
        dataset_loaded=dataset_count > 0,
        database="connected",
        environment=settings.env,
    )
