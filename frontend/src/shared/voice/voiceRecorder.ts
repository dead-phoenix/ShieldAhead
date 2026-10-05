export interface VoiceRecording {
  /** Stops recording and resolves with the captured clip, in whatever
   * container MediaRecorder produced (webm/opus where supported) — the
   * backend's Whisper decoder reads it directly, so no client-side
   * decoding or resampling is needed. */
  stop: () => Promise<Blob>
}

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

/** Starts recording the microphone via MediaRecorder. Requests mic access
 * itself, so the browser's permission prompt appears the first time this
 * runs. */
export async function startVoiceRecording(): Promise<VoiceRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickSupportedMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: BlobPart[] = []
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  })
  recorder.start()

  return {
    stop: () => new Promise<Blob>((resolve) => {
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop())
        resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
      }, { once: true })
      recorder.stop()
    }),
  }
}
