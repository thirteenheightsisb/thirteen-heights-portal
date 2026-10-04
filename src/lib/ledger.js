// Merge charges and payments into one list with a running balance
export function buildLedger(charges = [], payments = []) {
  const rows = [
    ...charges.map((c) => ({
      id: c.id, source: 'charge', date: c.due_date || c.period, sortDate: c.period, created: c.created_at,
      label: c.description || c.type, type: c.type, debit: Number(c.amount), credit: 0, raw: c,
    })),
    ...payments.map((p) => ({
      id: p.id, source: 'payment', date: p.paid_on, sortDate: p.paid_on, created: p.created_at,
      label: p.kind === 'refund'
        ? `Refund (${p.method})${p.note ? ' – ' + p.note : ''}`
        : p.method === 'Deposit adjusted'
          ? 'Security deposit adjusted'
          : `Payment received (${p.method})${p.reference ? ' – ' + p.reference : ''}`,
      type: p.kind,
      debit: p.kind === 'refund' ? Number(p.amount) : 0,
      credit: p.kind === 'payment' ? Number(p.amount) : 0,
      raw: p,
    })),
  ].sort((a, b) =>
    a.sortDate === b.sortDate
      ? String(a.created).localeCompare(String(b.created))
      : a.sortDate.localeCompare(b.sortDate))

  let running = 0
  for (const r of rows) {
    running += r.debit - r.credit
    r.balance = running
  }
  return rows
}

// Figures for one resident's invoice for a month (period = 'YYYY-MM-01')
export function invoiceFigures(charges, payments, period, nextPeriod) {
  const sum = (arr) => arr.reduce((s, x) => s + Number(x.amount), 0)
  const before = (d) => d < period
  const inMonth = (d) => d >= period && d < nextPeriod

  const previous_balance =
    sum(charges.filter((c) => before(c.period))) -
    sum(payments.filter((p) => p.kind === 'payment' && before(p.paid_on))) +
    sum(payments.filter((p) => p.kind === 'refund' && before(p.paid_on)))

  const lines = charges.filter((c) => c.period === period)
  const current_charges = sum(lines)
  const payments_in_month =
    sum(payments.filter((p) => p.kind === 'payment' && inMonth(p.paid_on))) -
    sum(payments.filter((p) => p.kind === 'refund' && inMonth(p.paid_on)))
  const total_due = previous_balance + current_charges - payments_in_month

  return { previous_balance, current_charges, payments_in_month, total_due, lines }
}
