import hmac

from flask import Blueprint, jsonify, request

from config import get_refresh_secret
from extensions import limiter
from services.refresh_service import schedule_full_refresh


refresh_bp = Blueprint("refresh", __name__)


def _secrets_match(provided, expected):
    if not provided or not expected:
        return False
    provided_bytes = provided.encode("utf-8")
    expected_bytes = expected.encode("utf-8")
    if len(provided_bytes) != len(expected_bytes):
        return False
    return hmac.compare_digest(provided_bytes, expected_bytes)


@refresh_bp.route("/api/internal/refresh")
@limiter.limit("5 per hour")
def internal_refresh():
    """Keep-alive ping or background full refresh. Guarded by X-Refresh-Secret."""
    expected = get_refresh_secret()
    if not expected:
        return jsonify({"error": "Refresh endpoint is not configured."}), 503

    provided = request.headers.get("X-Refresh-Secret", "")
    if not _secrets_match(provided, expected):
        return jsonify({"error": "Unauthorized"}), 401

    mode = (request.args.get("mode") or "ping").strip().lower()
    if mode == "full":
        schedule_full_refresh()
        return jsonify({"status": "refresh started"}), 202
    if mode not in ("", "ping"):
        return jsonify({"error": "mode must be ping or full"}), 400

    return jsonify({"status": "ok"}), 200
