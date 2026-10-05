// Generous enough to survive the backend's own worker timeout (gunicorn
// --timeout 120 in the Dockerfile) plus a slow first request after a
// deploy, which also has to download the ~145MB model from scratch since
// Render's free tier wipes the disk on every deploy/restart.
const VOICE_TRANSCRIBE_TIMEOUT_MS = 110_000

export const VOICE_TRANSCRIBE_ERROR = {
  empty: "We couldn't hear anything. Try again or type your question instead.",
  tooLarge: 'That recording is too long. Try a shorter clip.',
  rateLimited: 'Too many voice requests, please wait a moment and try again.',
  unavailable: 'Voice transcription is temporarily unavailable. Try again or type your question instead.',
  timeout: 'Voice transcription is taking too long. Try again or type your question instead.',
  unreachable: 'We could not reach the server. Check your connection and try again.',
  generic: 'Could not transcribe audio. Try again or type your question instead.',
} as const

function apiUrl(): URL {
  const configuredOrigin = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
  const origin = configuredOrigin || window.location.origin
  return new URL('/api/voice/transcribe', `${origin}/`)
}

function messageForStatus(status: number): string {
  if (status === 400) return VOICE_TRANSCRIBE_ERROR.empty
  if (status === 413) return VOICE_TRANSCRIBE_ERROR.tooLarge
  if (status === 429) return VOICE_TRANSCRIBE_ERROR.rateLimited
  if (status >= 500) return VOICE_TRANSCRIBE_ERROR.unavailable
  return VOICE_TRANSCRIBE_ERROR.generic
}

/** Sends a recorded voice clip to this app's own backend for transcription
 * (server-side Whisper) — the audio never reaches any third-party speech
 * service. */
export async function transcribeVoiceClip(audio: Blob): Promise<string> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), VOICE_TRANSCRIBE_TIMEOUT_MS)
  const formData = new FormData()
  formData.append('audio', audio, 'clip.webm')

  try {
    const response = await fetch(apiUrl(), {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(messageForStatus(response.status))
    const payload = await response.json() as { text?: unknown }
    return typeof payload.text === 'string' ? payload.text.trim() : ''
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      throw new Error(VOICE_TRANSCRIBE_ERROR.timeout, { cause: reason })
    }
    if (reason instanceof TypeError) {
      throw new Error(VOICE_TRANSCRIBE_ERROR.unreachable, { cause: reason })
    }
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
}
