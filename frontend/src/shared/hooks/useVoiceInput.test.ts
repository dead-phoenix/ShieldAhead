import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceInput } from './useVoiceInput'

vi.mock('../voice/voiceRecorder', () => ({
  startVoiceRecording: vi.fn(),
}))
vi.mock('../../data/api/voiceApi', () => ({
  transcribeVoiceClip: vi.fn(),
}))

const { startVoiceRecording } = await import('../voice/voiceRecorder')
const { transcribeVoiceClip } = await import('../../data/api/voiceApi')

function stubSupportedEnvironment() {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  })
  vi.stubGlobal('MediaRecorder', class {})
}

function stubStartRecording(clip: Blob = new Blob(['audio'])) {
  const stopRecording = vi.fn().mockResolvedValue(clip)
  vi.mocked(startVoiceRecording).mockResolvedValue({ stop: stopRecording })
  return { stopRecording }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useVoiceInput', () => {
  it('reports unsupported when the browser lacks the required APIs', () => {
    Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: undefined })
    const { result } = renderHook(() => useVoiceInput(vi.fn()))
    expect(result.current.isSupported).toBe(false)
  })

  it('fills the result once the backend returns a transcription', async () => {
    stubSupportedEnvironment()
    stubStartRecording()
    vi.mocked(transcribeVoiceClip).mockResolvedValue('How do I prepare for bushfire')
    const onResult = vi.fn()
    const { result } = renderHook(() => useVoiceInput(onResult))

    await act(async () => { result.current.start() })
    await waitFor(() => expect(result.current.isRecording).toBe(true))

    await act(async () => { result.current.stop() })

    await waitFor(() => expect(onResult).toHaveBeenCalledWith('How do I prepare for bushfire'))
    expect(result.current.isTranscribing).toBe(false)
    expect(result.current.isRecording).toBe(false)
  })

  it('surfaces the backend error message when transcription fails', async () => {
    stubSupportedEnvironment()
    stubStartRecording()
    vi.mocked(transcribeVoiceClip).mockRejectedValue(new Error('Too many voice requests, please wait a moment and try again.'))
    const { result } = renderHook(() => useVoiceInput(vi.fn()))

    await act(async () => { result.current.start() })
    await waitFor(() => expect(result.current.isRecording).toBe(true))
    await act(async () => { result.current.stop() })

    await waitFor(() => expect(result.current.error).toBe('Too many voice requests, please wait a moment and try again.'))
    expect(result.current.isTranscribing).toBe(false)
  })

  it('surfaces a fallback error when the backend returns empty text', async () => {
    stubSupportedEnvironment()
    stubStartRecording()
    vi.mocked(transcribeVoiceClip).mockResolvedValue('')
    const onResult = vi.fn()
    const { result } = renderHook(() => useVoiceInput(onResult))

    await act(async () => { result.current.start() })
    await waitFor(() => expect(result.current.isRecording).toBe(true))
    await act(async () => { result.current.stop() })

    await waitFor(() => expect(result.current.error).toContain("couldn't hear anything"))
    expect(onResult).not.toHaveBeenCalled()
  })

  it('surfaces a permission error when the microphone cannot be accessed', async () => {
    stubSupportedEnvironment()
    vi.mocked(startVoiceRecording).mockRejectedValue(new Error('NotAllowedError'))
    const { result } = renderHook(() => useVoiceInput(vi.fn()))

    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.error).toContain('could not access your microphone'))
    expect(result.current.isRecording).toBe(false)
  })
})
