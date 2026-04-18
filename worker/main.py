"""Compatibility entrypoint for uvicorn worker.main:app."""

from worker.app.main import app

__all__ = ["app"]
