import { useEffect, useRef, useState } from 'react'
import { transcribeVoiceClip } from '../../data/api/voiceApi'
import { startVoiceRecording, type VoiceRecording } from '../voice/voiceRecorder'

export interface UseVoiceInputResult {
  /** False when the browser lacks microphone/recording APIs — callers
   * should hide the mic button rather than show one that can't work. */
  isSupported: boolean
  isRecording: boolean
  isTranscribing: boolean
  error: string
  start: () => void
  stop: () => void
}

function isSupportedEnvironment(): boolean {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined'
}

/** Free speech-to-text via Whisper (MIT licensed), run on this app's own
 * backend — no account, API key, or audio/text sent to any commercial
 * speech service. */
export function useVoiceInput(onResult: (transcript: string) => void): UseVoiceInputResult {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState('')
  const recordingRef = useRef<VoiceRecording | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => () => {
    // Release the microphone if the component unmounts mid-recording;
    // the resulting clip is discarded, nothing needs to be transcribed.
    recordingRef.current?.stop()
  }, [])

  async function start() {
    if (!isSupportedEnvironment()) {
      setError('Voice input is not supported in this browser. Try typing your question instead.')
      return
    }
    setError('')
    try {
      recordingRef.current = await startVoiceRecording()
      setIsRecording(true)
    } catch {
      setError('We could not access your microphone. Check permissions and try again.')
    }
  }

  async function stop() {
    const recording = recordingRef.current
    if (!recording) return
    recordingRef.current = null
    setIsRecording(false)
    setIsTranscribing(true)

    try {
      const clip = await recording.stop()
      const text = await transcribeVoiceClip(clip)
      if (text) onResultRef.current(text)
      else setError("We couldn't hear anything. Try again or type your question instead.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Voice transcription failed. Try again or type your question instead.')
    } finally {
      setIsTranscribing(false)
    }
  }

  return {
    isSupported: isSupportedEnvironment(),
    isRecording,
    isTranscribing,
    error,
    start: () => void start(),
    stop: () => void stop(),
  }
}
