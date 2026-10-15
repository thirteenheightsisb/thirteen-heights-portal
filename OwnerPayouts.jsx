import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase, check, fetchAll } from '../supabase'
import { useApp } from '../context'
import { Loading, Modal, Field } from '../components/ui'

// Money the hostel pays out to the actual owners of each flat.
// Owner details (name, phone, account, monthly amount) live on the flat;
// every payment sent to an owner is one row in `owner_payouts`.

const METHODS = ['Bank transfer', 'Cash', 'Cheque', 'JazzCash', 'Easypaisa', 'Other']

const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const thisMonth = () => todayStr().slice(0, 7) + '-01'
const nextMonth = (period) => {
  const [y, m] = period.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
}
const monthLabel = (period) => new Date(period + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const num = (v) => Number(v) || 0

const noteStyle = { whiteSpace: 'pre-wrap', fontSize: '0.85rem', maxWidth: 300, minWidth: 160 }
const plainSvg = { width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function waLink(phone, countryCode, text) {
  let p = String(phone || '').replace(/\D/g, '')
  if (!p) return null
  if (p.startsWith('00')) p = p.slice(2)
  else if (p.startsWith('0')) p = (countryCode || '92') + p.slice(1)
  else if (!p.startsWith(countryCode || '92')) p = (countryCode || '92') + p
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`
}

export default function OwnerPayouts() {
  const { money, notify, isAdmin, settings } = useApp()
  const [period, setPeriod] = useState(thisMonth())
  const [flats, setFlats] = useState(null)
  const [payouts, setPayouts] = useState([])
  const [collected, setCollected] = useState(0)
  const [filter, setFilter] = useState('all')
  const [historyScope, setHistoryScope] = useState('month')
  const [search, setSearch] = useState('')
  const [payoutForm, setPayoutForm] = useState(null)   // {flat?, payout?}
  const [ownerFlat, setOwnerFlat] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const [f, p, pay] = await Promise.all([
        fetchAll(() => supabase.from('flats').select('*').order('flat_no')),
        fetchAll(() => supabase.from('owner_payouts').select('*').order('paid_on', { ascending: false }).order('created_at', { ascending: false })),
        fetchAll(() => supabase.from('payments').select('amount, kind').gte('paid_on', period).lt('paid_on', nextMonth(period)).order('id')),
      ])
      setFlats(f)
      setPayouts(p)
      setCollected(pay.reduce((s, x) => s + (x.kind === 'refund' ? -num(x.amount) : num(x.amount)), 0))
    } catch (e) {
      setError(e.message.includes('owner_payouts') || e.message.includes('schema cache')
        ? 'The owner payouts table is missing. Run supabase/owner_payouts.sql in the Supabase SQL Editor, then reload.'
        : e.message)
      setFlats((x) => x || [])
    }
  }, [period])

  useEffect(() => { load() }, [load])

  const flatById = useMemo(() => Object.fromEntries((flats || []).map((f) => [f.id, f])), [flats])

  // One row per flat for the chosen month
  const rows = useMemo(() => (flats || []).map((f) => {
    const due = num(f.owner_monthly_amount)
    const list = payouts.filter((p) => p.flat_id === f.id && p.period === period)
    const paid = list.reduce((s, p) => s + num(p.amount), 0)
    const hasOwner = Boolean(f.owner_name) || due > 0
    let status = 'none'
    if (hasOwner || paid > 0) {
      if (paid > 0 && paid >= due) status = 'paid'
      else if (paid > 0) status = 'partial'
      else status = 'pending'
    }
    return { flat: f, due, paid, remaining: Math.max(due - paid, 0), status, count: list.length }
  }), [flats, payouts, period])

  const shownRows = rows.filter((r) =>
    filter === 'all' ? true
      : filter === 'pending' ? r.status === 'pending' || r.status === 'partial'
        : filter === 'paid' ? r.status === 'paid'
          : r.status === 'none')

  const totals = useMemo(() => {
    const owed = rows.reduce((s, r) => s + r.due, 0)
    const paid = payouts.filter((p) => p.period === period).reduce((s, p) => s + num(p.amount), 0)
    const remaining = rows.reduce((s, r) => s + r.remaining, 0)
    return {
      owed, paid, remaining,
      owners: rows.filter((r) => r.due > 0).length,
      count: payouts.filter((p) => p.period === period).length,
    }
  }, [rows, payouts, period])

  const history = useMemo(() => {
    const q = search.trim().toLowerCase()
    return payouts
      .filter((p) => historyScope === 'all' || p.period === period)
      .filter((p) => {
        if (!q) return true
        const f = flatById[p.flat_id]
        return [f?.flat_no, p.owner_name, p.paid_to_account, p.reference, p.note, p.method]
          .some((v) => String(v || '').toLowerCase().includes(q))
      })
  }, [payouts, historyScope, period, search, flatById])

  const remove = async (p) => {
    if (!window.confirm(`Delete this payout of ${money(p.amount)}? This cannot be undone.`)) return
    try {
      check(await supabase.from('owner_payouts').delete().eq('id', p.id))
      notify('Payout deleted')
      load()
    } catch (e) { notify(e.message, 'error') }
  }

  const exportExcel = () => {
    const data = history.map((p) => ({
      'Payout no.': p.payout_no,
      'Paid on': p.paid_on,
      'For month': monthLabel(p.period),
      'Flat': flatById[p.flat_id]?.flat_no || '(deleted flat)',
      'Owner': p.owner_name || '',
      'Amount': num(p.amount),
      'Method': p.method,
      'Paid to account': p.paid_to_account || '',
      'Reference / Txn ID': p.reference || '',
      'Note': p.note || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [8, 12, 16, 8, 22, 12, 14, 32, 20, 40].map((wch) => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Owner payouts')
    XLSX.writeFile(wb, historyScope === 'all' ? 'owner-payouts-all.xlsx' : `owner-payouts-${period.slice(0, 7)}.xlsx`)
  }

  const shareText = (p) => {
    const f = flatById[p.flat_id]
    return [
      `Assalam o Alaikum ${p.owner_name || ''},`.trim(),
      `${settings?.hostel_name || 'We'} have paid ${money(p.amount)} for flat ${f?.flat_no || ''} (${monthLabel(p.period)}) on ${fmtDate(p.paid_on)}.`,
      `Method: ${p.method}`,
      p.paid_to_account ? `Paid to: ${p.paid_to_account}` : null,
      p.reference ? `Reference: ${p.reference}` : null,
      p.note ? `Note: ${p.note}` : null,
    ].filter(Boolean).join('\n')
  }

  if (!flats) return <Loading />

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Owner payouts</h1>
          <p>What you owe each flat owner, what you've paid them, and which account it went to.</p>
        </div>
        <div className="actions">
          <input className="input" type="month" style={{ width: 170 }} value={period.slice(0, 7)}
            onChange={(e) => e.target.value && setPeriod(e.target.value + '-01')} aria-label="Month" />
          <button className="btn primary" onClick={() => setPayoutForm({})} disabled={!!error}>+ Record payout</button>
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="ledger-strip">
        <div>
          <div className="label">Rent collected</div>
          <div className="value good">{money(collected)}</div>
          <div className="foot">Kept after payouts: {money(collected - totals.paid)}</div>
        </div>
        <div>
          <div className="label">Owed to owners</div>
          <div className="value">{money(totals.owed)}</div>
          <div className="foot">{totals.owners} flat{totals.owners === 1 ? '' : 's'} with a monthly amount</div>
        </div>
        <div>
          <div className="label">Paid to owners</div>
          <div className="value">{money(totals.paid)}</div>
          <div className="foot">{totals.count} payout{totals.count === 1 ? '' : 's'} in {monthLabel(period)}</div>
        </div>
        <div>
          <div className="label">Still to pay</div>
          <div className={`value ${totals.remaining > 0 ? 'due' : 'good'}`}>{money(totals.remaining)}</div>
          <div className="foot">{totals.remaining > 0 ? 'Pending this month' : 'All owners paid'}</div>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <div className="panel-head">
            <h2>{monthLabel(period)} — by flat</h2>
            <div className="seg">
              {[['all', 'All'], ['pending', 'To pay'], ['paid', 'Paid'], ['none', 'Owner not set']].map(([k, l]) => (
                <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
          </div>
          {flats.length === 0 ? (
            <div className="empty">No flats yet. Add flats first, then set their owners here.</div>
          ) : shownRows.length === 0 ? (
            <div className="empty">Nothing to show for this filter.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Flat</th><th>Owner</th><th className="r">Monthly amount</th><th className="r">Paid</th><th className="r">Remaining</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {shownRows.map((r) => (
                    <tr key={r.flat.id}>
                      <td className="strong">{r.flat.flat_no}{r.flat.floor ? <div className="sub">Floor {r.flat.floor}</div> : null}</td>
                      <td>
                        {r.flat.owner_name || <span className="muted">Not set</span>}
                        {r.flat.owner_phone && <div className="sub">{r.flat.owner_phone}</div>}
                        {r.flat.owner_account && <div className="sub" style={{ whiteSpace: 'pre-wrap' }}>{r.flat.owner_account}</div>}
                      </td>
                      <td className="num r">{r.due ? money(r.due) : <span className="muted">—</span>}</td>
                      <td className="num r">{r.paid ? money(r.paid) : <span className="muted">—</span>}</td>
                      <td className="num r strong">{r.remaining ? money(r.remaining) : <span className="muted">—</span>}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="r">
                        <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="btn small" onClick={() => setOwnerFlat(r.flat)}>Owner details</button>
                          {!error && <button className="btn small primary" onClick={() => setPayoutForm({ flat: r.flat, remaining: r.remaining })}>Pay</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Payout history</h2>
            <div className="actions">
              <input className="input" style={{ width: 220 }} placeholder="Search flat, owner, account, note…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="seg">
                <button className={historyScope === 'month' ? 'on' : ''} onClick={() => setHistoryScope('month')}>This month</button>
                <button className={historyScope === 'all' ? 'on' : ''} onClick={() => setHistoryScope('all')}>All time</button>
              </div>
              <button className="btn small" onClick={exportExcel} disabled={history.length === 0}>Download Excel</button>
            </div>
          </div>
          {history.length === 0 ? (
            <div className="empty">No payouts recorded {historyScope === 'month' ? `for ${monthLabel(period)}` : 'yet'}.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Paid on</th><th>Flat / Owner</th><th>For month</th><th className="r">Amount</th><th>Paid to</th><th>Note</th><th></th></tr>
                </thead>
                <tbody>
                  {history.map((p) => {
                    const f = flatById[p.flat_id]
                    const wa = f?.owner_phone ? waLink(f.owner_phone, settings?.country_code, shareText(p)) : null
                    return (
                      <tr key={p.id}>
                        <td className="num">{fmtDate(p.paid_on)}<div className="sub">#{p.payout_no}</div></td>
                        <td><span className="strong">{f?.flat_no || <span className="muted">Deleted flat</span>}</span><div className="sub">{p.owner_name}</div></td>
                        <td>{monthLabel(p.period)}</td>
                        <td className="num r strong">{money(p.amount)}</td>
                        <td>
                          <span className="badge navy">{p.method}</span>
                          {p.paid_to_account && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{p.paid_to_account}</div>}
                          {p.reference && <div className="sub">Ref: {p.reference}</div>}
                        </td>
                        <td><div style={noteStyle}>{p.note || <span className="muted">—</span>}</div></td>
                        <td className="r">
                          <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            {wa && (
                              <a className="btn small" href={wa} target="_blank" rel="noreferrer" title="Send details to owner on WhatsApp">
                                <svg viewBox="0 0 24 24" style={plainSvg}><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.6-5.4A8.4 8.4 0 1 1 21 11.5z" /></svg>
                                Send
                              </a>
                            )}
                            <button className="btn small" onClick={() => setPayoutForm({ payout: p })}>Edit</button>
                            {isAdmin && <button className="btn small danger" onClick={() => remove(p)}>Delete</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {payoutForm && (
        <PayoutModal
          flats={flats}
          period={period}
          payouts={payouts}
          initial={payoutForm}
          onClose={() => setPayoutForm(null)}
          onSaved={() => { setPayoutForm(null); load() }}
        />
      )}
      {ownerFlat && (
        <OwnerModal flat={ownerFlat} onClose={() => setOwnerFlat(null)} onSaved={() => { setOwnerFlat(null); load() }} />
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'paid') return <span className="badge green">Paid</span>
  if (status === 'partial') return <span className="badge amber">Part paid</span>
  if (status === 'pending') return <span className="badge red">To pay</span>
  return <span className="badge grey">Owner not set</span>
}

function PayoutModal({ flats, period, payouts, initial, onClose, onSaved }) {
  const { money, notify } = useApp()
  const editing = initial.payout || null

  const remainingFor = (flat, per) => {
    if (!flat) return 0
    const paid = payouts.filter((p) => p.flat_id === flat.id && p.period === per && p.id !== editing?.id)
      .reduce((s, p) => s + num(p.amount), 0)
    return Math.max(num(flat.owner_monthly_amount) - paid, 0)
  }

  const [form, setForm] = useState(() => {
    if (editing) {
      return {
        flat_id: editing.flat_id || '',
        owner_name: editing.owner_name || '',
        period: editing.period,
        amount: String(editing.amount),
        paid_on: editing.paid_on,
        method: editing.method || 'Bank transfer',
        paid_to_account: editing.paid_to_account || '',
        reference: editing.reference || '',
        note: editing.note || '',
      }
    }
    const f = initial.flat
    const amt = f ? (initial.remaining ?? remainingFor(f, period)) || num(f.owner_monthly_amount) : ''
    return {
      flat_id: f?.id || '',
      owner_name: f?.owner_name || '',
      period,
      amount: amt ? String(amt) : '',
      paid_on: todayStr(),
      method: 'Bank transfer',
      paid_to_account: f?.owner_account || '',
      reference: '',
      note: '',
    }
  })
  const [saveAccount, setSaveAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const flat = flats.find((f) => f.id === form.flat_id)
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))

  const pickFlat = (e) => {
    const f = flats.find((x) => x.id === e.target.value)
    setForm((s) => {
      const rem = remainingFor(f, s.period)
      return {
        ...s,
        flat_id: e.target.value,
        owner_name: f?.owner_name || '',
        paid_to_account: f?.owner_account || '',
        amount: editing ? s.amount : (rem || num(f?.owner_monthly_amount) || '') + '',
      }
    })
    setSaveAccount(false)
  }

  const accountIsNew = flat && form.paid_to_account.trim() && form.paid_to_account.trim() !== (flat.owner_account || '').trim()

  const save = async (e) => {
    e?.preventDefault()
    setErr('')
    if (!form.flat_id) return setErr('Choose the flat this payout is for.')
    if (!form.period) return setErr('Choose which month this payout is for.')
    const amount = Number(form.amount)
    if (!(amount > 0)) return setErr('Enter an amount greater than 0.')
    if (!form.paid_on) return setErr('Enter the date the money was paid.')

    const row = {
      flat_id: form.flat_id,
      owner_name: form.owner_name.trim() || null,
      period: form.period.slice(0, 7) + '-01',
      amount,
      paid_on: form.paid_on,
      method: form.method,
      paid_to_account: form.paid_to_account.trim() || null,
      reference: form.reference.trim() || null,
      note: form.note.trim() || null,
    }
    setBusy(true)
    try {
      if (editing) check(await supabase.from('owner_payouts').update(row).eq('id', editing.id))
      else check(await supabase.from('owner_payouts').insert(row))

      const flatUpdate = {}
      if (saveAccount && accountIsNew) flatUpdate.owner_account = row.paid_to_account
      if (!flat.owner_name && row.owner_name) flatUpdate.owner_name = row.owner_name
      if (Object.keys(flatUpdate).length) check(await supabase.from('flats').update(flatUpdate).eq('id', flat.id))

      notify(editing ? 'Payout updated' : `Payout of ${money(amount)} recorded`)
      onSaved()
    } catch (x) {
      setErr(x.message)
      setBusy(false)
    }
  }

  const rem = remainingFor(flat, form.period.slice(0, 7) + '-01')

  return (
    <Modal title={editing ? `Edit payout #${editing.payout_no}` : 'Record payout to owner'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save payout'}</button></>}>
      <form onSubmit={save} className="form-grid">
        <Field label="Flat">
          <select value={form.flat_id} onChange={pickFlat} autoFocus={!initial.flat && !editing}>
            <option value="">Choose a flat…</option>
            {flats.map((f) => <option key={f.id} value={f.id}>{f.flat_no}{f.owner_name ? ` — ${f.owner_name}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Owner name">
          <input value={form.owner_name} onChange={set('owner_name')} placeholder="Flat owner" />
        </Field>
        <Field label="For month">
          <input type="month" value={form.period.slice(0, 7)} onChange={(e) => setForm((s) => ({ ...s, period: e.target.value ? e.target.value + '-01' : '' }))} />
        </Field>
        <Field label="Amount paid">
          <input type="number" inputMode="decimal" min="0" step="any" value={form.amount} onChange={set('amount')} autoFocus={!!initial.flat} />
        </Field>
        {flat && num(flat.owner_monthly_amount) > 0 && (
          <div className="info-box full">
            Monthly amount for this owner: <strong>{money(flat.owner_monthly_amount)}</strong> · still to pay for this month: <strong>{money(rem)}</strong>
          </div>
        )}
        <Field label="Paid on">
          <input type="date" value={form.paid_on} onChange={set('paid_on')} />
        </Field>
        <Field label="Method">
          <select value={form.method} onChange={set('method')}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Paid to account" full>
          <textarea rows={2} value={form.paid_to_account} onChange={set('paid_to_account')}
            placeholder="e.g. Meezan Bank · Title: Ahmed Khan · A/C 0123-4567890 (or IBAN PK00MEZN…)" />
        </Field>
        {accountIsNew && (
          <label className="check full">
            <input type="checkbox" checked={saveAccount} onChange={(e) => setSaveAccount(e.target.checked)} />
            <span>Save this account on flat {flat.flat_no} so it fills in automatically next time</span>
          </label>
        )}
        <Field label="Transaction ID / cheque no." full>
          <input value={form.reference} onChange={set('reference')} placeholder="Optional" />
        </Field>
        <Field label="Note" full>
          <textarea rows={3} value={form.note} onChange={set('note')}
            placeholder="Any other details — e.g. deducted Rs. 2,000 for plumbing repair, paid in two parts, sent to owner's son…" />
        </Field>
        {err && <div className="error-box full">{err}</div>}
      </form>
    </Modal>
  )
}

function OwnerModal({ flat, onClose, onSaved }) {
  const { money, notify } = useApp()
  const [form, setForm] = useState({
    owner_name: flat.owner_name || '',
    owner_phone: flat.owner_phone || '',
    owner_account: flat.owner_account || '',
    owner_monthly_amount: flat.owner_monthly_amount ? String(flat.owner_monthly_amount) : '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))

  const save = async (e) => {
    e?.preventDefault()
    setErr('')
    const amt = form.owner_monthly_amount === '' ? 0 : Number(form.owner_monthly_amount)
    if (!(amt >= 0)) return setErr('Monthly amount must be 0 or more.')
    setBusy(true)
    try {
      check(await supabase.from('flats').update({
        owner_name: form.owner_name.trim() || null,
        owner_phone: form.owner_phone.trim() || null,
        owner_account: form.owner_account.trim() || null,
        owner_monthly_amount: amt,
      }).eq('id', flat.id))
      notify(`Owner details saved for flat ${flat.flat_no}`)
      onSaved()
    } catch (x) {
      setErr(x.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Owner of flat ${flat.flat_no}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form onSubmit={save} className="form-grid">
        <Field label="Owner name">
          <input value={form.owner_name} onChange={set('owner_name')} autoFocus />
        </Field>
        <Field label="Owner phone">
          <input type="tel" value={form.owner_phone} onChange={set('owner_phone')} placeholder="03xx xxxxxxx" />
        </Field>
        <Field label="Amount to pay owner each month" full>
          <input type="number" inputMode="decimal" min="0" step="any" value={form.owner_monthly_amount} onChange={set('owner_monthly_amount')} placeholder="0" />
        </Field>
        <div className="muted small full" style={{ marginTop: -8 }}>
          Rent charged for this flat: {money(flat.monthly_rent)}. Leave the owner amount at 0 if you don't pay a fixed amount.
        </div>
        <Field label="Owner's bank account" full>
          <textarea rows={3} value={form.owner_account} onChange={set('owner_account')}
            placeholder="Bank name, account title, account number / IBAN, or JazzCash / Easypaisa number" />
        </Field>
        {err && <div className="error-box full">{err}</div>}
      </form>
    </Modal>
  )
}
