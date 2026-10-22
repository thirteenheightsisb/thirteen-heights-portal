import { useEffect, useState } from 'react'
import { supabase, check } from '../supabase'
import { useApp } from '../context'
import { Loading, Empty } from '../components/ui'
import { currentMonth, periodOf, monthLabel, dueDateFor } from '../lib/format'

export default function Billing() {
  const { money, settings, notify, go } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const [residents, setResidents] = useState(null)
  const [monthCharges, setMonthCharges] = useState([])
  const [amounts, setAmounts] = useState({})
  const [busy, setBusy] = useState(false)
  const period = periodOf(month)

  const load = async () => {
    const [r, c] = await Promise.all([
      supabase.from('residents_overview').select('id, full_name, flat_id, flat_no, monthly_rent, maintenance_charge, check_in').eq('status', 'active'),
      supabase.from('charges').select('resident_id, type, amount').eq('period', period),
    ])
    setResidents((r.data || []).sort((a, b) => String(a.flat_no).localeCompare(String(b.flat_no), undefined, { numeric: true })))
    setMonthCharges(c.data || [])
    setAmounts({})
  }
  useEffect(() => { load() }, [month])

  if (!residents) return <Loading />

  const inMonth = residents.filter((r) => r.check_in <= `${month}-31`)

  // ---- Rent ----
  const rentDone = new Set(monthCharges.filter((c) => c.type === 'rent').map((c) => c.resident_id))
  const eligible = inMonth.filter((r) => Number(r.monthly_rent) > 0)
  const pending = eligible.filter((r) => !rentDone.has(r.id))

  // ---- Maintenance ----
  const maintBy = monthCharges.filter((c) => c.type === 'maintenance').reduce((m, c) => ((m[c.resident_id] = (m[c.resident_id] || 0) + Number(c.amount)), m), {})
  const maintPending = inMonth.filter((r) => !maintBy[r.id])
  // amount to add = what staff typed, otherwise the resident's saved monthly maintenance
  const maintAmount = (r) => (amounts[r.id] !== undefined ? Number(amounts[r.id]) : Number(r.maintenance_charge))
  const maintToAdd = maintPending.filter((r) => maintAmount(r) > 0)
  const maintTotal = maintToAdd.reduce((s, r) => s + maintAmount(r), 0)
  const maintAddedTotal = Object.values(maintBy).reduce((s, v) => s + v, 0)

  const addRent = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('generate_monthly_rent', { p_period: period })
    setBusy(false)
    if (error) return notify(error.message, 'error')
    notify(`Rent for ${monthLabel(month)} added for ${data} resident${data === 1 ? '' : 's'}`)
    load()
  }

  const addMaintenance = async () => {
    if (!maintToAdd.length) return notify('Nothing to add — set a maintenance amount for at least one resident', 'error')
    setBusy(true)
    try {
      check(await supabase.from('charges').insert(maintToAdd.map((r) => ({
        resident_id: r.id, flat_id: r.flat_id, type: 'maintenance', description: `Maintenance - ${monthLabel(month)}`,
        amount: maintAmount(r), period, due_date: dueDateFor(period, settings.due_day),
      }))))
      notify(`Maintenance for ${monthLabel(month)} added for ${maintToAdd.length} resident${maintToAdd.length === 1 ? '' : 's'}`)
      load()
    } catch (e) { notify(e.message, 'error') }
    setBusy(false)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monthly billing</h1>
          <p>Add rent and maintenance charges for everyone in one go.</p>
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
            <h2>Maintenance charges for {monthLabel(month)}</h2>
            {inMonth.length > 0 && maintPending.length === 0
              ? <span className="badge green">Done</span>
              : <span className="muted small">Filled from each resident's details — change an amount if this month is different, or set it to 0 to skip</span>}
          </div>
          {inMonth.length === 0 ? <Empty action={<button className="btn" onClick={() => go('residents', null, { add: 1 })}>Add resident</button>}>No active residents for this month.</Empty> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Flat</th><th>Resident</th><th className="r">Monthly maintenance</th><th className="r">Already added</th><th style={{ width: 170 }}>Amount to add</th></tr></thead>
                  <tbody>
                    {inMonth.map((r) => {
                      const done = Boolean(maintBy[r.id])
                      return (
                        <tr key={r.id}>
                          <td className="strong">{r.flat_no || '—'}</td>
                          <td>{r.full_name}</td>
                          <td className="r num">{Number(r.maintenance_charge) > 0 ? money(r.maintenance_charge) : <span className="muted">—</span>}</td>
                          <td className="r num">{done ? <span style={{ color: 'var(--green)' }}>{money(maintBy[r.id])}</span> : <span className="muted">—</span>}</td>
                          <td>
                            {done ? <span className="badge green">Added</span> : (
                              <input className="input" type="number" min="0" inputMode="numeric"
                                value={amounts[r.id] !== undefined ? amounts[r.id] : (Number(r.maintenance_charge) || '')}
                                onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })}
                                aria-label={`Maintenance for flat ${r.flat_no}`} />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="panel-body actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)' }}>
                <span className="muted">
                  {maintPending.length === 0
                    ? `Maintenance added for all ${inMonth.length} residents · ${money(maintAddedTotal)}`
                    : `${maintToAdd.length} resident${maintToAdd.length === 1 ? '' : 's'} to add · ${money(maintTotal)}${maintAddedTotal > 0 ? ` · already added ${money(maintAddedTotal)}` : ''}`}
                </span>
                {maintPending.length > 0 && (
                  <button className="btn primary" disabled={busy || !maintToAdd.length} onClick={addMaintenance}>
                    Add maintenance for {maintToAdd.length} resident{maintToAdd.length === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
