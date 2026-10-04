export function money(n, currency = 'Rs.') {
  const v = Number(n || 0)
  const sign = v < 0 ? '-' : ''
  return `${sign}${currency} ${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export function todayStr() {
  return toDateStr(new Date())
}

export function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// "2026-10" for <input type="month">
export function currentMonth() {
  return todayStr().slice(0, 7)
}

// "2026-10" or "2026-10-15" -> "2026-10-01"
export function periodOf(value) {
  return `${String(value).slice(0, 7)}-01`
}

export function nextMonthStart(period) {
  const [y, m] = period.split('-').map(Number)
  return toDateStr(new Date(y, m, 1))
}

export function monthLabel(value) {
  if (!value) return ''
  const [y, m] = String(value).split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function fmtDate(value) {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function dueDateFor(period, dueDay = 1) {
  const [y, m] = period.split('-').map(Number)
  return toDateStr(new Date(y, m - 1, Number(dueDay) || 1))
}

// WhatsApp link. Local numbers like 0300-1234567 become 923001234567.
export function whatsappLink(phone, text, countryCode = '92') {
  if (!phone) return null
  let digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = String(countryCode).replace(/\D/g, '') + digits.slice(1)
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export const CHARGE_TYPES = {
  rent: 'Rent',
  utilities: 'Electricity / utilities',
  deposit: 'Security deposit',
  other: 'Other',
}

export const PAYMENT_METHODS = ['Cash', 'Bank transfer', 'JazzCash', 'Easypaisa', 'Cheque', 'Other']

export function floorName(floor) {
  if (floor === null || floor === undefined || floor === '') return 'No floor'
  const s = String(floor).trim().toLowerCase()
  if (['g', 'gf', 'ground', '0'].includes(s)) return 'Ground floor'
  return isNaN(Number(floor)) ? floor : `Floor ${floor}`
}
