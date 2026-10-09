import { Link } from 'react-router-dom'

// Section heading, specimen-cabinet style: a brass case-mark, the title, a
// rule line, and an optional "view all" link. `index` (SectionRenderer's
// 1-based page position) is no longer shown as a number - an arbitrary page
// position never earned a place in the reading order.
export default function SectionHead({ title, link }) {
  return (
    <div className="section-head">
      <span className="section-head-mark" aria-hidden="true" />
      <span className="section-head-label">
        <h2>{title}</h2>
      </span>
      {link ? (
        <Link to={link.to} className="section-head-link">
          {link.label} &rarr;
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}
