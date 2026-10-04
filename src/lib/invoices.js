import { supabase, check, fetchAll } from '../supabase'
import { invoiceFigures } from './ledger'
import { nextMonthStart, dueDateFor, todayStr } from './format'

// Create (or refresh) invoices for the given residents for one month.
// Returns [{ resident, invoice, lines }] ready for the PDF generator.
export async function createInvoices(residents, period, settings) {
  if (!residents.length) return []
  const next = nextMonthStart(period)
  const ids = residents.map((r) => r.id)
  const few = ids.length <= 100

  const charges = await fetchAll(() => {
    let q = supabase.from('charges').select('*').lte('period', period).order('id')
    return few ? q.in('resident_id', ids) : q
  })
  const payments = await fetchAll(() => {
    let q = supabase.from('payments').select('*').lt('paid_on', next).order('id')
    return few ? q.in('resident_id', ids) : q
  })

  const group = (arr) => arr.reduce((m, x) => ((m[x.resident_id] ||= []).push(x), m), {})
  const cBy = group(charges)
  const pBy = group(payments)

  const prepared = residents.map((r) => {
    const fig = invoiceFigures(cBy[r.id] || [], pBy[r.id] || [], period, next)
    return { resident: r, fig }
  })

  const rows = prepared.map(({ resident, fig }) => ({
    resident_id: resident.id,
    period,
    issue_date: todayStr(),
    due_date: dueDateFor(period, settings.due_day),
    previous_balance: fig.previous_balance,
    current_charges: fig.current_charges,
    payments_in_month: fig.payments_in_month,
    total_due: fig.total_due,
  }))

  const saved = []
  for (let i = 0; i < rows.length; i += 200) {
    const part = check(await supabase.from('invoices').upsert(rows.slice(i, i + 200), { onConflict: 'resident_id,period' }).select())
    saved.push(...part)
  }
  const invBy = Object.fromEntries(saved.map((x) => [x.resident_id, x]))

  return prepared.map(({ resident, fig }) => ({ resident, invoice: invBy[resident.id], lines: fig.lines }))
}
