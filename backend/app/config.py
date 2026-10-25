from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CAREGAP_",
        env_file=(str(PROJECT_ROOT / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "CareGap API"
    env: str = "development"
    version: str = "0.2.0"
    database_url: str = "sqlite:///./caregap.db"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_import_bytes: int = 2_097_152
    demo_seed: int = 20261024
    log_level: str = "INFO"

    # Dataset profile loaded into the database at startup. Supported values are
    # "delhi-pilot" (real public data) and "caregap-demo" (deterministic
    # synthetic data for development and testing). There is no silent fallback:
    # an unavailable profile stops startup with a clear error.
    active_dataset: str = "delhi-pilot"
    # Optional override for the profile directory (used by tests and operators).
    dataset_dir: str = ""
    # Disable mutating endpoints for a public demonstration deployment.
    read_only: bool = False
    # Expose /docs, /redoc, and /openapi.json. Disable in production if not needed.
    enable_docs: bool = True
    # Comma-separated hosts accepted by TrustedHostMiddleware. Empty disables the check.
    allowed_hosts: str = ""

    @field_validator("database_url")
    @classmethod
    def reject_empty_database_url(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("CAREGAP_DATABASE_URL must not be empty")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.env.lower() in {"production", "prod"}

    @property
    def allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
