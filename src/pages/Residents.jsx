import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useApp } from '../context'
import { Loading, Empty, BalanceBadge } from '../components/ui'
import { ResidentForm } from '../components/forms'
import { fmtDate, todayStr } from '../lib/format'
import { exportToExcel } from '../lib/exportXlsx'

export default function Residents({ params }) {
  const { money, go } = useApp()
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState(params?.filter || 'active')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(Boolean(params?.add))

  useEffect(() => {
    supabase.from('residents_overview').select('*').order('full_name').then(({ data }) => setRows(data || []))
  }, [])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (rows || []).filter((r) => {
      if (filter === 'active' && r.status !== 'active') return false
      if (filter === 'left' && r.status !== 'left') return false
      if (filter === 'due' && !(Number(r.balance) > 0)) return false
      if (!t) return true
      return [r.full_name, r.phone, r.cnic, r.flat_no, r.email].some((v) => String(v || '').toLowerCase().includes(t))
    })
  }, [rows, filter, q])

  if (!rows) return <Loading />
  const totalDue = shown.reduce((s, r) => s + Math.max(0, Number(r.balance)), 0)

  const exportList = () => exportToExcel({
    Residents: shown.map((r) => ({
      Name: r.full_name, Flat: r.flat_no, Phone: r.phone, CNIC: r.cnic, Email: r.email, Status: r.status,
      'Check-in': r.check_in, 'Check-out': r.check_out, 'Monthly rent': Number(r.monthly_rent),
      'Security deposit': Number(r.security_deposit), 'Total charged': Number(r.total_charges),
      'Total paid': Number(r.total_paid), Refunded: Number(r.total_refunded), Balance: Number(r.balance),
      'Emergency contact': r.emergency_name, 'Emergency phone': r.emergency_phone, Address: r.permanent_address,
    })),
  }, `Residents_${todayStr()}.xlsx`)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Residents</h1>
          <p>{shown.length} shown · {money(totalDue)} due from these residents</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={exportList}>Export to Excel</button>
          <button className="btn primary" onClick={() => setAdding(true)}>Add resident</button>
        </div>
      </div>

      <div className="actions" style={{ marginBottom: 14 }}>
        <div className="seg" role="group" aria-label="Filter residents">
          {[['active', 'Active'], ['due', 'Has dues'], ['left', 'Left'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Filter this list…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="panel table-wrap">
        {shown.length === 0 ? (
          <Empty action={rows.length === 0 && <button className="btn primary" onClick={() => setAdding(true)}>Add first resident</button>}>
            {rows.length === 0 ? 'No residents yet.' : 'No residents match this filter.'}
          </Empty>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Flat</th><th>Phone</th><th>Since</th><th className="r">Rent</th><th className="r">Paid so far</th><th>Balance</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="click" onClick={() => go('resident', r.id)}>
                  <td><div className="strong">{r.full_name}</div>{r.status === 'left' && <div className="sub">Left {fmtDate(r.check_out)}</div>}</td>
                  <td>{r.flat_no || '—'}</td>
                  <td>{r.phone || '—'}</td>
                  <td className="sub">{fmtDate(r.check_in)}</td>
                  <td className="r num">{money(r.monthly_rent)}</td>
                  <td className="r num">{money(r.total_paid)}</td>
                  <td><BalanceBadge balance={r.balance} money={money} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <ResidentForm onClose={() => { setAdding(false); if (params?.add) go('residents') }} onSaved={(id) => go('resident', id)} />
      )}
    </>
  )
}
