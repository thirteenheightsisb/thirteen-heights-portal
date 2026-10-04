import { useEffect, useMemo, useState } from 'react'
import { supabase, check } from '../supabase'
import { useApp } from '../context'
import { Loading, Empty, Modal } from '../components/ui'
import { FlatForm, BulkFlatsForm, ResidentForm } from '../components/forms'

function floorRank(floor) {
  if (floor === null || floor === undefined || floor === '') return -1000
  const s = String(floor).trim().toLowerCase()
  if (['g', 'ground', 'gf', '0'].includes(s)) return 0
  if (s.startsWith('b') || s.includes('basement')) return -1
  const n = parseFloat(s.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? -500 : n
}
function floorName(floor) {
  if (!floor) return 'No floor'
  const s = String(floor).trim().toLowerCase()
  if (['g', 'gf', 'ground', '0'].includes(s)) return 'Ground'
  return isNaN(Number(floor)) ? floor : `Floor ${floor}`
}
const byFlatNo = (a, b) => a.flat_no.localeCompare(b.flat_no, undefined, { numeric: true })

export default function Flats({ params }) {
  const { money, go, isAdmin, notify } = useApp()
  const [flats, setFlats] = useState(null)
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('building')
  const [modal, setModal] = useState(null)

  const load = async () => {
    const [f, r] = await Promise.all([
      supabase.from('flats_overview').select('*'),
      supabase.from('residents_overview').select('id, balance').eq('status', 'active'),
    ])
    const bal = Object.fromEntries((r.data || []).map((x) => [x.id, Number(x.balance)]))
    setFlats((f.data || []).map((x) => ({ ...x, balance: x.resident_id ? bal[x.resident_id] || 0 : 0 })))
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (params?.add) setModal({ type: 'resident', flatId: params.add }) }, [params?.add])

  const shown = useMemo(() => (flats || []).filter((f) => filter === 'all' || f.occupancy === filter), [flats, filter])
  const floors = useMemo(() => {
    const m = new Map()
    for (const f of shown) {
      const key = f.floor || ''
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(f)
    }
    return [...m.entries()].sort((a, b) => floorRank(b[0]) - floorRank(a[0])).map(([floor, list]) => ({ floor, list: list.sort(byFlatNo) }))
  }, [shown])

  if (!flats) return <Loading />
  const vacantCount = flats.filter((f) => f.occupancy === 'vacant').length

  const remove = async (f) => {
    if (!window.confirm(`Delete flat ${f.flat_no}? Residents' past records stay, but they will no longer be linked to this flat.`)) return
    try {
      check(await supabase.from('flats').delete().eq('id', f.id))
      notify(`Flat ${f.flat_no} deleted`)
      setModal(null); load()
    } catch (e) { notify(e.message, 'error') }
  }

  const clickFlat = (f) => (f.resident_id ? go('resident', f.resident_id) : setModal({ type: 'vacant', flat: f }))
  const closeAndReload = () => { setModal(null); if (params?.add) go('flats'); load() }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Flats</h1>
          <p>{flats.length} flats · {vacantCount} vacant · {flats.length - vacantCount} occupied</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setModal({ type: 'bulk' })}>Add several</button>
          <button className="btn primary" onClick={() => setModal({ type: 'flat' })}>Add flat</button>
        </div>
      </div>

      <div className="actions" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
        <div className="seg" role="group" aria-label="Filter flats">
          {[['all', 'All'], ['vacant', `Vacant (${vacantCount})`], ['occupied', 'Occupied']].map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'building' ? 'on' : ''} onClick={() => setView('building')}>Building</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      {flats.length === 0 ? (
        <div className="panel"><Empty action={<button className="btn primary" onClick={() => setModal({ type: 'bulk' })}>Add your flats</button>}>
          Start by adding your building's flats. Use “Add several” to add a whole floor at once, like 101 to 110.
        </Empty></div>
      ) : shown.length === 0 ? (
        <div className="panel"><Empty>No {filter} flats.</Empty></div>
      ) : view === 'building' ? (
        <>
          <div className="building">
            {floors.map(({ floor, list }) => (
              <div className="floor" key={floor || 'none'}>
                <div className="floor-label">
                  <span className="n">{floorName(floor)}</span>
                  <span className="c">{list.filter((x) => x.occupancy === 'vacant').length} vacant</span>
                </div>
                <div className="floor-flats">
                  {list.map((f) => (
                    <button key={f.id} onClick={() => clickFlat(f)}
                      className={`flat ${f.occupancy} ${f.balance > 0 ? 'due' : ''}`}
                      aria-label={`Flat ${f.flat_no}, ${f.occupancy === 'vacant' ? 'vacant' : f.resident_name}`}>
                      <span className="no">{f.flat_no}</span>
                      <span className="who">{f.occupancy === 'vacant' ? 'Vacant' : f.resident_name}</span>
                      <span className="meta">{f.occupancy === 'vacant' ? `${money(f.monthly_rent)}/mo` : f.balance > 0 ? `Due ${money(f.balance)}` : 'Clear'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 12 }}>
            <span><i style={{ background: 'var(--green)' }} />Vacant</span>
            <span><i style={{ background: 'var(--navy)' }} />Occupied, clear</span>
            <span><i style={{ background: '#D08A1E' }} />Occupied, has dues</span>
          </div>
        </>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead><tr><th>Flat</th><th>Floor</th><th>Type</th><th className="r">Rent</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {[...shown].sort(byFlatNo).map((f) => (
                <tr key={f.id}>
                  <td className="strong">{f.flat_no}</td>
                  <td>{f.floor || '—'}</td>
                  <td>{f.flat_type || '—'}</td>
                  <td className="r num">{money(f.monthly_rent)}</td>
                  <td>{f.occupancy === 'vacant'
                    ? <span className="badge green">Vacant</span>
                    : <a href={`#/resident/${f.resident_id}`}>{f.resident_name}</a>}</td>
                  <td className="r">
                    <div className="actions" style={{ justifyContent: 'flex-end' }}>
                      {f.occupancy === 'vacant' && <button className="btn small" onClick={() => setModal({ type: 'resident', flatId: f.id })}>Add resident</button>}
                      <button className="btn small" onClick={() => setModal({ type: 'flat', flat: f })}>Edit</button>
                      {isAdmin && <button className="btn small danger" onClick={() => remove(f)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'flat' && <FlatForm flat={modal.flat} onClose={() => setModal(null)} onSaved={closeAndReload} />}
      {modal?.type === 'bulk' && <BulkFlatsForm onClose={() => setModal(null)} onSaved={closeAndReload} />}
      {modal?.type === 'resident' && (
        <ResidentForm presetFlatId={modal.flatId} onClose={closeAndReload} onSaved={(id) => { setModal(null); go('resident', id) }} />
      )}
      {modal?.type === 'vacant' && (
        <Modal title={`Flat ${modal.flat.flat_no} is vacant`} onClose={() => setModal(null)} narrow
          footer={<>
            {isAdmin && <button className="btn danger" onClick={() => remove(modal.flat)}>Delete flat</button>}
            <button className="btn" onClick={() => setModal({ type: 'flat', flat: modal.flat })}>Edit flat</button>
            <button className="btn primary" onClick={() => setModal({ type: 'resident', flatId: modal.flat.id })}>Add resident</button>
          </>}>
          <dl className="details">
            <dt>Floor</dt><dd>{modal.flat.floor || '—'}</dd>
            <dt>Type</dt><dd>{modal.flat.flat_type || '—'}</dd>
            <dt>Monthly rent</dt><dd className="num">{money(modal.flat.monthly_rent)}</dd>
            {modal.flat.notes && <><dt>Notes</dt><dd>{modal.flat.notes}</dd></>}
          </dl>
        </Modal>
      )}
    </>
  )
}
