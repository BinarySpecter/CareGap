from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect

from app.api import data, health, overview, recommendations, scenarios
from app.config import Settings, get_settings
from app.datasets import build_dataset_router, get_profile, load_manifest, resolve_data_dir
from app.db import Base, make_engine, make_session_factory
from app.seed import seed_active_dataset

logger = logging.getLogger("caregap")

SCHEMA_HINT = (
    "The database schema is out of date. Run 'alembic upgrade head' in backend/ "
    "before starting the API, or use a fresh database."
)


def _check_schema(engine) -> None:
    inspector = inspect(engine)
    if not inspector.has_table("areas"):
        return
    columns = {column["name"] for column in inspector.get_columns("areas")}
    if "population_status" not in columns:
        raise RuntimeError(SCHEMA_HINT)
    facility_columns = {
        column["name"] for column in inspector.get_columns("facilities")
    }
    if "source_id" not in facility_columns:
        raise RuntimeError(SCHEMA_HINT)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    logging.basicConfig(
        level=getattr(logging, resolved.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    profile = get_profile(resolved.active_dataset)
    data_dir = resolve_data_dir(profile, resolved)
    engine = make_engine(resolved.database_url)
    session_factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(engine)
        _check_schema(engine)
        with session_factory() as session:
            try:
                seed_active_dataset(session, resolved)
            except Exception:
                session.rollback()
                logger.exception(
                    "Failed to load dataset '%s' from %s", profile.id, data_dir
                )
                raise
        manifest = load_manifest(data_dir)
        app.state.dataset_id = profile.id
        app.state.dataset_manifest = manifest
        app.state.travel_router = build_dataset_router(profile, data_dir, manifest)
        logger.info(
            "CareGap API ready: dataset=%s release=%s routing=%s environment=%s",
            profile.id,
            manifest.get("release") or manifest.get("generated_at"),
            app.state.travel_router.model_info.id,
            resolved.env,
        )
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(
        title="CareGap API",
        version=resolved.version,
        description=(
            "Geospatial healthcare accessibility and intervention planning. "
            "The active dataset and release are exposed at /api/v1/meta; "
            "see /api/v1/datasets for available profiles."
        ),
        lifespan=lifespan,
        docs_url="/docs" if resolved.enable_docs else None,
        redoc_url="/redoc" if resolved.enable_docs else None,
        openapi_url="/openapi.json" if resolved.enable_docs else None,
    )
    app.state.settings = resolved
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.profile = profile

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )
    if resolved.allowed_host_list:
        from starlette.middleware.trustedhost import TrustedHostMiddleware

        app.add_middleware(
            TrustedHostMiddleware, allowed_hosts=resolved.allowed_host_list
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    app.include_router(health.router)
    app.include_router(overview.router)
    app.include_router(scenarios.router)
    app.include_router(recommendations.router)
    app.include_router(data.router)

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {
            "name": "CareGap API",
            "version": resolved.version,
            "dataset": profile.id,
            "docs": "/docs" if resolved.enable_docs else "disabled",
            "health": "/health",
        }

    return app


app = create_app()
