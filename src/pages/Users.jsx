import { useEffect, useState } from 'react'
import { supabase, check, makeTempClient, friendlyError } from '../supabase'
import { useApp } from '../context'
import { Loading, Modal, Field } from '../components/ui'
import { fmtDate } from '../lib/format'

export default function Users() {
  const { profile, notify } = useApp()
  const [users, setUsers] = useState(null)
  const [adding, setAdding] = useState(false)

  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setUsers(data || []))
  useEffect(() => { load() }, [])

  const update = async (u, patch, msg) => {
    try { check(await supabase.from('profiles').update(patch).eq('id', u.id)); notify(msg); load() } catch (e) { notify(e.message, 'error') }
  }

  if (!users) return <Loading />
  const pending = users.filter((u) => !u.approved)
  const admins = users.filter((u) => u.approved && u.role === 'admin').length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Portal users</h1>
          <p>People who can log in. Staff can add and edit records. Admins can also delete, manage users and change settings.</p>
        </div>
        <div className="actions"><button className="btn primary" onClick={() => setAdding(true)}>Add user</button></div>
      </div>

      {pending.length > 0 && (
        <div className="info-box" style={{ marginBottom: 14 }}>{pending.length} account{pending.length === 1 ? ' is' : 's are'} waiting for approval.</div>
      )}

      <div className="panel table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => {
              const me = u.id === profile.id
              const lastAdmin = u.role === 'admin' && admins <= 1
              return (
                <tr key={u.id}>
                  <td className="strong">{u.full_name || '—'}{me && <span className="sub"> (you)</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    <select className="input" style={{ height: 32, width: 110 }} value={u.role} disabled={me || lastAdmin}
                      onChange={(e) => update(u, { role: e.target.value }, `${u.full_name || u.email} is now ${e.target.value}`)}>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{u.approved ? <span className="badge green">Allowed</span> : <span className="badge amber">Waiting</span>}</td>
                  <td className="sub">{fmtDate(u.created_at)}</td>
                  <td className="r">
                    {!me && (u.approved
                      ? <button className="btn small danger" disabled={lastAdmin} onClick={() => window.confirm(`Remove portal access for ${u.email}?`) && update(u, { approved: false }, 'Access removed')}>Remove access</button>
                      : <button className="btn small success" onClick={() => update(u, { approved: true }, 'User approved')}>Approve</button>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {adding && <AddUser onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </>
  )
}

function AddUser({ onClose, onSaved }) {
  const { notify } = useApp()
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'staff' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e?.preventDefault()
    setErr('')
    if (!f.email || f.password.length < 6) return setErr('Enter an email and a password of at least 6 characters.')
    setBusy(true)
    try {
      const temp = makeTempClient()
      const { data, error } = await temp.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { full_name: f.full_name.trim() } } })
      if (error) throw error
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) throw new Error('An account with this email already exists.')
      check(await supabase.from('profiles').update({ approved: true, role: f.role, full_name: f.full_name.trim() || null }).eq('id', data.user.id))
      notify(data.session ? 'User added. Share the email and password with them.' : 'User added. They must confirm their email before logging in.')
      onSaved()
    } catch (x) { setErr(friendlyError(x)) }
    setBusy(false)
  }

  return (
    <Modal title="Add portal user" onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Add user</button></>}>
      <form className="form-grid" onSubmit={save}>
        <Field label="Name" full><input value={f.full_name} onChange={set('full_name')} autoFocus /></Field>
        <Field label="Email" full><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="They can change it after logging in"><input type="text" value={f.password} onChange={set('password')} /></Field>
        <Field label="Role">
          <select value={f.role} onChange={set('role')}><option value="staff">Staff</option><option value="admin">Admin</option></select>
        </Field>
        {err && <div className="error-box full">{err}</div>}
        <button hidden type="submit" />
      </form>
    </Modal>
  )
}
