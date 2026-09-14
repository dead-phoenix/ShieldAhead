import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { gsap } from 'gsap'
import { Link } from 'react-router-dom'
import './AccordionGallery.css'

export type AccordionGalleryItem = {
  image: string
  alt: string
  label: string
  description: string
  link: string
}

type AccordionGalleryProps = {
  items: AccordionGalleryItem[]
  defaultIndex?: number
  expandRatio?: number
  trigger?: 'hover' | 'click'
  onActiveChange?: (index: number) => void
}

export function AccordionGallery({ items, defaultIndex = 0, expandRatio = 0.56, trigger = 'hover', onActiveChange }: AccordionGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const mediaRefs = useRef<(HTMLSpanElement | null)[]>([])
  const firstRunRef = useRef(true)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const [active, setActive] = useState(Math.min(Math.max(defaultIndex, 0), items.length - 1))

  const applyLayout = useCallback((animate: boolean) => {
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = animate && !reducedMotion ? 0.38 : 0
    const ratio = Math.min(Math.max(expandRatio, 0.35), 0.72)
    const grow = items.length > 1 ? (ratio * (items.length - 1)) / (1 - ratio) : 1

    timelineRef.current?.kill()
    const timeline = gsap.timeline()
    panelRefs.current.forEach((panel, index) => {
      if (!panel) return
      const isActive = index === active
      timeline.to(panel, { flexGrow: isActive ? grow : 1, rotateX: reducedMotion || isActive ? 0 : index < active ? 1.25 : -1.25, duration, ease: 'power3.out' }, 0)
      const media = mediaRefs.current[index]
      if (media) timeline.to(media, { xPercent: -50, yPercent: -50, y: isActive ? 0 : (active - index) * 10, filter: isActive ? 'grayscale(0)' : 'grayscale(0.35)', duration, ease: 'power3.out' }, 0)
    })
    timelineRef.current = timeline
  }, [active, expandRatio, items.length])

  useEffect(() => {
    applyLayout(!firstRunRef.current)
    firstRunRef.current = false
    return () => { timelineRef.current?.kill() }
  }, [applyLayout])

  useEffect(() => {
    onActiveChange?.(active)
  }, [active, onActiveChange])

  function handleClick(index: number, event: MouseEvent<HTMLAnchorElement>) {
    if (index !== active) {
      event.preventDefault()
      setActive(index)
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index + 1) % items.length)
      panelRefs.current[(index + 1) % items.length]?.focus()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = (index - 1 + items.length) % items.length
      setActive(next)
      panelRefs.current[next]?.focus()
    }
  }

  return (
    <div className="accordion-gallery" ref={rootRef} role="region" aria-label="Preparation topics" style={{ '--ag-count': items.length } as CSSProperties}>
      {items.map((item, index) => {
        const isActive = index === active
        return (
          <Link
            aria-current={isActive ? 'true' : undefined}
            aria-label={`${item.label}. ${item.description}`}
            className={`ag-panel${isActive ? ' ag-panel--active' : ''}`}
            key={item.link}
            onClick={(event) => handleClick(index, event)}
            onFocus={() => setActive(index)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onMouseEnter={() => { if (trigger === 'hover') setActive(index) }}
            ref={(element) => { panelRefs.current[index] = element }}
            to={item.link}
          >
            <span className="ag-panel__media" ref={(element) => { mediaRefs.current[index] = element }}><img alt={item.alt} draggable="false" src={item.image} /></span>
            <span className="ag-panel__overlay" aria-hidden="true" />
            <span className="ag-panel__content">
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              <span className="ag-panel__action">View preparation page <ArrowRight aria-hidden="true" size={19} weight="bold" /></span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
