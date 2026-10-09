import SectionHead from '../SectionHead'

// Capabilities as a specimen-label ledger - each row is one line item,
// marked, not numbered (the order carries no information worth counting).
export default function FeatureGridSection({ data = {} }) {
  const items = Array.isArray(data.items) ? data.items : []
  return (
    <section className="container section-block">
      {data.heading && <SectionHead title={data.heading} />}
      <div className="feature-grid">
        {items.map((item, i) => (
          <div className="feature-row" key={i}>
            <span className="feature-row-mark" aria-hidden="true" />
            <div>
              {item.title && <h3>{item.title}</h3>}
              {item.body && <p>{item.body}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
