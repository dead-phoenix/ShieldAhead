import io

from flask import Blueprint, jsonify, request

from extensions import limiter
from services.whisper_service import transcribe_audio

voice_bp = Blueprint("voice", __name__)

# Generous for a single spoken question, small enough to not let one request
# tie up the server's limited CPU for too long.
MAX_AUDIO_BYTES = 10 * 1024 * 1024


def _flask_app():
    from extensions import app
    return app


@voice_bp.route("/api/voice/transcribe", methods=["POST"])
@limiter.limit("10 per minute")
def transcribe():
    """Transcribes an uploaded voice clip to text using an on-device
    (server-side) Whisper model — no audio or text is sent to any
    third-party speech service."""
    audio_file = request.files.get("audio")
    if audio_file is None:
        return jsonify({"error": "audio file is required"}), 400

    audio_bytes = audio_file.read()
    if not audio_bytes:
        return jsonify({"error": "audio file is empty"}), 400
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return jsonify({"error": "audio file is too large"}), 413

    try:
        text = transcribe_audio(io.BytesIO(audio_bytes))
    except Exception as e:
        _flask_app().logger.error(f"Unexpected error in /api/voice/transcribe: {e}")
        return jsonify({
            "error": "Could not transcribe audio. Please try again or type your question instead."
        }), 500

    return jsonify({"text": text})
