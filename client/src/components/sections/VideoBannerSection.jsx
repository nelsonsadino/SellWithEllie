import { useEffect, useState } from 'react'
import SmartLink from '../SmartLink'

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

// A full-bleed autoplaying background video with optional copy on top. The
// clip is a shop-supplied asset (uploaded, or a pasted URL). Always muted +
// looping + inline; visitors who prefer reduced motion get the still poster
// instead of a moving picture.
export default function VideoBannerSection({ data = {} }) {
  const { videoUrl, posterUrl, heading, text, buttonLabel, buttonHref } = data
  const height = ['short', 'tall', 'full'].includes(data.height) ? data.height : 'tall'
  const overlay = Math.max(0, Math.min(80, Number(data.overlay) || 0))
  const reduce = usePrefersReducedMotion()
  const hasCopy = heading || text || buttonLabel

  if (!videoUrl && !posterUrl) {
    return (
      <section className="video-banner is-empty">
        <p>Add a video (mp4 or webm) to this block.</p>
      </section>
    )
  }

  return (
    <section className={`video-banner is-${height}`}>
      <div className="video-banner-media">
        {videoUrl && !reduce ? (
          <video
            className="video-banner-video"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster={posterUrl || undefined}
          >
            <source src={videoUrl} />
          </video>
        ) : posterUrl ? (
          <img className="video-banner-poster" src={posterUrl} alt="" loading="lazy" />
        ) : null}
        <span className="video-banner-scrim" style={{ opacity: overlay / 100 }} />
      </div>

      {hasCopy && (
        <div className="video-banner-inner">
          {heading && <h2 className="video-banner-heading">{heading}</h2>}
          {text && <p className="video-banner-text">{text}</p>}
          {buttonLabel && (
            <SmartLink to={buttonHref || '/products'} className="btn btn-primary">
              {buttonLabel}
            </SmartLink>
          )}
        </div>
      )}
    </section>
  )
}
