from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from extensions import limiter
from services.crisis_content_service import get_checklist_items, get_helplines


helplines_bp = Blueprint("helplines", __name__)


def _flask_app():
    from extensions import app
    return app


@helplines_bp.route("/api/helplines")
@limiter.limit("30 per minute")
def get_helplines_route():
    """Return the helpline directory, served from Postgres (seeded from
    data/helplines.json on startup) and falling back to that file
    directly if no database is configured. Optional ?crisisType= scopes
    to one hazard page (e.g. 'bushfire'); optional ?serviceType= filters
    to a single service type (e.g. 'Emergency')."""
    try:
        crisis_type = request.args.get("crisisType", "").strip()
        service_type = request.args.get("serviceType", "").strip()
        records = get_helplines(crisis_type, service_type)
        return jsonify({
            "records": records,
            "metadata": {
                "version": "1.0",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "ShieldAhead helpline directory",
            },
        })
    except Exception as e:
        _flask_app().logger.error(f"Unexpected error in /api/helplines: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500


@helplines_bp.route("/api/checklist")
@limiter.limit("30 per minute")
def get_checklist_route():
    """Return the pre-crisis checklist, served from Postgres (seeded
    from data/pre_crisis_checklist.json on startup) and falling back to
    that file directly if no database is configured. Optional
    ?crisisType= filters to one crisis kind (e.g. 'bushfire', 'flood',
    'power-outage')."""
    try:
        crisis_type = request.args.get("crisisType", "").strip()
        records = get_checklist_items(crisis_type)
        return jsonify({
            "records": records,
            "metadata": {
                "version": "1.0",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "ShieldAhead pre-crisis checklist",
            },
        })
    except Exception as e:
        _flask_app().logger.error(f"Unexpected error in /api/checklist: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500
