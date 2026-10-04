import { useState } from 'react'
import { supabase, friendlyError } from '../supabase'
import Credit from '../components/Credit'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
        if (error) throw error
      } else {
        if (f.password.length < 6) throw new Error('Password must be at least 6 characters.')
        const { data, error } = await supabase.auth.signUp({
          email: f.email.trim(), password: f.password, options: { data: { full_name: f.name.trim() } },
        })
        if (error) throw error
        if (!data.session) setMsg({ type: 'info', text: 'Account created. Check your email to confirm it, then sign in.' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <div className="auth-windows" aria-hidden="true">
          {['lit', '', 'lit', 'free', '', 'lit', 'lit', '', 'free', 'lit', '', 'lit'].map((c, i) => <i key={i} className={c} />)}
        </div>
        <div>
          <h1>Every flat, every resident, every rupee.</h1>
          <p>Residents, rent, electricity bills, payments and invoices for your building, in one place.</p>
        </div>
        <Credit />
      </div>
      <div className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
          {mode === 'signup' && (
            <p className="muted small">The first account becomes the admin. Later accounts wait for the admin's approval.</p>
          )}
          {mode === 'signup' && (
            <div className="field"><label>Your name</label><input value={f.name} onChange={set('name')} required /></div>
          )}
          <div className="field"><label>Email</label><input type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></div>
          <div className="field"><label>Password</label><input type="password" value={f.password} onChange={set('password')} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>
          {msg && <div className={msg.type === 'error' ? 'error-box' : 'info-box'}>{msg.text}</div>}
          <button className="btn primary" disabled={busy} style={{ height: 44 }}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="btn ghost" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(null) }}>
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
