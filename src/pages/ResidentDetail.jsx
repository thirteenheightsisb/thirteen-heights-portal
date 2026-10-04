import { useEffect, useState } from 'react'
import { supabase, check } from '../supabase'
import { useApp } from '../context'
import { Loading, Modal, Field, BalanceBadge, Empty } from '../components/ui'
import { ResidentForm, PaymentForm, ChargeForm, CheckoutForm } from '../components/forms'
import { buildLedger } from '../lib/ledger'
import { createInvoices } from '../lib/invoices'
import { downloadInvoice, downloadReceipt } from '../lib/pdf'
import { fmtDate, monthLabel, currentMonth, periodOf, whatsappLink, CHARGE_TYPES } from '../lib/format'

export default function ResidentDetail({ id }) {
  const { money, go, isAdmin, notify, settings } = useApp()
  const [r, setR] = useState(null)
  const [charges, setCharges] = useState([])
  const [payments, setPayments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [modal, setModal] = useState(null)
  const [missing, setMissing] = useState(false)

  const load = async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('residents_overview').select('*').eq('id', id).maybeSingle(),
      supabase.from('charges').select('*').eq('resident_id', id).order('period'),
      supabase.from('payments').select('*').eq('resident_id', id).order('paid_on'),
      supabase.from('invoices').select('*').eq('resident_id', id).order('period', { ascending: false }),
    ])
    if (!a.data) return setMissing(true)
    setR(a.data); setCharges(b.data || []); setPayments(c.data || []); setInvoices(d.data || [])
  }
  useEffect(() => { load() }, [id])

  if (missing) return <Empty action={<button className="btn" onClick={() => go('residents')}>Back to residents</button>}>This resident was not found. They may have been deleted.</Empty>
  if (!r) return <Loading />

  const ledger = buildLedger(charges, payments).reverse()
  const depositCharged = charges.filter((c) => c.type === 'deposit').reduce((s, c) => s + Number(c.amount), 0)
  const done = () => { setModal(null); load() }
  const wa = whatsappLink(
    r.phone,
    Number(r.balance) > 0
      ? `Assalam o Alaikum ${r.full_name}, this is a reminder from ${settings.hostel_name}. Your outstanding balance for Flat ${r.flat_no || ''} is ${money(r.balance)}. Kindly clear it at your earliest. Thank you.`
      : `Assalam o Alaikum ${r.full_name}, `,
    settings.country_code,
  )

  const invoiceFor = async (month) => {
    try {
      const [data] = await createInvoices([r], periodOf(month), settings)
      await downloadInvoice({ settings, ...data })
      notify(`Invoice for ${monthLabel(month)} downloaded`)
      setModal(null); load()
    } catch (e) { notify(e.message, 'error') }
  }

  const receipt = (p) => {
    const after = buildLedger(charges, payments).find((x) => x.id === p.id)?.balance
    downloadReceipt({ settings, resident: { ...r, balance: after }, payment: p })
  }

  const removeEntry = async (row) => {
    if (!window.confirm(`Delete this entry: "${row.label}" (${money(row.debit || row.credit)})?`)) return
    try {
      check(await supabase.from(row.source === 'charge' ? 'charges' : 'payments').delete().eq('id', row.id))
      notify('Entry deleted'); load()
    } catch (e) { notify(e.message, 'error') }
  }

  const removeResident = async () => {
    if (!window.confirm(`Permanently delete ${r.full_name} and ALL their charges, payments and invoices? This cannot be undone. (To keep history, use “Check out” instead.)`)) return
    try {
      check(await supabase.from('residents').delete().eq('id', r.id))
      notify('Resident deleted'); go('residents')
    } catch (e) { notify(e.message, 'error') }
  }

  const reactivate = async () => {
    if (!r.flat_id) return setModal('edit')
    try {
      check(await supabase.from('residents').update({ status: 'active', check_out: null }).eq('id', r.id))
      notify('Resident is active again'); load()
    } catch (e) { notify(e.message, 'error') }
  }

  return (
    <>
      <button className="back" onClick={() => history.length > 1 ? history.back() : go('residents')}>‹ Back</button>
      <div className="page-head">
        <div>
          <h1>{r.full_name}</h1>
          <p>
            Flat {r.flat_no || '—'}{r.floor ? `, floor ${r.floor}` : ''} ·{' '}
            {r.status === 'active' ? <span className="badge green">Active</span> : <span className="badge grey">Left {fmtDate(r.check_out)}</span>}
          </p>
        </div>
        <div className="actions">
          {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          <button className="btn" onClick={() => setModal('invoice')}>Invoice</button>
          <button className="btn" onClick={() => setModal('charge')}>Add charge</button>
          <button className="btn success" onClick={() => setModal('payment')}>Record payment</button>
        </div>
      </div>

      <div className="grid-main-side">
        <div className="stack">
          <div className="ledger-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 0 }}>
            <div><div className="label">Total charged</div><div className="value">{money(r.total_charges)}</div></div>
            <div><div className="label">Total paid</div><div className="value good">{money(Number(r.total_paid) - Number(r.total_refunded))}</div></div>
            <div><div className="label">Remaining</div><div className={`value ${Number(r.balance) > 0 ? 'due' : ''}`}>{money(r.balance)}</div><div className="foot"><BalanceBadge balance={r.balance} money={money} /></div></div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Account history</h2><span className="muted small">Newest first</span></div>
            {ledger.length === 0 ? <Empty>No charges or payments yet.</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Details</th><th className="r">Charge</th><th className="r">Paid</th><th className="r">Balance</th><th></th></tr></thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={row.source + row.id}>
                        <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</td>
                        <td>{row.label}{row.source === 'charge' && <div className="sub">{CHARGE_TYPES[row.type]}</div>}{row.source === 'payment' && row.raw.receipt_no && <div className="sub">Receipt #{row.raw.receipt_no}</div>}</td>
                        <td className="r num">{row.debit ? money(row.debit) : ''}</td>
                        <td className="r num" style={{ color: 'var(--green)' }}>{row.credit ? money(row.credit) : ''}</td>
                        <td className="r num strong">{money(row.balance)}</td>
                        <td className="r">
                          <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            {row.source === 'payment' && <button className="btn small" onClick={() => receipt(row.raw)}>Receipt</button>}
                            {isAdmin && <button className="btn small danger" onClick={() => removeEntry(row)} aria-label="Delete entry">✕</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h2>Details</h2>
              <button className="btn small" onClick={() => setModal('edit')}>Edit</button>
            </div>
            <div className="panel-body">
              <dl className="details">
                <dt>Phone</dt><dd>{r.phone || '—'}</dd>
                <dt>CNIC / ID</dt><dd>{r.cnic || '—'}</dd>
                <dt>Email</dt><dd>{r.email || '—'}</dd>
                <dt>Occupation</dt><dd>{r.occupation || '—'}</dd>
                <dt>People living</dt><dd>{r.persons}</dd>
                <dt>Monthly rent</dt><dd className="num">{money(r.monthly_rent)}</dd>
                <dt>Deposit</dt><dd className="num">{money(r.security_deposit)}</dd>
                <dt>Check-in</dt><dd>{fmtDate(r.check_in)}</dd>
                {r.check_out && <><dt>Check-out</dt><dd>{fmtDate(r.check_out)}</dd></>}
                <dt>Address</dt><dd>{r.permanent_address || '—'}</dd>
                <dt>Emergency</dt><dd>{r.emergency_name || '—'}{r.emergency_phone ? `, ${r.emergency_phone}` : ''}</dd>
                {r.notes && <><dt>Notes</dt><dd>{r.notes}</dd></>}
              </dl>
            </div>
            <div className="panel-body" style={{ borderTop: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {r.status === 'active'
                ? <button className="btn" onClick={() => setModal('checkout')}>Check out</button>
                : <button className="btn" onClick={reactivate}>Mark active again</button>}
              {isAdmin && <button className="btn danger" onClick={removeResident}>Delete resident</button>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Invoices</h2></div>
            {invoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
              <table>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td><div className="strong">{monthLabel(inv.period)}</div><div className="sub">INV-{String(inv.invoice_no).padStart(5, '0')}</div></td>
                      <td className="r num">{money(inv.total_due)}</td>
                      <td className="r"><button className="btn small" onClick={() => invoiceFor(inv.period.slice(0, 7))}>PDF</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {modal === 'edit' && <ResidentForm resident={r} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'payment' && <PaymentForm resident={r} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'charge' && <ChargeForm resident={r} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'checkout' && <CheckoutForm resident={r} depositCharged={depositCharged} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'invoice' && <InvoicePicker onClose={() => setModal(null)} onPick={invoiceFor} />}
    </>
  )
}

function InvoicePicker({ onClose, onPick }) {
  const [m, setM] = useState(currentMonth())
  const [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); await onPick(m); setBusy(false) }
  return (
    <Modal title="Download invoice" onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={go}>Download PDF</button></>}>
      <Field label="Month" hint="The invoice shows that month's charges plus any older unpaid balance.">
        <input type="month" value={m} onChange={(e) => setM(e.target.value)} />
      </Field>
    </Modal>
  )
}
