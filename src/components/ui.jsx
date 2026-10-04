import { useEffect } from 'react'

export function Modal({ title, onClose, children, footer, narrow }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${narrow ? 'narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children, full }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Empty({ children, action }) {
  return (
    <div className="empty">
      <div>{children}</div>
      {action}
    </div>
  )
}

export function Loading() {
  return <div className="loading">Loading…</div>
}

export function BalanceBadge({ balance, money }) {
  const b = Number(balance || 0)
  if (b > 0) return <span className="badge amber">Due {money(b)}</span>
  if (b < 0) return <span className="badge navy">Advance {money(-b)}</span>
  return <span className="badge green">Clear</span>
}

const paths = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  flats: 'M4 21V3h11v4h5v14h-6v-4h-4v4H4zm3-14h2V5H7v2zm0 4h2V9H7v2zm0 4h2v-2H7v2zm4-8h2V5h-2v2zm0 4h2V9h-2v2zm0 4h2v-2h-2v2zm5 0h2v-2h-2v2zm0-4h2V9h-2v2z',
  residents: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4zm8 0c-.3 0-.7 0-1.1.1A4.4 4.4 0 0 1 17 17v3h7v-3c0-2.7-5.3-4-8-4z',
  payments: 'M2 6h20v12H2V6zm2 2v8h16V8H4zm8 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  billing: 'M6 2h9l5 5v15H6V2zm8 1.5V8h4.5M9 12h8v2H9zm0 4h8v2H9z',
  invoices: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zm3 5h8v2H8zm0 4h8v2H8z',
  users: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3 0-9 1.5-9 4.5V21h18v-2.5C21 15.5 15 14 12 14z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  settings: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.2-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  search: 'M10.5 3a7.5 7.5 0 0 1 6 12l4.8 4.8-1.5 1.4-4.8-4.7A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
  menu: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
}

export function Icon({ name, className }) {
  const stroke = name === 'activity'
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true"
      fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'} strokeWidth={stroke ? 2 : 0}
      strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}
