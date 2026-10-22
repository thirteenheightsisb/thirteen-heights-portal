import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useApp } from '../context'
import { Loading, Empty } from '../components/ui'
import { PaymentForm } from '../components/forms'
import { currentMonth, periodOf, nextMonthStart, monthLabel, whatsappLink, fmtDate, floorName } from '../lib/format'

export default function Dashboard() {
  const { money, go, settings, notify } = useApp()
  const [d, setD] = useState(null)
  const [pay, setPay] = useState(null)
  const [busy, setBusy] = useState(false)
  const period = periodOf(currentMonth())

  const load = async () => {
    const [flats, residents, monthCharges, monthPayments] = await Promise.all([
      supabase.from('flats_overview').select('id, flat_no, floor, monthly_rent, occupancy'),
      supabase.from('residents_overview').select('*'),
      supabase.from('charges').select('amount, type, resident_id').eq('period', period),
      supabase.from('payments').select('amount, kind, method, resident_id').gte('paid_on', period).lt('paid_on', nextMonthStart(period)),
    ])
    setD({
      flats: flats.data || [], residents: residents.data || [],
      charges: monthCharges.data || [], payments: monthPayments.data || [],
    })
  }
  useEffect(() => { load() }, [])

  if (!d) return <Loading />

  const total = d.flats.length
  const vacant = d.flats.filter((f) => f.occupancy === 'vacant')
  const occupied = total - vacant.length
  const active = d.residents.filter((r) => r.status === 'active')
  const expected = d.charges.reduce((s, c) => s + Number(c.amount), 0)
  const collected = d.payments.filter((p) => p.kind === 'payment' && p.method !== 'Deposit adjusted').reduce((s, p) => s + Number(p.amount), 0)
  const outstanding = d.residents.filter((r) => Number(r.balance) > 0).reduce((s, r) => s + Number(r.balance), 0)
  const defaulters = d.residents.filter((r) => Number(r.balance) > 0).sort((a, b) => b.balance - a.balance)
  const rentDone = new Set(d.charges.filter((c) => c.type === 'rent').map((c) => c.resident_id))
  const missingRent = active.filter((r) => Number(r.monthly_rent) > 0 && !rentDone.has(r.id)).length
  const maintDone = new Set(d.charges.filter((c) => c.type === 'maintenance').map((c) => c.resident_id))
  const missingMaint = active.filter((r) => Number(r.maintenance_charge) > 0 && !maintDone.has(r.id)).length

  // ---- Rent vs maintenance for this month ----
  // What should be billed this month = every active resident's rent + maintenance.
  const toBillRent = active.reduce((s, r) => s + Number(r.monthly_rent), 0)
  const toBillMaint = active.reduce((s, r) => s + Number(r.maintenance_charge), 0)
  const toBill = toBillRent + toBillMaint
  // What has actually been added as charges so far.
  const sumType = (t) => d.charges.filter((c) => c.type === t).reduce((s, c) => s + Number(c.amount), 0)
  const billedRent = sumType('rent')
  const billedMaint = sumType('maintenance')
  // Payments are not split by type when recorded, so each resident's payments this
  // month are counted against their rent first, then their maintenance.
  const byRes = {}
  for (const c of d.charges) {
    if (c.type !== 'rent' && c.type !== 'maintenance') continue
    byRes[c.resident_id] ||= { rent: 0, maint: 0, paid: 0 }
    byRes[c.resident_id][c.type === 'rent' ? 'rent' : 'maint'] += Number(c.amount)
  }
  for (const p of d.payments) {
    if (p.kind !== 'payment' || p.method === 'Deposit adjusted') continue
    byRes[p.resident_id] ||= { rent: 0, maint: 0, paid: 0 }
    byRes[p.resident_id].paid += Number(p.amount)
  }
  let rentCollected = 0, maintCollected = 0
  for (const x of Object.values(byRes)) {
    const r = Math.min(x.paid, x.rent)
    rentCollected += r
    maintCollected += Math.min(x.paid - r, x.maint)
  }
  const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')

  const generate = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('generate_monthly_rent', { p_period: period })
    setBusy(false)
    if (error) return notify(error.message, 'error')
    notify(`Rent added for ${data} resident${data === 1 ? '' : 's'}`)
    load()
  }

  const reminder = (r) => whatsappLink(
    r.phone,
    `Assalam o Alaikum ${r.full_name}, this is a reminder from ${settings.hostel_name}. Your outstanding balance for Flat ${r.flat_no || ''} is ${money(r.balance)}. Kindly clear it at your earliest. Thank you.`,
    settings.country_code,
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{monthLabel(period)}</h1>
          <p>{occupied} of {total} flats occupied · {active.length} active residents</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => go('residents', null, { add: 1 })}>Add resident</button>
          <button className="btn success" onClick={() => setPay({})}>Record payment</button>
        </div>
      </div>

      {missingRent > 0 && (
        <div className="info-box" style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Rent for {monthLabel(period)} has not been added for {missingRent} resident{missingRent === 1 ? '' : 's'} yet.</span>
          <button className="btn primary small" disabled={busy} onClick={generate}>Add {monthLabel(period)} rent</button>
        </div>
      )}
      {missingMaint > 0 && (
        <div className="info-box" style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Maintenance charges for {monthLabel(period)} have not been added for {missingMaint} resident{missingMaint === 1 ? '' : 's'} yet.</span>
          <button className="btn small" onClick={() => go('billing')}>Open Monthly billing</button>
        </div>
      )}

      <div className="ledger-strip five">
        <div>
          <div className="label">To be billed this month</div>
          <div className="value">{money(toBill)}</div>
          <div className="foot">Rent {money(toBillRent)} + maintenance {money(toBillMaint)}</div>
        </div>
        <div>
          <div className="label">Billed so far</div>
          <div className="value">{money(expected)}</div>
          <div className="foot">{toBill > 0 ? `${pct(expected, toBill)} of this month` : 'Incl. deposits and other charges'}</div>
        </div>
        <div>
          <div className="label">Collected this month</div>
          <div className="value good">{money(collected)}</div>
          <div className="foot">{expected > 0 ? `${Math.round((collected / expected) * 100)}% of billed` : 'No bills yet'}</div>
        </div>
        <div>
          <div className="label">Total outstanding</div>
          <div className={`value ${outstanding > 0 ? 'due' : ''}`}>{money(outstanding)}</div>
          <div className="foot">{defaulters.length} resident{defaulters.length === 1 ? '' : 's'} with dues</div>
        </div>
        <div>
          <div className="label">Occupancy</div>
          <div className="value">{total ? Math.round((occupied / total) * 100) : 0}%</div>
          <div className="meter"><span style={{ width: `${total ? (occupied / total) * 100 : 0}%` }} /></div>
        </div>
      </div>

      <div className="ledger-strip">
        <div>
          <div className="label">Rent to collect</div>
          <div className="value">{money(billedRent)}</div>
          <div className="foot">{missingRent > 0 ? `${missingRent} resident${missingRent === 1 ? '' : 's'} not billed yet` : 'Rent added for everyone'}</div>
        </div>
        <div>
          <div className="label">Rent collected</div>
          <div className="value good">{money(rentCollected)}</div>
          <div className="foot">{pct(rentCollected, billedRent)} of rent billed · {money(Math.max(billedRent - rentCollected, 0))} left</div>
          <div className="meter"><span style={{ width: `${billedRent > 0 ? Math.min(100, (rentCollected / billedRent) * 100) : 0}%` }} /></div>
        </div>
        <div>
          <div className="label">Maintenance to collect</div>
          <div className="value">{money(billedMaint)}</div>
          <div className="foot">{missingMaint > 0 ? `${missingMaint} resident${missingMaint === 1 ? '' : 's'} not billed yet` : toBillMaint > 0 ? 'Maintenance added for everyone' : 'No maintenance charges set'}</div>
        </div>
        <div>
          <div className="label">Maintenance collected</div>
          <div className="value good">{money(maintCollected)}</div>
          <div className="foot">{pct(maintCollected, billedMaint)} of maintenance billed · {money(Math.max(billedMaint - maintCollected, 0))} left</div>
          <div className="meter"><span style={{ width: `${billedMaint > 0 ? Math.min(100, (maintCollected / billedMaint) * 100) : 0}%` }} /></div>
        </div>
      </div>

      <div className="grid-main-side">
        <div className="panel">
          <div className="panel-head">
            <h2>Pending dues</h2>
            <span className="muted small">Highest first</span>
          </div>
          {defaulters.length === 0 ? (
            <Empty>Everyone is clear. No pending dues.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Resident</th><th>Last paid</th><th className="r">Due</th><th></th></tr></thead>
                <tbody>
                  {defaulters.slice(0, 12).map((r) => (
                    <tr key={r.id} className="click" onClick={() => go('resident', r.id)}>
                      <td><div className="strong">{r.full_name}</div><div className="sub">Flat {r.flat_no || '—'}{r.status === 'left' ? ' · left' : ''}</div></td>
                      <td className="sub">{fmtDate(r.last_payment)}</td>
                      <td className="r num strong" style={{ color: 'var(--amber)' }}>{money(r.balance)}</td>
                      <td className="r" onClick={(e) => e.stopPropagation()}>
                        <div className="actions" style={{ justifyContent: 'flex-end' }}>
                          {reminder(r) && <a className="btn small" href={reminder(r)} target="_blank" rel="noreferrer">WhatsApp</a>}
                          <button className="btn small success" onClick={() => setPay(r)}>Paid</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {defaulters.length > 12 && <div className="panel-body"><button className="btn small" onClick={() => go('residents', null, { filter: 'due' })}>See all {defaulters.length}</button></div>}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Vacant flats</h2><span className="badge green">{vacant.length}</span></div>
          {vacant.length === 0 ? (
            <Empty>{total === 0 ? 'No flats added yet.' : 'All flats are occupied.'}{total === 0 && <div><button className="btn primary" onClick={() => go('flats')}>Add flats</button></div>}</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {vacant.sort((a, b) => a.flat_no.localeCompare(b.flat_no, undefined, { numeric: true })).slice(0, 10).map((f) => (
                    <tr key={f.id} className="click" onClick={() => go('flats', null, { add: f.id })}>
                      <td><span className="strong">Flat {f.flat_no}</span><div className="sub">{f.floor ? floorName(f.floor) : ''}</div></td>
                      <td className="r num">{money(f.monthly_rent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {pay && (
        <PaymentForm resident={pay.id ? pay : null} onClose={() => setPay(null)} onSaved={() => { setPay(null); load() }} />
      )}
    </>
  )
}
