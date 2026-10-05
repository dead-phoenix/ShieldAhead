import { MagnifyingGlass, Microphone } from '@phosphor-icons/react'
import { lazy, Suspense, useCallback, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { useVoiceInput } from '../../../shared/hooks/useVoiceInput'
import { crisisContent } from '../crisisContent'
import { matchCrisisKind, matchCrisisStage, SUGGESTED_CRISIS_QUERIES } from '../matchCrisisQuery'

const AccordionGallery = lazy(() => import('../../../shared/components/AccordionGallery').then((module) => ({ default: module.AccordionGallery })))

export function CrisisLandingPage() {
  const [activeHazard, setActiveHazard] = useState(1)
  const handleActiveHazardChange = useCallback((index: number) => setActiveHazard(index), [])
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const hideSuggestionsTimer = useRef<number | undefined>(undefined)
  const voice = useVoiceInput((transcript) => {
    setQuery(transcript)
    setSearchError('')
  })

  function goToMatch(kind: NonNullable<ReturnType<typeof matchCrisisKind>>, q: string) {
    setSearchError('')
    setShowSuggestions(false)
    const stage = matchCrisisStage(q)
    navigate(appRoutes.crisisGuidance(kind), stage ? { state: { stage } } : undefined)
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const kind = matchCrisisKind(query)
    if (!kind) {
      setSearchError("We couldn't match that to bushfire, flood, or power outage guidance. Choose a hazard below instead.")
      return
    }
    goToMatch(kind, query)
  }

  function selectSuggestion(suggestion: string) {
    setQuery(suggestion)
    const kind = matchCrisisKind(suggestion)
    if (kind) goToMatch(kind, suggestion)
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
    <section className="content-page crisis-page" aria-labelledby="crisis-title">
      <div className="crisis-page__backdrop" aria-hidden="true">
        {crisisContent.map((item, index) => (
          <img
            alt=""
            className={index === activeHazard ? 'is-active' : undefined}
            key={item.kind}
            src={`/images/crisis/${item.kind}.webp`}
          />
        ))}
      </div>
      <header className="crisis-intro">
        <div><h1 id="crisis-title">Pre-crisis guidance</h1><p>Choose a hazard to review its preparation page and household checklist before an emergency occurs.</p></div>
      </header>
      <form className="crisis-query-search" onSubmit={handleSearch}>
        <label htmlFor="crisis-query-input">Ask a question, e.g. &quot;How should I prepare for bushfire&quot;</label>
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
              aria-label={voice.isRecording ? 'Stop and transcribe' : 'Ask by voice'}
              aria-pressed={voice.isRecording}
              className={`crisis-query-search__mic${voice.isRecording ? ' is-listening' : ''}`}
              onClick={() => (voice.isRecording ? voice.stop() : voice.start())}
              disabled={voice.isTranscribing}
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
      <Suspense fallback={<p className="crisis-gallery-loading" role="status">Loading preparation topics…</p>}>
        <AccordionGallery
          defaultIndex={1}
          expandRatio={0.5}
          items={crisisContent.map((item) => ({
            image: `/images/crisis/${item.kind}.webp`,
            alt: item.kind === 'bushfire' ? 'Smoke rising over a bushfire area' : item.kind === 'flood' ? 'Floodwater covering a road' : 'A dark home during a power outage',
            label: item.title,
            description: item.summary,
            link: appRoutes.crisisDetail(item.kind),
          }))}
          onActiveChange={handleActiveHazardChange}
          trigger="hover"
        />
      </Suspense>
    </section>
  )
}
