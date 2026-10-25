from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_synthetic: Mapped[bool] = mapped_column(nullable=False, default=False)
    meta: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    areas: Mapped[list[Area]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    facilities: Mapped[list[Facility]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class Area(Base):
    __tablename__ = "areas"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    population: Mapped[int] = mapped_column(Integer, nullable=False)
    vulnerability_index: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    geometry: Mapped[dict] = mapped_column(JSON, nullable=False)
    centroid_lon: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    area_km2: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    quadrant: Mapped[str] = mapped_column(String(40), nullable=False, default="")

    dataset: Mapped[Dataset] = relationship(back_populates="areas")


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    facility_type: Mapped[str] = mapped_column(String(80), nullable=False)
    services: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    data_status: Mapped[str] = mapped_column(String(40), nullable=False, default="synthetic")

    dataset: Mapped[Dataset] = relationship(back_populates="facilities")


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    intervention_type: Mapped[str] = mapped_column(String(80), nullable=False)
    service: Mapped[str] = mapped_column(String(60), nullable=False)
    threshold_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    interventions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ImportRun(Base):
    __tablename__ = "import_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    rows_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    errors: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
