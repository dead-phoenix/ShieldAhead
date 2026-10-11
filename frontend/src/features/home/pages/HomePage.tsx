import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowRight, Check, FireTruck, Heart, MapPin, WifiHigh } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { appRoutes } from '../../../app/config/product'
import { CrisisQuerySearch } from '../../crisis/components/CrisisQuerySearch'
import { LazyLoadBoundary } from '../../../shared/components/LazyLoadBoundary'
import './HomePage.css'

const HomeStaticMap = lazy(async () => {
  const module = await import('./HomeStaticMap')
  return { default: module.HomeStaticMap }
})

const HERO_PHOTOS = [
  '/images/victorian-coastline.jpg',
  '/images/wildflower-grassland.jpg',
  '/images/canola-field.jpg',
  '/images/outback-scrub.jpg',
]
const HERO_PHOTO_INTERVAL_MS = 6000

/** Cycles through HERO_PHOTOS on a timer, crossfaded in CSS by toggling
 * which image has the is-active class. Stays on the first photo for
 * anyone who prefers reduced motion, rather than auto-playing regardless. */
function useHeroPhotoIndex(): number {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (HERO_PHOTOS.length <= 1) return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % HERO_PHOTOS.length),
      HERO_PHOTO_INTERVAL_MS,
    )
    return () => window.clearInterval(timer)
  }, [])

  return index
}

const hazardPictures = [
  {
    kind: 'bushfire' as const,
    label: 'Bushfire',
    image: '/images/crisis/bushfire.webp',
  },
  {
    kind: 'flood' as const,
    label: 'Flood',
    image: '/images/crisis/flood.webp',
  },
  {
    kind: 'power-outage' as const,
    label: 'Power outage',
    image: '/images/crisis/power-outage.webp',
  },
]

const mapPins = [
  { label: 'Location', icon: MapPin },
  { label: 'Bushfire', icon: FireTruck },
  { label: 'Wi-Fi', icon: WifiHigh },
  { label: 'Support', icon: Heart },
]

function HomeMapPreview() {
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return
    setShowMap(true)
  }, [])

  return (
    <div className="home-map">
      <img
        className="home-map__photo"
        src="/images/state-library-victoria.webp"
        alt="The entrance of the State Library Victoria in Melbourne"
      />
      {showMap ? (
        <LazyLoadBoundary fallback={null}>
          <Suspense fallback={null}>
            <HomeStaticMap />
          </Suspense>
        </LazyLoadBoundary>
      ) : null}
      <ul className="home-map__pins" aria-hidden="true">
        {mapPins.map((pin) => (
          <li key={pin.label}>
            <pin.icon size={26} weight="fill" />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HomePage() {
  const activePhotoIndex = useHeroPhotoIndex()
  return (
    <div className="landing-page landing-page--focused home-page">
      <section className="home-hero" aria-labelledby="home-title">
        {HERO_PHOTOS.map((photo, index) => (
          <img
            className={`home-hero__photo${index === activePhotoIndex ? ' is-active' : ''}`}
            key={photo}
            src={photo}
            alt=""
            aria-hidden="true"
          />
        ))}
        <h1 id="home-title">
          Shield Ahead.
          <br />
          Before it happens.
        </h1>
        <p>Practical crisis preparedness for people across Victoria.</p>
        <CrisisQuerySearch variant="home" />
        <Link className="button landing-action landing-action--primary" to={appRoutes.crisis}>
          <span>Prepare for a crisis</span>
        </Link>
      </section>

      <section className="home-help" aria-labelledby="home-help-title">
        <HomeMapPreview />
        <h2 id="home-help-title">Find help near you</h2>
        <p>Essential services at a glance.</p>
        <Link className="button landing-action landing-action--secondary" to={appRoutes.map}>
          <span>Explore the map</span>
          <ArrowRight aria-hidden="true" size={17} weight="bold" />
        </Link>
        <Link className="button landing-action landing-action--secondary" to={appRoutes.nearby}>
          <span>Saved nearby services (works offline)</span>
          <ArrowRight aria-hidden="true" size={17} weight="bold" />
        </Link>
        <Link className="button landing-action landing-action--secondary" to={appRoutes.saved}>
          <span>Your saved places (works offline)</span>
          <ArrowRight aria-hidden="true" size={17} weight="bold" />
        </Link>
      </section>

      <section className="home-ahead" aria-labelledby="home-ahead-title">
        <h2 id="home-ahead-title">Prepare for what&apos;s ahead</h2>
        <ul className="home-ahead__hazards">
          {hazardPictures.map((hazard) => (
            <li key={hazard.kind}>
              <Link to={appRoutes.crisisDetail(hazard.kind)}>
                <img src={hazard.image} alt="" />
                <span>{hazard.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="button landing-action landing-action--secondary" to={appRoutes.crisis}>
          <span>View checklists</span>
          <ArrowRight aria-hidden="true" size={17} weight="bold" />
        </Link>
      </section>

      <section className="home-offline" aria-labelledby="home-offline-title">
        <h2 id="home-offline-title">Works offline</h2>
        <p>Your saved information stays available when connectivity doesn&apos;t.</p>
        <span className="home-offline__mark" aria-hidden="true">
          <Check size={36} weight="bold" />
        </span>
      </section>
    </div>
  )
}
