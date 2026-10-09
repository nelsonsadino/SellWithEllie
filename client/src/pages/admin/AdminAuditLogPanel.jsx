import { useEffect, useState } from 'react'
import { getAuditLog } from '../../api/auditLog'
import Spinner from '../../components/Spinner'
import Pagination from '../../components/Pagination'

const PAGE_SIZE = 25

export default function AdminAuditLogPanel() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')
    getAuditLog(page, PAGE_SIZE)
      .then((result) => {
        if (ignore) return
        setEntries(result.items)
        setTotalCount(result.totalCount)
      })
      .catch((err) => {
        if (!ignore) setError(err.message || 'Could not load the audit log.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [page])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  if (loading) return <Spinner />
  if (error) return <p className="form-error">{error}</p>

  return (
    <div>
      <div className="admin-panel-header">
        <h2>Audit log</h2>
      </div>
      <p className="hint">Who did what, and when - product/auction changes and chat moderation actions taken by admins.</p>
      {entries.length === 0 ? (
        <p className="empty-state">No admin activity recorded yet.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAtUtc).toLocaleString()}</td>
                    <td>{e.actorDisplayName}</td>
                    <td>{e.action}</td>
                    <td>{e.targetType ? `${e.targetType} #${e.targetId}` : '-'}</td>
                    <td>{e.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
