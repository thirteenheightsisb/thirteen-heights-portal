import { useState } from 'react'
import { supabase, check, fetchAll } from '../supabase'
import { useApp } from '../context'
import { Field } from '../components/ui'
import { todayStr } from '../lib/format'
import { exportToExcel } from '../lib/exportXlsx'

export default function Settings() {
  const { settings, setSettings, notify } = useApp()
  const [f, setF] = useState({ ...settings })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try {
      const row = {
        hostel_name: f.hostel_name?.trim() || 'My Hostel', address: f.address, phone: f.phone,
        currency: f.currency?.trim() || 'Rs.', country_code: String(f.country_code || '92').replace(/\D/g, '') || '92',
        due_day: Math.min(28, Math.max(1, parseInt(f.due_day, 10) || 1)), invoice_note: f.invoice_note, updated_at: new Date().toISOString(),
      }
      const saved = check(await supabase.from('settings').update(row).eq('id', 1).select().single())
      setSettings(saved); setF(saved)
      notify('Settings saved')
    } catch (x) { notify(x.message, 'error') }
    setBusy(false)
  }

  const backup = async () => {
    setBusy(true)
    try {
      const [flats, residents, charges, payments, invoices] = await Promise.all([
        fetchAll(() => supabase.from('flats').select('*').order('flat_no')),
        fetchAll(() => supabase.from('residents_overview').select('*').order('full_name')),
        fetchAll(() => supabase.from('charges').select('*, residents(full_name)').order('period').order('id')),
        fetchAll(() => supabase.from('payments').select('*, residents(full_name)').order('paid_on').order('id')),
        fetchAll(() => supabase.from('invoices').select('*, residents(full_name)').order('period').order('id')),
      ])
      const flat = (rows) => rows.map(({ residents: r, ...rest }) => ({ resident_name: r?.full_name, ...rest }))
      await exportToExcel({ Flats: flats, Residents: residents, Charges: flat(charges), Payments: flat(payments), Invoices: flat(invoices) }, `Hostel_backup_${todayStr()}.xlsx`)
      notify('Backup downloaded')
    } catch (x) { notify(x.message, 'error') }
    setBusy(false)
  }

  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><p>These details appear on invoices and receipts.</p></div></div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <form className="panel" onSubmit={save}>
          <div className="panel-head"><h2>Hostel details</h2></div>
          <div className="panel-body form-grid">
            <Field label="Hostel / building name" full><input value={f.hostel_name || ''} onChange={set('hostel_name')} /></Field>
            <Field label="Address" full><input value={f.address || ''} onChange={set('address')} /></Field>
            <Field label="Contact phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
            <Field label="Currency symbol"><input value={f.currency || ''} onChange={set('currency')} placeholder="Rs." /></Field>
            <Field label="Bill due day" hint="Day of the month rent is due (1–28)"><input type="number" min="1" max="28" value={f.due_day ?? 1} onChange={set('due_day')} /></Field>
            <Field label="Phone country code" hint="Used for WhatsApp links, e.g. 92"><input value={f.country_code || ''} onChange={set('country_code')} /></Field>
            <Field label="Note printed on invoices" full><textarea value={f.invoice_note || ''} onChange={set('invoice_note')} placeholder="e.g. Bank: Meezan, Account 0123… Please pay by the due date." /></Field>
          </div>
          <div className="modal-foot"><button className="btn primary" disabled={busy}>Save settings</button></div>
        </form>

        <div className="panel">
          <div className="panel-head"><h2>Backup</h2></div>
          <div className="panel-body">
            <p style={{ marginTop: 0 }}>Download everything — flats, residents, charges, payments and invoices — as one Excel file. The free database plan has no automatic backups, so do this once a week and keep the file safe.</p>
            <button className="btn" disabled={busy} onClick={backup}>Download full backup</button>
          </div>
        </div>
      </div>
    </>
  )
}
