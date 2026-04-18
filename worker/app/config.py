from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
WORKER_DIR = ROOT_DIR / "worker"
WORKER_VERSION_FILE = WORKER_DIR / "VERSION"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    worker_mode: str = Field(default="local", alias="WORKER_MODE")
    worker_auth_enabled: bool = Field(default=False, alias="WORKER_AUTH_ENABLED")
    entra_tenant_id: str = Field(default="", alias="ENTRA_TENANT_ID")
    entra_client_id: str = Field(default="", alias="ENTRA_CLIENT_ID")
    operator_allowlist_raw: str = Field(default="", alias="OPERATOR_ALLOWLIST")
    worker_host: str = Field(default="0.0.0.0", alias="WORKER_HOST")
    worker_port: int = Field(default=8000, alias="WORKER_PORT")
    runtime_data_dir: Path = Field(default=ROOT_DIR / "data" / "runtime", alias="WORKER_RUNTIME_DATA_DIR")
    mock_corpus_path: Path = Field(default=ROOT_DIR / "data" / "mock" / "corpus.json", alias="WORKER_MOCK_CORPUS_PATH")
    bishop_provider: str = Field(default="openai", alias="BISHOP_PROVIDER")
    bishop_model: str = Field(default="", alias="BISHOP_MODEL")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")

    @property
    def entra_scope(self) -> str:
        client_id = self.entra_client_id.strip()
        return f"api://{client_id}/Nexus.Access" if client_id else ""

    @property
    def operator_allowlist(self) -> tuple[str, ...]:
        values = []
        for raw_value in self.operator_allowlist_raw.split(","):
            value = raw_value.strip().lower()
            if value:
                values.append(value)
        return tuple(values)

    @property
    def access_log_dir(self) -> Path:
        return self.runtime_data_dir.parent / "logs"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


@lru_cache(maxsize=1)
def get_worker_version() -> str:
    return WORKER_VERSION_FILE.read_text(encoding="utf-8").strip()
