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
        return send_from_directory(dist, path)
    index = dist / "index.html"
    if index.is_file():
        return send_from_directory(dist, "index.html")
    return jsonify({"error": "Not found"}), 404
