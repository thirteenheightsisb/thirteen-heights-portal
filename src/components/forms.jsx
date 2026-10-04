import { useEffect, useMemo, useState } from 'react'
import { supabase, check } from '../supabase'
import { useApp } from '../context'
import { Modal, Field } from './ui'
import { todayStr, periodOf, monthLabel, dueDateFor, CHARGE_TYPES, PAYMENT_METHODS, currentMonth } from '../lib/format'
import { downloadReceipt } from '../lib/pdf'

function useSubmit(fn) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (e) => {
    e?.preventDefault?.()
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v))

/* ------------------------------------------------------------------ */
export function FlatForm({ flat, onClose, onSaved }) {
  const { notify } = useApp()
  const [f, setF] = useState({
    flat_no: flat?.flat_no || '', floor: flat?.floor || '', flat_type: flat?.flat_type || '',
    monthly_rent: flat?.monthly_rent ?? '', notes: flat?.notes || '',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const { busy, error, run } = useSubmit(async () => {
    if (!f.flat_no.trim()) throw new Error('Flat number is required.')
    const row = { ...f, flat_no: f.flat_no.trim(), monthly_rent: num(f.monthly_rent) }
    if (flat) check(await supabase.from('flats').update(row).eq('id', flat.id))
    else check(await supabase.from('flats').insert(row))
    notify(flat ? 'Flat updated' : 'Flat added')
    onSaved()
  })
  return (
    <Modal title={flat ? `Edit flat ${flat.flat_no}` : 'Add flat'} onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={run}>{flat ? 'Save changes' : 'Add flat'}</button></>}>
      <form className="form-grid" onSubmit={run}>
        <Field label="Flat number *"><input value={f.flat_no} onChange={set('flat_no')} placeholder="e.g. 101 or A-3" autoFocus /></Field>
        <Field label="Floor"><input value={f.floor} onChange={set('floor')} placeholder="e.g. Ground, 1, 2" /></Field>
        <Field label="Type"><input value={f.flat_type} onChange={set('flat_type')} placeholder="e.g. 2 bed" /></Field>
        <Field label="Monthly rent"><input type="number" min="0" value={f.monthly_rent} onChange={set('monthly_rent')} /></Field>
        <Field label="Notes" full><textarea value={f.notes} onChange={set('notes')} /></Field>
        {error && <div className="error-box full">{error}</div>}
        <button hidden type="submit" />
      </form>
    </Modal>
  )
}

export function BulkFlatsForm({ onClose, onSaved }) {
  const { notify } = useApp()
  const [f, setF] = useState({ floor: '', prefix: '', from: '', to: '', flat_type: '', monthly_rent: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const preview = useMemo(() => {
    const a = parseInt(f.from, 10), b = parseInt(f.to, 10)
    if (isNaN(a) || isNaN(b) || b < a || b - a > 200) return []
    return Array.from({ length: b - a + 1 }, (_, i) => `${f.prefix}${a + i}`)
  }, [f])
  const { busy, error, run } = useSubmit(async () => {
    if (!preview.length) throw new Error('Enter a valid number range (for example 101 to 110).')
    const rows = preview.map((no) => ({ flat_no: no, floor: f.floor || null, flat_type: f.flat_type || null, monthly_rent: num(f.monthly_rent) }))
    check(await supabase.from('flats').insert(rows))
    notify(`${rows.length} flats added`)
    onSaved()
  })
  return (
    <Modal title="Add several flats" onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={run}>Add {preview.length || ''} flats</button></>}>
      <form className="form-grid" onSubmit={run}>
        <Field label="Floor"><input value={f.floor} onChange={set('floor')} placeholder="e.g. 1" autoFocus /></Field>
        <Field label="Prefix (optional)"><input value={f.prefix} onChange={set('prefix')} placeholder="e.g. A-" /></Field>
        <Field label="From number"><input type="number" value={f.from} onChange={set('from')} placeholder="101" /></Field>
        <Field label="To number"><input type="number" value={f.to} onChange={set('to')} placeholder="110" /></Field>
        <Field label="Type"><input value={f.flat_type} onChange={set('flat_type')} placeholder="e.g. 2 bed" /></Field>
        <Field label="Monthly rent (each)"><input type="number" min="0" value={f.monthly_rent} onChange={set('monthly_rent')} /></Field>
        {preview.length > 0 && <div className="info-box full">Will add: {preview.slice(0, 12).join(', ')}{preview.length > 12 ? ` … (${preview.length} total)` : ''}</div>}
        {error && <div className="error-box full">{error}</div>}
        <button hidden type="submit" />
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
export function ResidentForm({ resident, presetFlatId, onClose, onSaved }) {
  const { notify, money, settings } = useApp()
  const editing = Boolean(resident)
  const [flats, setFlats] = useState([])
  const [f, setF] = useState({
    full_name: resident?.full_name || '', phone: resident?.phone || '', cnic: resident?.cnic || '',
    email: resident?.email || '', occupation: resident?.occupation || '', persons: resident?.persons ?? 1,
    permanent_address: resident?.permanent_address || '', emergency_name: resident?.emergency_name || '',
    emergency_phone: resident?.emergency_phone || '', flat_id: resident?.flat_id || presetFlatId || '',
    monthly_rent: resident?.monthly_rent ?? '', security_deposit: resident?.security_deposit ?? '',
    check_in: resident?.check_in || todayStr(), notes: resident?.notes || '',
  })
  const [chargeDeposit, setChargeDeposit] = useState(true)
  const [chargeRent, setChargeRent] = useState(true)
  const [firstRent, setFirstRent] = useState('')

  useEffect(() => {
    supabase.from('flats_overview').select('id, flat_no, floor, monthly_rent, occupancy, resident_id').order('flat_no')
      .then(({ data }) => {
        const list = (data || []).filter((x) => x.occupancy === 'vacant' || x.id === resident?.flat_id)
        setFlats(list)
        if (!editing && presetFlatId) {
          const fl = list.find((x) => x.id === presetFlatId)
          if (fl) {
            setF((cur) => ({ ...cur, monthly_rent: cur.monthly_rent === '' ? fl.monthly_rent : cur.monthly_rent }))
            setFirstRent((cur) => (cur === '' ? fl.monthly_rent : cur))
          }
        }
      })
  }, [])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const pickFlat = (e) => {
    const id = e.target.value
    const fl = flats.find((x) => x.id === id)
    setF({ ...f, flat_id: id, monthly_rent: fl && !editing ? fl.monthly_rent : f.monthly_rent })
    if (fl && !editing) setFirstRent(fl.monthly_rent)
  }

  const { busy, error, run } = useSubmit(async () => {
    if (!f.full_name.trim()) throw new Error('Name is required.')
    const row = {
      ...f, full_name: f.full_name.trim(), flat_id: f.flat_id || null,
      persons: Math.max(1, parseInt(f.persons, 10) || 1),
      monthly_rent: num(f.monthly_rent), security_deposit: num(f.security_deposit),
    }
    if (editing) {
      check(await supabase.from('residents').update(row).eq('id', resident.id))
      notify('Resident updated')
      return onSaved(resident.id)
    }
    const created = check(await supabase.from('residents').insert(row).select().single())
    const period = periodOf(row.check_in)
    const extra = []
    if (chargeDeposit && row.security_deposit > 0) {
      extra.push({ resident_id: created.id, flat_id: row.flat_id, type: 'deposit', description: 'Security deposit', amount: row.security_deposit, period, due_date: row.check_in })
    }
    if (chargeRent && num(firstRent) > 0) {
      extra.push({ resident_id: created.id, flat_id: row.flat_id, type: 'rent', description: `Rent - ${monthLabel(period)}`, amount: num(firstRent), period, due_date: row.check_in })
    }
    if (extra.length) check(await supabase.from('charges').insert(extra))
    notify('Resident added')
    onSaved(created.id)
  })

  return (
    <Modal title={editing ? `Edit ${resident.full_name}` : 'Add resident'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={run}>{editing ? 'Save changes' : 'Add resident'}</button></>}>
      <form className="form-grid" onSubmit={run}>
        <div className="form-section">Personal details</div>
        <Field label="Full name *"><input value={f.full_name} onChange={set('full_name')} autoFocus /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} placeholder="0300-1234567" inputMode="tel" /></Field>
        <Field label="CNIC / ID number"><input value={f.cnic} onChange={set('cnic')} placeholder="12345-1234567-1" /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Occupation / institute"><input value={f.occupation} onChange={set('occupation')} /></Field>
        <Field label="Number of people living"><input type="number" min="1" value={f.persons} onChange={set('persons')} /></Field>
        <Field label="Permanent address" full><input value={f.permanent_address} onChange={set('permanent_address')} /></Field>
        <Field label="Emergency contact name"><input value={f.emergency_name} onChange={set('emergency_name')} /></Field>
        <Field label="Emergency contact phone"><input value={f.emergency_phone} onChange={set('emergency_phone')} inputMode="tel" /></Field>

        <div className="form-section">Flat and payment terms</div>
        <Field label="Flat" hint={flats.length === 0 ? 'No vacant flats. Add flats first or check someone out.' : 'Only vacant flats are shown'}>
          <select value={f.flat_id} onChange={pickFlat}>
            <option value="">— Select flat —</option>
            {flats.map((x) => <option key={x.id} value={x.id}>{x.flat_no}{x.floor ? ` (floor ${x.floor})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Check-in date"><input type="date" value={f.check_in} onChange={set('check_in')} /></Field>
        <Field label="Monthly rent" hint="Filled from the flat; change it if this resident has a different deal">
          <input type="number" min="0" value={f.monthly_rent} onChange={set('monthly_rent')} />
        </Field>
        <Field label="Security deposit" hint={editing ? 'Changing this does not change charges already added' : undefined}>
          <input type="number" min="0" value={f.security_deposit} onChange={set('security_deposit')} />
        </Field>
        {!editing && (
          <>
            <label className="check full">
              <input type="checkbox" checked={chargeDeposit} onChange={(e) => setChargeDeposit(e.target.checked)} />
              <span>Add the security deposit to this resident's account ({money(num(f.security_deposit))})</span>
            </label>
            <label className="check full">
              <input type="checkbox" checked={chargeRent} onChange={(e) => setChargeRent(e.target.checked)} />
              <span>Charge rent for {monthLabel(f.check_in)} now. Future months are added from the Billing page.</span>
            </label>
            {chargeRent && (
              <Field label={`Rent for ${monthLabel(f.check_in)}`} hint="Reduce it if they moved in mid-month">
                <input type="number" min="0" value={firstRent} onChange={(e) => setFirstRent(e.target.value)} />
              </Field>
            )}
          </>
        )}
        <Field label="Notes" full><textarea value={f.notes} onChange={set('notes')} /></Field>
        {error && <div className="error-box full">{error}</div>}
        <button hidden type="submit" />
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
export function PaymentForm({ resident, onClose, onSaved }) {
  const { notify, money, settings } = useApp()
  const [residents, setResidents] = useState([])
  const [rid, setRid] = useState(resident?.id || '')
  const selected = resident || residents.find((r) => r.id === rid)
  const [f, setF] = useState({
    amount: resident && Number(resident.balance) > 0 ? resident.balance : '',
    paid_on: todayStr(), method: 'Cash', reference: '', note: '',
  })
  const [receipt, setReceipt] = useState(true)

  useEffect(() => {
    if (resident) return
    supabase.from('residents_overview').select('id, full_name, flat_no, phone, balance, status').order('full_name')
      .then(({ data }) => setResidents((data || []).filter((r) => r.status === 'active' || Number(r.balance) > 0)))
  }, [])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const pick = (e) => {
    const r = residents.find((x) => x.id === e.target.value)
    setRid(e.target.value)
    if (r && Number(r.balance) > 0) setF({ ...f, amount: r.balance })
  }

  const { busy, error, run } = useSubmit(async () => {
    if (!selected) throw new Error('Choose a resident.')
    if (!(num(f.amount) > 0)) throw new Error('Enter an amount greater than zero.')
    const payment = check(await supabase.from('payments').insert({ ...f, amount: num(f.amount), resident_id: selected.id, kind: 'payment' }).select().single())
    if (receipt) {
      downloadReceipt({ settings, resident: { ...selected, balance: Number(selected.balance || 0) - num(f.amount) }, payment })
    }
    notify(`Payment of ${money(f.amount)} saved`)
    onSaved(payment)
  })

  return (
    <Modal title="Record payment" onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn success" disabled={busy} onClick={run}>Save payment</button></>}>
      <form className="form-grid" onSubmit={run}>
        {resident ? (
          <div className="info-box full">
            <strong>{resident.full_name}</strong> · Flat {resident.flat_no || '—'}<br />
            Currently due: <strong>{money(resident.balance)}</strong>
          </div>
        ) : (
          <Field label="Resident" full>
            <select value={rid} onChange={pick} autoFocus>
              <option value="">— Select resident —</option>
              {residents.map((r) => <option key={r.id} value={r.id}>{r.full_name} — Flat {r.flat_no || '—'} — due {money(r.balance)}</option>)}
            </select>
          </Field>
        )}
        <Field label="Amount received *"><input type="number" min="0" value={f.amount} onChange={set('amount')} autoFocus={Boolean(resident)} /></Field>
        <Field label="Date"><input type="date" value={f.paid_on} onChange={set('paid_on')} /></Field>
        <Field label="Method">
          <select value={f.method} onChange={set('method')}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </Field>
        <Field label="Reference / transaction ID"><input value={f.reference} onChange={set('reference')} /></Field>
        <Field label="Note" full><input value={f.note} onChange={set('note')} /></Field>
        <label className="check full"><input type="checkbox" checked={receipt} onChange={(e) => setReceipt(e.target.checked)} /><span>Download receipt (PDF) after saving</span></label>
        {error && <div className="error-box full">{error}</div>}
        <button hidden type="submit" />
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
export function ChargeForm({ resident, onClose, onSaved }) {
  const { notify, settings } = useApp()
  const [f, setF] = useState({ type: 'utilities', month: currentMonth(), description: '', amount: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const autoDesc = `${CHARGE_TYPES[f.type]} - ${monthLabel(f.month)}`
  const { busy, error, run } = useSubmit(async () => {
    if (!(num(f.amount) > 0)) throw new Error('Enter an amount greater than zero.')
    const period = periodOf(f.month)
    check(await supabase.from('charges').insert({
      resident_id: resident.id, flat_id: resident.flat_id, type: f.type,
      description: f.description.trim() || autoDesc, amount: num(f.amount), period,
      due_date: dueDateFor(period, settings.due_day),
    }))
    notify('Charge added')
    onSaved()
  })
  return (
    <Modal title={`Add charge — ${resident.full_name}`} onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={run}>Add charge</button></>}>
      <form className="form-grid" onSubmit={run}>
        <Field label="Type">
          <select value={f.type} onChange={set('type')}>{Object.entries(CHARGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Month"><input type="month" value={f.month} onChange={set('month')} /></Field>
        <Field label="Amount *"><input type="number" min="0" value={f.amount} onChange={set('amount')} autoFocus /></Field>
        <Field label="Description"><input value={f.description} onChange={set('description')} placeholder={autoDesc} /></Field>
        {error && <div className="error-box full">{error}</div>}
        <button hidden type="submit" />
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
export function CheckoutForm({ resident, depositCharged, onClose, onSaved }) {
  const { notify, money, settings } = useApp()
  const balance = Number(resident.balance || 0)
  const [date, setDate] = useState(todayStr())
  const [adjust, setAdjust] = useState(depositCharged > 0)
  const afterAdjust = balance - (adjust ? depositCharged : 0)
  const [refund, setRefund] = useState(afterAdjust < 0 ? -afterAdjust : 0)
  useEffect(() => setRefund(afterAdjust < 0 ? -afterAdjust : 0), [adjust])
  const final = afterAdjust + num(refund)

  const { busy, error, run } = useSubmit(async () => {
    if (adjust && depositCharged > 0) {
      check(await supabase.from('payments').insert({
        resident_id: resident.id, amount: depositCharged, kind: 'payment', method: 'Deposit adjusted',
        paid_on: date, note: 'Security deposit adjusted at check-out',
      }))
    }
    if (num(refund) > 0) {
      const p = check(await supabase.from('payments').insert({
        resident_id: resident.id, amount: num(refund), kind: 'refund', method: 'Cash', paid_on: date, note: 'Refund at check-out',
      }).select().single())
      downloadReceipt({ settings, resident: { ...resident, balance: final }, payment: p })
    }
    check(await supabase.from('residents').update({ status: 'left', check_out: date }).eq('id', resident.id))
    notify(`${resident.full_name} checked out. Flat ${resident.flat_no || ''} is now vacant.`)
    onSaved()
  })

  return (
    <Modal title={`Check out ${resident.full_name}`} onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={run}>Check out</button></>}>
      <div className="form-grid">
        <Field label="Check-out date" full><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <dl className="details full">
          <dt>Current balance</dt><dd className="num">{money(balance)}</dd>
          <dt>Deposit charged</dt><dd className="num">{money(depositCharged)}</dd>
        </dl>
        {depositCharged > 0 && (
          <label className="check full">
            <input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
            <span>Adjust the security deposit ({money(depositCharged)}) against their account</span>
          </label>
        )}
        {afterAdjust < 0 && (
          <Field label="Refund to give back" hint={`We owe them ${money(-afterAdjust)}`} full>
            <input type="number" min="0" value={refund} onChange={(e) => setRefund(e.target.value)} />
          </Field>
        )}
        <div className={`full ${final > 0 ? 'error-box' : 'info-box'}`}>
          {final > 0
            ? `After check-out they will still owe ${money(final)}. You can keep recording their payments later.`
            : final < 0
              ? `${money(-final)} will remain as their credit.`
              : 'Account will be fully settled.'}
        </div>
        {error && <div className="error-box full">{error}</div>}
      </div>
    </Modal>
  )
}
