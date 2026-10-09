import SmartLink from '../SmartLink'

export default function CtaSection({ data = {} }) {
  return (
    <section className="container section-block">
      <div className="cta-block">
        <div>
          {data.title && <h2>{data.title}</h2>}
          {data.body && <p>{data.body}</p>}
        </div>
        {data.buttonLabel && (
          <SmartLink to={data.buttonHref || '/products'} className="btn btn-primary">
            {data.buttonLabel}
          </SmartLink>
        )}
      </div>
    </section>
  )
}
