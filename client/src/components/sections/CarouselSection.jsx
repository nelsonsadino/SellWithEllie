import { useCallback, useEffect, useId, useRef, useState } from 'react'
import SmartLink from '../SmartLink'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// A configurable banner carousel. Each slide is { image, heading, text,
// buttonLabel, buttonHref }; `autoplay` is seconds between slides (0 = off).
// Auto-advance pauses on hover/focus and is disabled under reduced-motion.
export default function CarouselSection({ data = {} }) {
  const slides = (Array.isArray(data.slides) ? data.slides : []).filter(
    (s) => s && (s.image || s.heading || s.text)
  )
  const autoplay = Number(data.autoplay) || 0
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const rootRef = useRef(null)
  const labelId = useId()

  const count = slides.length
  const hasImages = slides.some((s) => s.image)

  const go = useCallback((n) => setIndex((i) => ((n % count) + count) % count), [count])
  const next = useCallback(() => go(index + 1), [go, index])
  const prev = useCallback(() => go(index - 1), [go, index])

  useEffect(() => {
    if (autoplay <= 0 || count < 2 || paused || prefersReducedMotion()) return undefined
    const id = setInterval(() => setIndex((i) => (i + 1) % count), autoplay * 1000)
    return () => clearInterval(id)
  }, [autoplay, count, paused])

  if (count === 0) return null

  return (
    <section className="container section-block">
      <div
        className={`carousel ${hasImages ? '' : 'no-images'}`}
        ref={rootRef}
        role="region"
        aria-roledescription="carousel"
        aria-labelledby={labelId}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget)) setPaused(false)
        }}
        onKeyDown={(e) => {
          if (count < 2) return
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            next()
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            prev()
          }
        }}
      >
        <span id={labelId} className="visually-hidden" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Featured
        </span>

        <div className="carousel-viewport">
          <div className="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
            {slides.map((slide, i) => (
              <div
                className={`carousel-slide ${slide.image ? '' : 'no-img'}`}
                key={i}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                aria-hidden={i !== index}
              >
                {slide.image && (
                  <img
                    className="carousel-slide-img"
                    src={slide.image}
                    alt=""
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                )}
                <div className="carousel-slide-body">
                  {slide.heading && <h3>{slide.heading}</h3>}
                  {slide.text && <p>{slide.text}</p>}
                  {slide.buttonLabel && (
                    <SmartLink
                      to={slide.buttonHref || '/products'}
                      className="btn btn-primary"
                      tabIndex={i === index ? 0 : -1}
                    >
                      {slide.buttonLabel}
                    </SmartLink>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {count > 1 && (
          <>
            <button type="button" className="carousel-arrow prev" onClick={prev} aria-label="Previous slide">
              ‹
            </button>
            <button type="button" className="carousel-arrow next" onClick={next} aria-label="Next slide">
              ›
            </button>
            <div className="carousel-dots">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`carousel-dot ${i === index ? 'is-active' : ''}`}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
