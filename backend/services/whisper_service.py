import logging
import threading

logger = logging.getLogger(__name__)

# English-only, int8-quantized. tiny.en (75MB) was noticeably prone to
# mis-hearing or inventing text — same issue hit with the client-side
# version earlier — base.en (145MB) is the standard "good enough to
# actually use" tier while still being light enough for a constrained
# server. small.en (484MB) is a much bigger jump and likely too much for
# a 512MB-RAM tier alongside the rest of the Flask app.
WHISPER_MODEL_SIZE = "base.en"

_model = None
_model_lock = threading.Lock()


def _get_model():
    """Loads the faster-whisper model on first use and reuses it after —
    loading happens here (not at import time) so it doesn't add startup
    latency/memory to every process that imports this module, only the one
    that actually serves a transcription request."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel
                logger.info("Loading faster-whisper model '%s'...", WHISPER_MODEL_SIZE)
                _model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


def transcribe_audio(audio_file) -> str:
    """Transcribes a recorded voice clip to text, entirely on this server —
    no audio or text is sent to any third-party speech service. Accepts any
    format faster-whisper's bundled decoder can read (webm, ogg, wav, ...)."""
    model = _get_model()
    # beam_size=5 (faster-whisper's default) trades a bit of latency for
    # meaningfully fewer mis-heard words than beam_size=1 — worth it for a
    # single short clip at a time.
    segments, _info = model.transcribe(audio_file, language="en", beam_size=5)
    return " ".join(segment.text.strip() for segment in segments).strip()
