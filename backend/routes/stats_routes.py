from flask import Blueprint, jsonify
from sqlalchemy import text

from cache import _cache, _charity_cache
from db import _engine, db_available


stats_bp = Blueprint("stats", __name__)


def _flask_app():
    from extensions import app
    return app


def _count_wifi_pipeline_entries():
    if _cache.get("data"):
        return len(_cache["data"])
    if not db_available():
        return 0
    try:
        with _engine.connect() as conn:
            return conn.execute(text("SELECT COUNT(*) FROM wifi_locations")).scalar() or 0
    except Exception as e:
        _flask_app().logger.error(f"Postgres count failed for wifi_locations: {e}")
        return 0


def _count_charity_pipeline_entries():
    if db_available():
        try:
            with _engine.connect() as conn:
                counted = conn.execute(text("SELECT COUNT(*) FROM charities")).scalar() or 0
                if counted:
                    return counted
        except Exception as e:
            _flask_app().logger.error(f"Postgres count failed for charities: {e}")
    return sum(len(entry.get("data") or []) for entry in _charity_cache.values())


@stats_bp.route("/api/stats")
def get_coverage_stats():
    """Homepage coverage counts from the live wifi and charity pipelines."""
    return jsonify({
        "wifiLocations": _count_wifi_pipeline_entries(),
        "supportServices": _count_charity_pipeline_entries(),
        "coverage": "All of VIC",
    })
