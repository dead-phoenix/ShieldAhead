import { MagnifyingGlass, Microphone } from '@phosphor-icons/react'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus'
import { useVoiceInput } from '../../../shared/hooks/useVoiceInput'
import { matchCrisisKind, matchCrisisStage, SUGGESTED_CRISIS_QUERIES } from '../matchCrisisQuery'
import { matchNavigationIntent, offlineNavigationTarget } from '../matchNavigationIntent'

// Shared by the home and pre-crisis pages. Page destinations (wifi,
// hospitals, charities, the emergency pack, …) are checked before hazards,
// so "fire station" goes to the Map rather than being read as a bushfire
// question. Voice transcripts run the same check automatically.
export function CrisisQuerySearch({ variant = 'crisis' }: { variant?: 'crisis' | 'home' }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const hideSuggestionsTimer = useRef<number | undefined>(undefined)
  const isOnline = useOnlineStatus()
  const voice = useVoiceInput((transcript) => {
    setQuery(transcript)
    runSearch(transcript)
  })

  function goToHazard(kind: NonNullable<ReturnType<typeof matchCrisisKind>>, text: string) {
    setSearchError('')
    setShowSuggestions(false)
    const stage = matchCrisisStage(text)
    navigate(appRoutes.crisisGuidance(kind), stage ? { state: { stage } } : undefined)
  }

  function runSearch(text: string) {
    const destination = matchNavigationIntent(text)
    if (destination) {
      setSearchError('')
      setShowSuggestions(false)
      navigate(offlineNavigationTarget(destination, isOnline))
      return
    }
    const kind = matchCrisisKind(text)
    if (!kind) {
      setSearchError("We couldn't match that. Try \"wifi\", \"hospital\", \"charities\", or \"emergency pack\", or choose a hazard below.")
      return
    }
    goToHazard(kind, text)
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runSearch(query)
  }

  function selectSuggestion(suggestion: string) {
    setQuery(suggestion)
    const kind = matchCrisisKind(suggestion)
    if (kind) goToHazard(kind, suggestion)
  }

  // A brief delay (rather than hiding on blur immediately) so a click on a
  // suggestion button registers before the dropdown disappears — blur
  // fires before the button's own click event otherwise.
  function handleBlur() {
    hideSuggestionsTimer.current = window.setTimeout(() => setShowSuggestions(false), 150)
  }

  function handleFocus() {
    if (hideSuggestionsTimer.current) window.clearTimeout(hideSuggestionsTimer.current)
    setShowSuggestions(true)
  }

  return (
    <form className={`crisis-query-search${variant === 'home' ? ' crisis-query-search--home' : ''}`} onSubmit={handleSearch}>
      <label htmlFor="crisis-query-input">{variant === 'home' ? 'Ask a question or where you want to go' : 'Ask a question, e.g. &quot;How should I prepare for bushfire&quot;'}</label>
      <div className="crisis-query-search__row">
        <input
          id="crisis-query-input"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="How should I prepare for bushfire?"
          type="text"
          value={query}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="crisis-query-suggestions"
          aria-expanded={showSuggestions}
        />
        {voice.isSupported ? (
          <button
            aria-label={voice.isRecording ? 'Stop and transcribe' : !isOnline ? 'Ask by voice (needs an internet connection)' : 'Ask by voice'}
            aria-pressed={voice.isRecording}
            className={`crisis-query-search__mic${voice.isRecording ? ' is-listening' : ''}`}
            onClick={() => (voice.isRecording ? voice.stop() : voice.start())}
            disabled={voice.isTranscribing || !isOnline}
            type="button"
          >
            <Microphone aria-hidden="true" size={18} />
          </button>
        ) : null}
        <button className="button button--primary" type="submit">
          <MagnifyingGlass aria-hidden="true" size={18} /> Search
        </button>
      </div>
      {voice.isRecording ? (
        <p className="crisis-query-search__status" role="status">Listening… tap the microphone again when you're done</p>
      ) : voice.isTranscribing ? (
        <p className="crisis-query-search__status" role="status">Transcribing…</p>
      ) : null}
      {voice.error ? <p className="crisis-query-search__error" role="alert">{voice.error}</p> : null}
      {showSuggestions ? (
        <div className="crisis-query-search__suggestions" id="crisis-query-suggestions" role="listbox" aria-label="Example questions">
          {SUGGESTED_CRISIS_QUERIES.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              onClick={() => selectSuggestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      {searchError ? <p className="crisis-query-search__error" role="alert">{searchError}</p> : null}
    </form>
  )
}
