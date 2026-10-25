from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    meta: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    areas: Mapped[list[Area]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    facilities: Mapped[list[Facility]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class Area(Base):
    __tablename__ = "areas"
    __table_args__ = (
        CheckConstraint(
            "population IS NULL OR population >= 0", name="ck_areas_population_nonnegative"
        ),
        CheckConstraint(
            "vulnerability_index IS NULL OR "
            "(vulnerability_index >= 0 AND vulnerability_index <= 1)",
            name="ck_areas_vulnerability_range",
        ),
        CheckConstraint(
            "centroid_lon >= -180 AND centroid_lon <= 180 AND centroid_lat >= -90 AND centroid_lat <= 90",
            name="ck_areas_centroid_range",
        ),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    population_status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="unknown"
    )
    population_reference_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vulnerability_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    geometry: Mapped[dict] = mapped_column(JSON, nullable=False)
    centroid_lon: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    area_km2: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    quadrant: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    municipality: Mapped[str] = mapped_column(String(80), nullable=False, default="")

    dataset: Mapped[Dataset] = relationship(back_populates="areas")


class Facility(Base):
    __tablename__ = "facilities"
    __table_args__ = (
        CheckConstraint(
            "lon >= -180 AND lon <= 180 AND lat >= -90 AND lat <= 90",
            name="ck_facilities_coordinate_range",
        ),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    facility_type: Mapped[str] = mapped_column(String(80), nullable=False)
    services: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    data_status: Mapped[str] = mapped_column(String(40), nullable=False, default="synthetic")
    source: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    source_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    source_url: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    ownership: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")
    operational_status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="unknown"
    )
    address: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    admin_area: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    source_tags: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

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
