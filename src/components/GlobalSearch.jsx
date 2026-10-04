import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useApp } from '../context'
import { Icon } from './ui'

const VACANT_WORDS = ['vacant', 'empty', 'free', 'khali', 'available']

export default function GlobalSearch() {
  const { go, money } = useApp()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [res, setRes] = useState({ residents: [], flats: [], loading: false })
  const box = useRef(null)
  const input = useRef(null)

  // Press "/" anywhere to jump to search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    const onClick = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [])

  useEffect(() => {
    const term = q.trim().replace(/[,()*%\\]/g, ' ').trim()
    if (!term) { setRes({ residents: [], flats: [], loading: false }); return }
    setRes((r) => ({ ...r, loading: true }))
    const t = setTimeout(async () => {
      const wantsVacant = VACANT_WORDS.some((w) => term.toLowerCase().startsWith(w))
      const like = `%${term}%`
      const digits = term.replace(/\D/g, '')
      const filters = [`full_name.ilike.${like}`, `phone.ilike.${like}`, `cnic.ilike.${like}`, `flat_no.ilike.${like}`, `email.ilike.${like}`]
      if (digits.length >= 4 && digits === term.replace(/[\s-]/g, '')) {
        const fuzzy = `%${digits.split('').join('%')}%`
        filters.push(`phone.ilike.${fuzzy}`, `cnic.ilike.${fuzzy}`)
      }
      const [r, f] = await Promise.all([
        wantsVacant
          ? Promise.resolve({ data: [] })
          : supabase.from('residents_overview').select('id, full_name, flat_no, phone, balance, status').or(filters.join(',')).order('status').limit(8),
        wantsVacant
          ? supabase.from('flats_overview').select('*').eq('occupancy', 'vacant').order('flat_no').limit(50)
          : supabase.from('flats_overview').select('*').ilike('flat_no', like).order('flat_no').limit(8),
      ])
      setRes({ residents: r.data || [], flats: f.data || [], loading: false })
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  const pickResident = (id) => { setOpen(false); setQ(''); go('resident', id) }
  const pickFlat = (fl) => {
    setOpen(false); setQ('')
    if (fl.resident_id) go('resident', fl.resident_id)
    else go('flats', null, { add: fl.id })
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
    if (e.key === 'Enter') {
      if (res.residents[0]) pickResident(res.residents[0].id)
      else if (res.flats[0]) pickFlat(res.flats[0])
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); box.current?.querySelector('.sr-item')?.focus() }
  }
  const onListKey = (e) => {
    const all = [...box.current.querySelectorAll('.sr-item')]
    const i = all.indexOf(document.activeElement)
    if (i < 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); all[Math.min(i + 1, all.length - 1)].focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? all[i - 1] : input.current).focus() }
    if (e.key === 'Escape') { setOpen(false); input.current?.focus() }
  }

  const hasAny = res.residents.length || res.flats.length
  return (
    <div className="search" ref={box}>
      <Icon name="search" className="icon" />
      <input
        ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        placeholder="Search name, phone, CNIC, flat no… or type “vacant”" aria-label="Search residents and flats"
      />
      {open && (
        <div className="search-results" onKeyDown={onListKey}>
          {!q.trim() && <div className="sr-hint">Find any resident by name, phone, CNIC or flat number. Type “vacant” to list empty flats. Press / to search from anywhere.</div>}
          {q.trim() && !res.loading && !hasAny && <div className="sr-empty">Nothing matches “{q}”.</div>}
          {res.residents.length > 0 && <div className="sr-group">Residents</div>}
          {res.residents.map((r) => (
            <button key={r.id} className="sr-item" onClick={() => pickResident(r.id)}>
              <span>
                <span className="t">{r.full_name}</span>{' '}
                {r.status === 'left' && <span className="badge grey">Left</span>}
                <div className="s">Flat {r.flat_no || '—'}{r.phone ? ` · ${r.phone}` : ''}</div>
              </span>
              {Number(r.balance) > 0 ? <span className="badge amber">Due {money(r.balance)}</span> : <span className="badge green">Clear</span>}
            </button>
          ))}
          {res.flats.length > 0 && <div className="sr-group">Flats{res.flats.every((f) => f.occupancy === 'vacant') ? ` · ${res.flats.length} vacant` : ''}</div>}
          {res.flats.map((fl) => (
            <button key={fl.id} className="sr-item" onClick={() => pickFlat(fl)}>
              <span>
                <span className="t">Flat {fl.flat_no}</span>
                <div className="s">{fl.floor ? `Floor ${fl.floor} · ` : ''}{fl.flat_type || ''} {money(fl.monthly_rent)}/month</div>
              </span>
              {fl.occupancy === 'vacant' ? <span className="badge green">Vacant — add resident</span> : <span className="badge navy">{fl.resident_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
