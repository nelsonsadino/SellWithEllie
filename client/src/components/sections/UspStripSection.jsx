export default function UspStripSection({ data = {} }) {
  const items = (Array.isArray(data.items) ? data.items : []).filter((i) => i && (i.title || i.body))
  if (items.length === 0) return null
  return (
    <section className="usp">
      <ul className="container usp-inner" style={{ listStyle: 'none', margin: 0 }}>
        {items.map((item, i) => (
          <li className="usp-item" key={i}>
            {item.title && <strong>{item.title}</strong>}
            {item.body && <span>{item.body}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
