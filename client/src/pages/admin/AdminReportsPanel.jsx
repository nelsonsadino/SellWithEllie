import { useEffect, useState } from 'react'
import { getReportSummary } from '../../api/reports'
import Spinner from '../../components/Spinner'
import { useCurrency } from '../../context/TenantContext'

const RANGES = [7, 30, 90]

function Delta({ now, prev }) {
  if (!prev) return <small className="report-delta">no prior data</small>
  const pct = Math.round(((now - prev) / prev) * 100)
  return (
    <small className={`report-delta ${pct >= 0 ? 'is-up' : 'is-down'}`}>
      {pct >= 0 ? '+' : ''}
      {pct}% vs previous period
    </small>
  )
}

function Bars({ rows, money }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue))
  return (
    <div className="report-bars" role="img" aria-label="Daily revenue">
      {rows.map((r) => (
        <span key={r.date} className="report-bar" title={`${r.date}: ${money(r.revenue)} (${r.orders} orders)`}>
          <i style={{ height: `${Math.max(2, (r.revenue / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  )
}

export default function AdminReportsPanel() {
  const money = useCurrency()
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    setData(null)
    setError('')
    getReportSummary(days)
      .then((d) => !ignore && setData(d))
      .catch((e) => !ignore && setError(e.message || 'Could not load the report.'))
    return () => {
      ignore = true
    }
  }, [days])

  if (error) return <p className="hint">{error}</p>
  if (!data) return <Spinner />
  const k = data.kpis

  return (
    <div className="report">
      <div className="report-head">
        <h2>Sales report</h2>
        <div className="report-range" role="group" aria-label="Report period">
          {RANGES.map((r) => (
            <button key={r} type="button" className={r === days ? 'is-active' : ''} onClick={() => setDays(r)}>
              Last {r} days
            </button>
          ))}
        </div>
      </div>

      <div className="report-kpis">
        <div className="report-kpi">
          <span>Revenue</span>
          <strong>{money(k.revenue)}</strong>
          <Delta now={k.revenue} prev={k.previousRevenue} />
        </div>
        <div className="report-kpi">
          <span>Orders</span>
          <strong>{k.orders}</strong>
          <Delta now={k.orders} prev={k.previousOrders} />
        </div>
        <div className="report-kpi">
          <span>Units sold</span>
          <strong>{k.unitsSold}</strong>
          <small className="report-delta">{k.customers} customers</small>
        </div>
        <div className="report-kpi">
          <span>Avg order value</span>
          <strong>{money(k.averageOrderValue)}</strong>
          <small className="report-delta">{k.pendingPayment} awaiting payment</small>
        </div>
        <div className="report-kpi is-alert">
          <span>Out of stock</span>
          <strong>{k.outOfStockCount}</strong>
          <small className="report-delta">
            {k.lowStockCount} low (≤ {data.lowStockThreshold})
          </small>
        </div>
        <div className="report-kpi">
          <span>Live now</span>
          <strong>{k.activeAuctions + k.openRaffles}</strong>
          <small className="report-delta">
            {k.activeAuctions} auctions · {k.openRaffles} raffles
          </small>
        </div>
      </div>

      <section className="report-card">
        <h3>Revenue by day</h3>
        <Bars rows={data.dailySales} money={money} />
      </section>

      <div className="report-grid">
        <section className="report-card">
          <h3>Best sellers</h3>
          {data.bestSellers.length === 0 ? (
            <p className="hint">No completed sales in this period yet.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className="num">Units</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.bestSellers.map((p, i) => (
                  <tr key={p.productId}>
                    <td>{i + 1}</td>
                    <td>
                      {p.name}
                      <small>{p.category}</small>
                    </td>
                    <td className="num">{p.units}</td>
                    <td className="num">{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="report-card">
          <h3>In demand</h3>
          <p className="hint">Sales, items sitting in carts, and auction bids combined.</p>
          {data.inDemand.length === 0 ? (
            <p className="hint">No demand signals yet.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Sold</th>
                  <th className="num">In carts</th>
                  <th className="num">Bids</th>
                </tr>
              </thead>
              <tbody>
                {data.inDemand.map((p) => (
                  <tr key={p.productId}>
                    <td>
                      {p.name}
                      {!p.isAuctionOnly && p.stock <= data.lowStockThreshold && (
                        <small className="report-warn">only {p.stock} left</small>
                      )}
                    </td>
                    <td className="num">{p.unitsSold}</td>
                    <td className="num">{p.inCarts}</td>
                    <td className="num">{p.bids}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="report-card">
          <h3>Out of stock</h3>
          {data.outOfStock.length === 0 ? (
            <p className="hint">Everything is in stock.</p>
          ) : (
            <ul className="report-list">
              {data.outOfStock.map((p) => (
                <li key={p.productId}>
                  {p.name}
                  <small>{p.category}</small>
                </li>
              ))}
            </ul>
          )}
          {data.lowStock.length > 0 && (
            <>
              <h4>Running low</h4>
              <ul className="report-list">
                {data.lowStock.map((p) => (
                  <li key={p.productId}>
                    {p.name}
                    <small className="report-warn">{p.stock} left</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="report-card">
          <h3>Sales by category</h3>
          {data.categories.length === 0 ? (
            <p className="hint">No sales yet.</p>
          ) : (
            <table className="report-table">
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td className="num">{c.units} units</td>
                    <td className="num">{money(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
