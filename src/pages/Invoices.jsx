import { useEffect, useState } from 'react'
import { supabase, fetchAll } from '../supabase'
import { useApp } from '../context'
import { Loading, Empty } from '../components/ui'
import { currentMonth, periodOf, monthLabel, fmtDate, whatsappLink } from '../lib/format'
import { createInvoices } from '../lib/invoices'
import { downloadInvoice, downloadInvoicesCombined } from '../lib/pdf'

export default function Invoices() {
  const { money, settings, notify, go } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const period = periodOf(month)

  const load = async () => {
    setRows(null)
    try {
      const inv = await fetchAll(() => supabase.from('invoices').select('*').eq('period', period).order('invoice_no'))
      const ids = [...new Set(inv.map((i) => i.resident_id))]
      const res = ids.length
        ? await fetchAll(() => supabase.from('residents_overview').select('id, full_name, phone, cnic, flat_no, status, balance').order('id'))
        : []
      const by = Object.fromEntries(res.map((r) => [r.id, r]))
      setRows(inv.map((i) => ({ ...i, residents_overview: by[i.resident_id] })))
    } catch (e) { notify(e.message, 'error'); setRows([]) }
  }
  useEffect(() => { load() }, [month])

  const targets = async () => {
    const all = await fetchAll(() => supabase.from('residents_overview').select('*').order('id'))
    return all.filter((r) => r.status === 'active' || Number(r.balance) > 0)
      .sort((a, b) => String(a.flat_no).localeCompare(String(b.flat_no), undefined, { numeric: true }))
  }

  const createAll = async (download) => {
    setBusy(true)
    try {
      const list = await targets()
      if (!list.length) throw new Error('No residents to invoice.')
      const data = await createInvoices(list, period, settings)
      if (download) await downloadInvoicesCombined(data.map((d) => ({ settings, ...d })), period)
      notify(`${data.length} invoices ready for ${monthLabel(month)}`)
      load()
    } catch (e) { notify(e.message, 'error') }
    setBusy(false)
  }

  const one = async (resident) => {
    try {
      const [d] = await createInvoices([resident], period, settings)
      await downloadInvoice({ settings, ...d })
    } catch (e) { notify(e.message, 'error') }
  }

  const shareText = (inv, r) =>
    `Assalam o Alaikum ${r.full_name}, your ${settings.hostel_name} invoice for ${monthLabel(month)} (Flat ${r.flat_no || ''}): total amount due ${money(inv.total_due)}, due by ${fmtDate(inv.due_date)}. Thank you.`

  const total = (rows || []).reduce((s, x) => s + Math.max(0, Number(x.total_due)), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Invoices</h1>
          <p>{monthLabel(month)}{rows?.length ? ` · ${rows.length} invoices · ${money(total)} billed` : ''}</p>
        </div>
        <div className="actions">
          <input type="month" className="input" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Invoice month" />
          <button className="btn" disabled={busy} onClick={() => createAll(false)}>{rows?.length ? 'Refresh invoices' : 'Create invoices'}</button>
          <button className="btn primary" disabled={busy} onClick={() => createAll(true)}>Download all (one PDF)</button>
        </div>
      </div>

      <div className="info-box" style={{ marginBottom: 14 }}>
        Add this month's rent and electricity bills on <a href="#/billing">Monthly billing</a> first, then create invoices. Each invoice shows the month's charges, any older unpaid balance, and payments received.
      </div>

      <div className="panel table-wrap">
        {!rows ? <Loading /> : rows.length === 0 ? (
          <Empty action={<button className="btn primary" disabled={busy} onClick={() => createAll(false)}>Create invoices for {monthLabel(month)}</button>}>
            No invoices for {monthLabel(month)} yet.
          </Empty>
        ) : (
          <table>
            <thead><tr><th>Invoice</th><th>Resident</th><th className="r">Previous</th><th className="r">This month</th><th className="r">Total due</th><th>Now</th><th></th></tr></thead>
            <tbody>
              {rows.map((inv) => {
                const r = inv.residents_overview || {}
                const wa = whatsappLink(r.phone, shareText(inv, r), settings.country_code)
                return (
                  <tr key={inv.id}>
                    <td className="sub">INV-{String(inv.invoice_no).padStart(5, '0')}</td>
                    <td className="click" onClick={() => go('resident', inv.resident_id)}><div className="strong">{r.full_name}</div><div className="sub">Flat {r.flat_no || '—'}</div></td>
                    <td className="r num">{money(inv.previous_balance)}</td>
                    <td className="r num">{money(inv.current_charges)}</td>
                    <td className="r num strong">{money(inv.total_due)}</td>
                    <td>{Number(r.balance) > 0 ? <span className="badge amber">Due {money(r.balance)}</span> : <span className="badge green">Paid</span>}</td>
                    <td className="r">
                      <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {wa && <a className="btn small" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
                        <button className="btn small" onClick={() => one(r)}>PDF</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
