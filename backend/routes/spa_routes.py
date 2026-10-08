from pathlib import Path
from flask import Blueprint, jsonify, send_from_directory


spa_bp = Blueprint("spa", __name__)


def frontend_dist_path():
    return Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@spa_bp.route("/", defaults={"path": ""})
@spa_bp.route("/<path:path>")
def spa(path):
    dist = frontend_dist_path()
    if not dist.is_dir():
        return jsonify({"error": "Not found"}), 404
    file_path = dist / path
    if path and file_path.is_file():
        response = send_from_directory(dist, path)
        if path == "sw.js":
            # Browsers already cap sw.js caching at 24h regardless of
            # headers, but an explicit no-cache means an update is picked
            # up on the very next load instead of waiting on that cap.
            response.headers["Cache-Control"] = "no-cache"
        return response
    # A missing build asset must 404, not silently fall through to
    # index.html — serving HTML under a stale .js/.css URL lets the
    # service worker cache an HTML response as if it were that script,
    # which then fails to execute on the next load.
    if path.startswith("assets/"):
        return jsonify({"error": "Not found"}), 404
    index = dist / "index.html"
    if index.is_file():
        return send_from_directory(dist, "index.html")
    return jsonify({"error": "Not found"}), 404
