import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CrisisLandingPage } from './CrisisLandingPage'

const voiceMocks = vi.hoisted(() => ({
  useVoiceInput: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
}))

vi.mock('../../../shared/hooks/useVoiceInput', () => ({
  useVoiceInput: voiceMocks.useVoiceInput,
}))

vi.mock('../../../shared/hooks/useOnlineStatus', () => ({
  useOnlineStatus: voiceMocks.useOnlineStatus,
}))

function stubVoice(overrides: Partial<ReturnType<typeof defaultVoiceState>> = {}) {
  const state = { ...defaultVoiceState(), ...overrides }
  voiceMocks.useVoiceInput.mockReturnValue(state)
  return state
}

function defaultVoiceState() {
  return {
    isSupported: true,
    isRecording: false,
    isTranscribing: false,
    error: '',
    start: vi.fn(),
    stop: vi.fn(),
  }
}

function renderPage() {
  return render(<MemoryRouter><CrisisLandingPage /></MemoryRouter>)
}

afterEach(() => {
  vi.clearAllMocks()
  voiceMocks.useOnlineStatus.mockReturnValue(true)
})

describe('CrisisLandingPage voice input', () => {
  it('hides the microphone button when voice input is not supported', () => {
    stubVoice({ isSupported: false })
    renderPage()

    expect(screen.queryByRole('button', { name: 'Ask by voice' })).not.toBeInTheDocument()
  })

  it('starts recording when the mic button is pressed', () => {
    const voice = stubVoice()
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Ask by voice' }))

    expect(voice.start).toHaveBeenCalledTimes(1)
  })

  it('shows a listening status and stops recording when pressed again', () => {
    const voice = stubVoice({ isRecording: true })
    renderPage()

    const micButton = screen.getByRole('button', { name: 'Stop and transcribe' })
    expect(micButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Listening…/)).toBeVisible()

    fireEvent.click(micButton)
    expect(voice.stop).toHaveBeenCalledTimes(1)
  })

  it('shows transcribing status and disables the mic button while processing', () => {
    stubVoice({ isTranscribing: true })
    renderPage()

    expect(screen.getByText('Transcribing…')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ask by voice' })).toBeDisabled()
  })

  it('surfaces a voice error distinctly from the search-match error', () => {
    stubVoice({ error: 'We could not access your microphone. Check permissions and try again.' })
    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent('We could not access your microphone.')
  })

  it('disables the mic button when offline, since transcription needs a connection', () => {
    voiceMocks.useOnlineStatus.mockReturnValue(false)
    stubVoice()
    renderPage()

    expect(screen.getByRole('button', { name: /needs an internet connection/ })).toBeDisabled()
  })
})
