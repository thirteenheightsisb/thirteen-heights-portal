// PDF libraries are loaded only when someone downloads a PDF (keeps the portal fast)
async function libs() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable }
}
import { money, fmtDate, monthLabel, CHARGE_TYPES } from './format'
import { CREDIT_LINE } from '../credits'

const NAVY = [31, 58, 95]
const INK = [33, 43, 54]
const MUTED = [110, 120, 130]
const LINE = [214, 220, 216]

function header(doc, settings, title, subtitle) {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, w, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(settings.hostel_name || 'Hostel', 14, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const contact = [settings.address, settings.phone].filter(Boolean).join('   |   ')
  if (contact) doc.text(contact, 14, 21, { maxWidth: w - 80 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(title, w - 14, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (subtitle) doc.text(subtitle, w - 14, 21, { align: 'right' })
  doc.setTextColor(...INK)
}

function kv(doc, x, y, label, value) {
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(label, x, y)
  doc.setFontSize(10.5)
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.text(String(value ?? '—'), x, y + 5.5)
  doc.setFont('helvetica', 'normal')
}

function drawInvoice(doc, autoTable, { settings, resident, invoice, lines }) {
  const cur = settings.currency || 'Rs.'
  const w = doc.internal.pageSize.getWidth()
  header(doc, settings, 'INVOICE', `No. INV-${String(invoice.invoice_no).padStart(5, '0')}`)

  // Bill to
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text('BILL TO', 14, 42)
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(resident.full_name, 14, 49)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const who = [`Flat ${resident.flat_no || '—'}`, resident.phone, resident.cnic ? `CNIC ${resident.cnic}` : null].filter(Boolean)
  doc.text(who.join('    '), 14, 55)

  kv(doc, w - 120, 42, 'Billing month', monthLabel(invoice.period))
  kv(doc, w - 72, 42, 'Issue date', fmtDate(invoice.issue_date))
  kv(doc, w - 120, 56, 'Due date', fmtDate(invoice.due_date))

  autoTable(doc, {
    startY: 68,
    head: [['Description', 'Type', 'Amount']],
    body: lines.length
      ? lines.map((l) => [l.description || CHARGE_TYPES[l.type], CHARGE_TYPES[l.type] || l.type, money(l.amount, cur)])
      : [['No new charges this month', '', money(0, cur)]],
    theme: 'plain',
    headStyles: { fillColor: [238, 241, 238], textColor: INK, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 10, textColor: INK, cellPadding: 3 },
    columnStyles: { 2: { halign: 'right' } },
    didParseCell: (d) => { if (d.section === 'head' && d.column.index === 2) d.cell.styles.halign = 'right' },
    margin: { left: 14, right: 14 },
  })

  let y = doc.lastAutoTable.finalY + 6
  const rows = [
    ['Previous balance', money(invoice.previous_balance, cur)],
    ["This month's charges", money(invoice.current_charges, cur)],
    ['Less: payments received this month', `- ${money(invoice.payments_in_month, cur)}`],
  ]
  doc.setFontSize(10)
  for (const [label, val] of rows) {
    doc.setTextColor(...MUTED)
    doc.text(label, w - 110, y)
    doc.setTextColor(...INK)
    doc.text(val, w - 14, y, { align: 'right' })
    y += 7
  }
  doc.setDrawColor(...LINE)
  doc.line(w - 110, y - 3, w - 14, y - 3)
  doc.setFillColor(...NAVY)
  doc.rect(w - 112, y, 98, 13, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Total amount due', w - 108, y + 8.5)
  doc.text(money(invoice.total_due, cur), w - 17, y + 8.5, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...INK)

  if (settings.invoice_note) {
    doc.setFontSize(9.5)
    doc.setTextColor(...MUTED)
    doc.text(settings.invoice_note, 14, y + 30, { maxWidth: w - 28 })
  }
  const h = doc.internal.pageSize.getHeight()
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('This is a computer-generated invoice.', w / 2, h - 13, { align: 'center' })
  doc.setFontSize(7.5)
  doc.text(CREDIT_LINE, w / 2, h - 8, { align: 'center' })
}

function safe(name) {
  return String(name || 'file').replace(/[^a-z0-9-_]+/gi, '_')
}

export async function downloadInvoice(data) {
  const { jsPDF, autoTable } = await libs()
  const doc = new jsPDF()
  drawInvoice(doc, autoTable, data)
  doc.save(`Invoice_${safe(data.resident.flat_no)}_${safe(data.resident.full_name)}_${data.invoice.period.slice(0, 7)}.pdf`)
}

// Many invoices in one PDF (one per page) — handy for printing
export async function downloadInvoicesCombined(list, period) {
  const { jsPDF, autoTable } = await libs()
  const doc = new jsPDF()
  list.forEach((data, i) => {
    if (i > 0) doc.addPage()
    drawInvoice(doc, autoTable, data)
  })
  doc.save(`Invoices_${period.slice(0, 7)}.pdf`)
}

export async function downloadReceipt({ settings, resident, payment }) {
  const { jsPDF } = await libs()
  const cur = settings.currency || 'Rs.'
  const doc = new jsPDF({ format: 'a5', orientation: 'landscape' })
  const w = doc.internal.pageSize.getWidth()
  const isRefund = payment.kind === 'refund'
  header(doc, settings, isRefund ? 'REFUND' : 'RECEIPT', `No. RCP-${String(payment.receipt_no).padStart(5, '0')}`)

  kv(doc, 14, 42, isRefund ? 'Paid to' : 'Received from', resident.full_name)
  kv(doc, 100, 42, 'Flat', resident.flat_no || '—')
  kv(doc, 140, 42, 'Date', fmtDate(payment.paid_on))
  kv(doc, 14, 60, 'Method', payment.method)
  kv(doc, 100, 60, 'Reference', payment.reference || '—')

  doc.setFillColor(238, 241, 238)
  doc.rect(14, 76, w - 28, 18, 'F')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(isRefund ? 'Amount refunded' : 'Amount received', 20, 87)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...INK)
  doc.text(money(payment.amount, cur), w - 20, 88, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  if (resident.balance !== undefined) {
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(`Remaining balance after this: ${money(resident.balance, cur)}`, 14, 106)
  }
  if (payment.note) {
    doc.setFontSize(9)
    doc.text(`Note: ${payment.note}`, 14, 113, { maxWidth: w - 28 })
  }
  doc.setFontSize(8)
  doc.text('This is a computer-generated receipt.', w / 2, doc.internal.pageSize.getHeight() - 11, { align: 'center' })
  doc.setFontSize(7.5)
  doc.text(CREDIT_LINE, w / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' })
  doc.save(`Receipt_${payment.receipt_no}_${safe(resident.full_name)}.pdf`)
}
