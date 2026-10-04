import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useApp } from '../context'
import { Loading, Empty } from '../components/ui'
import { fmtDateTime, monthLabel } from '../lib/format'

const ACTION = { INSERT: 'added', UPDATE: 'changed', DELETE: 'deleted' }
const THING = { flats: 'flat', residents: 'resident', charges: 'charge', payments: 'payment', invoices: 'invoice', settings: 'settings', profiles: 'user' }

export default function Activity() {
  const { money } = useApp()
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState({})
  const [limit, setLimit] = useState(100)

  useEffect(() => {
    Promise.all([
      supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('profiles').select('id, full_name, email'),
    ]).then(([a, p]) => {
      setRows(a.data || [])
      setPeople(Object.fromEntries((p.data || []).map((x) => [x.id, x.full_name || x.email])))
    })
  }, [limit])

  const describe = (r) => {
    const d = r.details || {}
    switch (r.table_name) {
      case 'flats': return `Flat ${d.flat_no}`
      case 'residents': return `${d.full_name}${d.status === 'left' && r.action === 'UPDATE' ? ' (checked out)' : ''}`
      case 'charges': return `${d.description || d.type} — ${money(d.amount)}`
      case 'payments': return `${d.kind === 'refund' ? 'Refund' : 'Payment'} #${d.receipt_no} — ${money(d.amount)} (${d.method})`
      case 'invoices': return `Invoice INV-${String(d.invoice_no).padStart(5, '0')} for ${monthLabel(d.period)}`
      case 'profiles': return `${d.full_name || d.email}${r.action === 'UPDATE' ? ` → ${d.role}, ${d.approved ? 'allowed' : 'no access'}` : ''}`
      default: return 'Hostel settings'
    }
  }

  if (!rows) return <Loading />
  return (
    <>
      <div className="page-head">
        <div><h1>Activity log</h1><p>Every add, change and delete, with who did it.</p></div>
      </div>
      <div className="panel table-wrap">
        {rows.length === 0 ? <Empty>No activity yet.</Empty> : (
          <table>
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.created_at)}</td>
                  <td>{people[r.user_id] || (r.user_id ? 'Unknown user' : 'System')}</td>
                  <td>
                    <span className={`badge ${r.action === 'DELETE' ? 'red' : r.action === 'INSERT' ? 'green' : 'navy'}`}>{ACTION[r.action]} {THING[r.table_name]}</span>{' '}
                    {describe(r)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length >= limit && <div style={{ marginTop: 12 }}><button className="btn" onClick={() => setLimit(limit + 200)}>Show more</button></div>}
    </>
  )
}
