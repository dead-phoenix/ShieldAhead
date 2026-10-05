import { useEffect, useRef, useState } from 'react'

// The Web Speech API isn't in TypeScript's standard DOM lib (still
// non-standard/vendor-prefixed), so these are the minimal shapes this hook
// actually uses, not a full type definition.
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>
  resultIndex: number
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

// event.error codes per the Web Speech API spec — surfacing the real
// reason instead of one generic message, since "no-speech" (stayed
// silent), "not-allowed" (mic permission blocked) and "network" (Chrome's
// recognizer calls out to Google's servers, so this fires when offline
// or blocked by a firewall) all need different advice.
function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return 'Microphone access is blocked. Allow microphone access for this site in your browser settings, then try again.'
    case 'no-speech':
      return "We didn't catch that. Tap the microphone and try speaking again."
    case 'audio-capture':
      return 'No microphone was found. Check that a microphone is connected and try again.'
    case 'network':
      return 'Voice input needs an internet connection to work. Check your connection and try again, or type your question instead.'
    default:
      return 'We could not hear you clearly. Try again or type your question instead.'
  }
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export interface UseSpeechInputResult {
  /** False in browsers without any speech recognition support (e.g. Firefox) — callers should hide the mic button rather than show one that can't work. */
  isSupported: boolean
  isListening: boolean
  error: string
  start: () => void
  stop: () => void
}

/**
 * Wraps the browser's built-in speech-to-text (no API key, no network
 * call, nothing sent off-device beyond what the browser itself does) for
 * a single free-text field. Calls onResult with the running transcript as
 * the person speaks (isFinal=false) and once more when they stop
 * (isFinal=true) — the caller decides what to do with each, e.g. filling
 * a search box live vs. only acting once isFinal.
 */
export function useSpeechInput(onResult: (transcript: string, isFinal: boolean) => void, lang = 'en-AU'): UseSpeechInputResult {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => () => recognitionRef.current?.stop(), [])

  function start() {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
    if (!SpeechRecognitionCtor) {
      setError('Voice input is not supported in this browser. Try typing your question instead.')
      return
    }
    setError('')
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onresult = (event) => {
      let transcript = ''
      let isFinal = false
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        transcript += result[0].transcript
        if (result.isFinal) isFinal = true
      }
      onResultRef.current(transcript, isFinal)
    }
    recognition.onerror = (event) => {
      // "aborted" fires when stop() was called deliberately (e.g. the
      // person tapped the mic again to cancel) — not a real failure.
      if (event.error !== 'aborted') setError(describeSpeechError(event.error))
      setIsListening(false)
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  function stop() {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  return { isSupported: Boolean(getSpeechRecognitionConstructor()), isListening, error, start, stop }
}
