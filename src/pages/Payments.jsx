import { useEffect, useState } from 'react'
import { supabase, fetchAll } from '../supabase'
import { useApp } from '../context'
import { Loading, Empty } from '../components/ui'
import { PaymentForm } from '../components/forms'
import { currentMonth, periodOf, nextMonthStart, monthLabel, fmtDate } from '../lib/format'
import { downloadReceipt } from '../lib/pdf'
import { exportToExcel } from '../lib/exportXlsx'

export default function Payments() {
  const { money, go, settings } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setRows(null)
    const p = periodOf(month)
    const data = await fetchAll(() => supabase.from('payments')
      .select('*, residents(full_name, phone, flats(flat_no))')
      .gte('paid_on', p).lt('paid_on', nextMonthStart(p))
      .order('paid_on', { ascending: false }).order('receipt_no', { ascending: false }))
    setRows(data)
  }
  useEffect(() => { load() }, [month])

  const received = (rows || []).filter((x) => x.kind === 'payment' && x.method !== 'Deposit adjusted')
  const total = received.reduce((s, x) => s + Number(x.amount), 0)
  const refunds = (rows || []).filter((x) => x.kind === 'refund').reduce((s, x) => s + Number(x.amount), 0)
  const byMethod = received.reduce((m, x) => ((m[x.method] = (m[x.method] || 0) + Number(x.amount)), m), {})

  const exportMonth = () => exportToExcel({
    Payments: (rows || []).map((x) => ({
      Receipt: x.receipt_no, Date: x.paid_on, Resident: x.residents?.full_name, Flat: x.residents?.flats?.flat_no,
      Type: x.kind, Method: x.method, Reference: x.reference, Amount: Number(x.amount), Note: x.note,
    })),
  }, `Payments_${month}.xlsx`)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p>{monthLabel(month)}: {money(total)} received{refunds ? ` · ${money(refunds)} refunded` : ''}</p>
        </div>
        <div className="actions">
          <input type="month" className="input" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
          <button className="btn" onClick={exportMonth} disabled={!rows?.length}>Export to Excel</button>
          <button className="btn success" onClick={() => setAdding(true)}>Record payment</button>
        </div>
      </div>

      {Object.keys(byMethod).length > 0 && (
        <div className="actions" style={{ marginBottom: 14 }}>
          {Object.entries(byMethod).map(([m, v]) => <span key={m} className="badge navy">{m}: {money(v)}</span>)}
        </div>
      )}

      <div className="panel table-wrap">
        {!rows ? <Loading /> : rows.length === 0 ? (
          <Empty action={<button className="btn success" onClick={() => setAdding(true)}>Record payment</button>}>No payments recorded in {monthLabel(month)}.</Empty>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Receipt</th><th>Resident</th><th>Method</th><th className="r">Amount</th><th></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="click" onClick={() => go('resident', x.resident_id)}>
                  <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDate(x.paid_on)}</td>
                  <td className="sub">#{x.receipt_no}</td>
                  <td><div className="strong">{x.residents?.full_name}</div><div className="sub">Flat {x.residents?.flats?.flat_no || '—'}</div></td>
                  <td>{x.method}{x.kind === 'refund' && <> <span className="badge red">Refund</span></>}{x.reference && <div className="sub">{x.reference}</div>}</td>
                  <td className="r num strong" style={{ color: x.kind === 'refund' ? 'var(--red)' : 'var(--green)' }}>{x.kind === 'refund' ? '-' : ''}{money(x.amount)}</td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    <button className="btn small" onClick={() => downloadReceipt({ settings, resident: { full_name: x.residents?.full_name, flat_no: x.residents?.flats?.flat_no }, payment: x })}>Receipt</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {adding && <PaymentForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </>
  )
}
