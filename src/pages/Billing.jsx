import { useEffect, useState } from 'react'
import { supabase, check } from '../supabase'
import { useApp } from '../context'
import { Loading, Empty, Field } from '../components/ui'
import { currentMonth, periodOf, monthLabel, dueDateFor } from '../lib/format'

export default function Billing() {
  const { money, settings, notify, go } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const [residents, setResidents] = useState(null)
  const [monthCharges, setMonthCharges] = useState([])
  const [amounts, setAmounts] = useState({})
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const period = periodOf(month)

  const load = async () => {
    const [r, c] = await Promise.all([
      supabase.from('residents_overview').select('id, full_name, flat_id, flat_no, monthly_rent, check_in').eq('status', 'active'),
      supabase.from('charges').select('resident_id, type, amount').eq('period', period),
    ])
    setResidents((r.data || []).sort((a, b) => String(a.flat_no).localeCompare(String(b.flat_no), undefined, { numeric: true })))
    setMonthCharges(c.data || [])
    setAmounts({})
  }
  useEffect(() => { load() }, [month])

  if (!residents) return <Loading />

  const rentDone = new Set(monthCharges.filter((c) => c.type === 'rent').map((c) => c.resident_id))
  const eligible = residents.filter((r) => Number(r.monthly_rent) > 0 && r.check_in <= `${month}-31`)
  const pending = eligible.filter((r) => !rentDone.has(r.id))
  const utilBy = monthCharges.filter((c) => c.type === 'utilities').reduce((m, c) => ((m[c.resident_id] = (m[c.resident_id] || 0) + Number(c.amount)), m), {})
  const entered = Object.entries(amounts).filter(([, v]) => Number(v) > 0)
  const enteredTotal = entered.reduce((s, [, v]) => s + Number(v), 0)
  const defaultDesc = `Electricity - ${monthLabel(month)}`

  const addRent = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('generate_monthly_rent', { p_period: period })
    setBusy(false)
    if (error) return notify(error.message, 'error')
    notify(`Rent for ${monthLabel(month)} added for ${data} resident${data === 1 ? '' : 's'}`)
    load()
  }

  const saveUtilities = async () => {
    if (!entered.length) return notify('Enter at least one amount', 'error')
    setBusy(true)
    try {
      const byId = Object.fromEntries(residents.map((r) => [r.id, r]))
      check(await supabase.from('charges').insert(entered.map(([id, v]) => ({
        resident_id: id, flat_id: byId[id].flat_id, type: 'utilities', description: desc.trim() || defaultDesc,
        amount: Number(v), period, due_date: dueDateFor(period, settings.due_day),
      }))))
      notify(`Bills added for ${entered.length} flat${entered.length === 1 ? '' : 's'}`)
      load()
    } catch (e) { notify(e.message, 'error') }
    setBusy(false)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monthly billing</h1>
          <p>Add rent and electricity bills for everyone in one go.</p>
        </div>
        <div className="actions">
          <input type="month" className="input" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Billing month" />
        </div>
      </div>

      <div className="stack">
        <div className="panel">
          <div className="panel-head"><h2>Rent for {monthLabel(month)}</h2>
            {pending.length === 0 && eligible.length > 0 && <span className="badge green">Done</span>}
          </div>
          <div className="panel-body">
            {eligible.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No active residents with rent for this month.</p>
            ) : pending.length === 0 ? (
              <p style={{ margin: 0 }}>Rent has been added for all {eligible.length} residents. Total {money(eligible.reduce((s, r) => s + Number(r.monthly_rent), 0))}.</p>
            ) : (
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <span>{pending.length} of {eligible.length} residents still need rent added — {money(pending.reduce((s, r) => s + Number(r.monthly_rent), 0))} in total. Due on {dueDateFor(period, settings.due_day).slice(8)} {monthLabel(month)}.</span>
                <button className="btn primary" disabled={busy} onClick={addRent}>Add rent for {pending.length} resident{pending.length === 1 ? '' : 's'}</button>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Electricity / utility bills for {monthLabel(month)}</h2>
            <span className="muted small">Leave blank to skip a flat</span>
          </div>
          {residents.length === 0 ? <Empty action={<button className="btn" onClick={() => go('residents', null, { add: 1 })}>Add resident</button>}>No active residents.</Empty> : (
            <>
              <div className="panel-body" style={{ paddingBottom: 0 }}>
                <Field label="Description on the bill"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={defaultDesc} style={{ maxWidth: 360 }} /></Field>
              </div>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead><tr><th>Flat</th><th>Resident</th><th className="r">Already added</th><th style={{ width: 170 }}>Amount</th></tr></thead>
                  <tbody>
                    {residents.map((r) => (
                      <tr key={r.id}>
                        <td className="strong">{r.flat_no || '—'}</td>
                        <td>{r.full_name}</td>
                        <td className="r num">{utilBy[r.id] ? money(utilBy[r.id]) : <span className="muted">—</span>}</td>
                        <td><input className="input" type="number" min="0" inputMode="numeric" value={amounts[r.id] || ''} onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })} aria-label={`Bill for flat ${r.flat_no}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel-body actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)' }}>
                <span className="muted">{entered.length} flats · {money(enteredTotal)}</span>
                <button className="btn primary" disabled={busy || !entered.length} onClick={saveUtilities}>Add bills</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
