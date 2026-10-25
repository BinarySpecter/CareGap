"""delhi pilot provenance and nullable population

Revision ID: 3c9a1e6f2b10
Revises: af8d1f78b2a6
Create Date: 2026-10-25 06:40:00.000000

Adds dataset provenance columns, allows population and vulnerability to be
unknown (null) rather than fabricated, and adds range constraints.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3c9a1e6f2b10"
down_revision: str | None = "af8d1f78b2a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("areas") as batch:
        batch.alter_column(
            "population", existing_type=sa.Integer(), nullable=True
        )
        batch.alter_column(
            "vulnerability_index", existing_type=sa.Float(), nullable=True
        )
        batch.add_column(
            sa.Column(
                "population_status",
                sa.String(length=40),
                nullable=False,
                server_default="unknown",
            )
        )
        batch.add_column(
            sa.Column("population_reference_year", sa.Integer(), nullable=True)
        )
        batch.add_column(
            sa.Column(
                "municipality", sa.String(length=80), nullable=False, server_default=""
            )
        )
        batch.create_check_constraint(
            "ck_areas_population_nonnegative",
            "population IS NULL OR population >= 0",
        )
        batch.create_check_constraint(
            "ck_areas_vulnerability_range",
            "vulnerability_index IS NULL OR "
            "(vulnerability_index >= 0 AND vulnerability_index <= 1)",
        )
        batch.create_check_constraint(
            "ck_areas_centroid_range",
            "centroid_lon >= -180 AND centroid_lon <= 180 AND "
            "centroid_lat >= -90 AND centroid_lat <= 90",
        )

    with op.batch_alter_table("facilities") as batch:
        batch.add_column(
            sa.Column("source", sa.String(length=120), nullable=False, server_default="")
        )
        batch.add_column(
            sa.Column("source_id", sa.String(length=120), nullable=False, server_default="")
        )
        batch.add_column(
            sa.Column("source_url", sa.String(length=300), nullable=False, server_default="")
        )
        batch.add_column(
            sa.Column(
                "ownership", sa.String(length=40), nullable=False, server_default="unknown"
            )
        )
        batch.add_column(
            sa.Column(
                "operational_status",
                sa.String(length=40),
                nullable=False,
                server_default="unknown",
            )
        )
        batch.add_column(
            sa.Column("address", sa.String(length=300), nullable=False, server_default="")
        )
        batch.add_column(
            sa.Column(
                "admin_area", sa.String(length=160), nullable=False, server_default=""
            )
        )
        batch.add_column(
            sa.Column("source_tags", sa.JSON(), nullable=False, server_default="{}")
        )
        batch.create_check_constraint(
            "ck_facilities_coordinate_range",
            "lon >= -180 AND lon <= 180 AND lat >= -90 AND lat <= 90",
        )

    with op.batch_alter_table("areas") as batch:
        batch.alter_column("population_status", server_default=None)
        batch.alter_column("municipality", server_default=None)
    with op.batch_alter_table("facilities") as batch:
        batch.alter_column("source", server_default=None)
        batch.alter_column("source_id", server_default=None)
        batch.alter_column("source_url", server_default=None)
        batch.alter_column("ownership", server_default=None)
        batch.alter_column("operational_status", server_default=None)
        batch.alter_column("address", server_default=None)
        batch.alter_column("admin_area", server_default=None)
        batch.alter_column("source_tags", server_default=None)


def downgrade() -> None:
    op.execute(
        "UPDATE areas SET population = 0 WHERE population IS NULL"
    )
    op.execute(
        "UPDATE areas SET vulnerability_index = 0.5 WHERE vulnerability_index IS NULL"
    )
    with op.batch_alter_table("facilities") as batch:
        batch.drop_constraint("ck_facilities_coordinate_range", type_="check")
        batch.drop_column("source_tags")
        batch.drop_column("admin_area")
        batch.drop_column("address")
        batch.drop_column("operational_status")
        batch.drop_column("ownership")
        batch.drop_column("source_url")
        batch.drop_column("source_id")
        batch.drop_column("source")
    with op.batch_alter_table("areas") as batch:
        batch.drop_constraint("ck_areas_centroid_range", type_="check")
        batch.drop_constraint("ck_areas_vulnerability_range", type_="check")
        batch.drop_constraint("ck_areas_population_nonnegative", type_="check")
        batch.drop_column("municipality")
        batch.drop_column("population_reference_year")
        batch.drop_column("population_status")
        batch.alter_column(
            "vulnerability_index", existing_type=sa.Float(), nullable=False
        )
        batch.alter_column("population", existing_type=sa.Integer(), nullable=False)
