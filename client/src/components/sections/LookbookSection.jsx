import SmartLink from '../SmartLink'

export default function LookbookSection({ data = {} }) {
  const { image, heading, body, buttonLabel, buttonHref, flip } = data
  const body_ = (
    <div className="lookbook-body">
      {heading && (
        <>
          <span className="lookbook-mark" aria-hidden="true" />
          <h2>{heading}</h2>
        </>
      )}
      {body && <p>{body}</p>}
      {buttonLabel && (
        <SmartLink to={buttonHref || '/about'} className="btn btn-secondary">
          {buttonLabel}
        </SmartLink>
      )}
    </div>
  )

  // No image? Don't reserve a huge empty column - centre the text instead.
  if (!image) {
    return (
      <section className="container section-block">
        <div className="lookbook-text-only">{body_}</div>
      </section>
    )
  }

  return (
    <section className="container section-block">
      <div className={`lookbook ${flip ? 'is-flipped' : ''}`}>
        <img className="lookbook-media" src={image} alt="" loading="lazy" />
        {body_}
      </div>
    </section>
  )
}
