from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import data, health, overview, recommendations, scenarios
from app.config import Settings, get_settings
from app.db import Base, make_engine, make_session_factory
from app.seed import ensure_demo_dataset
from app.services.routing import build_router

logger = logging.getLogger("caregap")


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    logging.basicConfig(
        level=getattr(logging, resolved.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    engine = make_engine(resolved.database_url)
    session_factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(engine)
        with session_factory() as session:
            try:
                ensure_demo_dataset(session)
            except Exception:
                session.rollback()
                logger.exception("Failed to seed the demo dataset")
                raise
        app.state.travel_router = build_router()
        logger.info(
            "CareGap API ready: routing=%s environment=%s",
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
            "The bundled dataset is synthetic; see /api/v1/meta for provenance."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )
    app.state.settings = resolved
    app.state.engine = engine
    app.state.session_factory = session_factory

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
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
            "docs": "/docs",
            "health": "/health",
        }

    return app


app = create_app()
