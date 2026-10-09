export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="btn btn-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={`pagination-page ${p === page ? 'active' : ''}`}
          onClick={() => onPageChange(p)}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      ))}
      <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  )
}
