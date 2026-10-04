import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, isConfigured, check } from './supabase'
import { AppContext } from './context'
import { money as fmtMoney } from './lib/format'
import Credit from './components/Credit'
import { Icon, Loading, Modal, Field } from './components/ui'
import GlobalSearch from './components/GlobalSearch'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Flats from './pages/Flats'
import Residents from './pages/Residents'
import ResidentDetail from './pages/ResidentDetail'
import Payments from './pages/Payments'
import Billing from './pages/Billing'
import Invoices from './pages/Invoices'
import Users from './pages/Users'
import Activity from './pages/Activity'
import Settings from './pages/Settings'

const NAV = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'flats', label: 'Flats' },
  { page: 'residents', label: 'Residents' },
  { page: 'payments', label: 'Payments' },
  { page: 'billing', label: 'Monthly billing' },
  { page: 'invoices', label: 'Invoices' },
]
const ADMIN_NAV = [
  { page: 'users', label: 'Portal users', icon: 'users' },
  { page: 'activity', label: 'Activity log', icon: 'activity' },
  { page: 'settings', label: 'Settings', icon: 'settings' },
]

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = h.split('?')
  const [page = 'dashboard', id = null] = path.split('/')
  return { page: page || 'dashboard', id, params: Object.fromEntries(new URLSearchParams(query)) }
}

export default function Root() {
  return isConfigured ? <App /> : <NotConfigured />
}

function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [settings, setSettings] = useState(null)
  const [route, setRoute] = useState(parseHash())
  const [navOpen, setNavOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [pwOpen, setPwOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    const onHash = () => { setRoute(parseHash()); setNavOpen(false); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('hashchange', onHash) }
  }, [])

  const loadProfile = useCallback(async () => {
    if (!session) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    setProfile(data || { approved: false, email: session.user.email })
    if (data?.approved) {
      const { data: s } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      setSettings(s || { hostel_name: 'My Hostel', currency: 'Rs.', country_code: '92', due_day: 1 })
    }
  }, [session?.user?.id])

  useEffect(() => { loadProfile() }, [loadProfile])

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type })
    clearTimeout(window.__toastT)
    window.__toastT = setTimeout(() => setToast(null), 3600)
  }, [])

  const go = useCallback((page, id = null, params = null) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : ''
    window.location.hash = `/${page}${id ? '/' + id : ''}${q}`
  }, [])

  const ctx = useMemo(() => ({
    session, profile, settings, setSettings, notify, go,
    isAdmin: profile?.role === 'admin' && profile?.approved,
    money: (n) => fmtMoney(n, settings?.currency || 'Rs.'),
  }), [session, profile, settings, notify, go])

  if (session === undefined) return <Loading />
  if (!session) return <Login />
  if (!profile) return <Loading />
  if (!profile.approved) return <Pending email={session.user.email} />
  if (!settings) return <Loading />

  const isAdmin = ctx.isAdmin
  const active = route.page === 'resident' ? 'residents' : route.page

  let content
  switch (route.page) {
    case 'flats': content = <Flats params={route.params} />; break
    case 'residents': content = <Residents params={route.params} />; break
    case 'resident': content = <ResidentDetail id={route.id} key={route.id} />; break
    case 'payments': content = <Payments />; break
    case 'billing': content = <Billing />; break
    case 'invoices': content = <Invoices />; break
    case 'users': content = isAdmin ? <Users /> : null; break
    case 'activity': content = isAdmin ? <Activity /> : null; break
    case 'settings': content = isAdmin ? <Settings /> : null; break
    default: content = <Dashboard />
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className={`shell ${navOpen ? 'nav-open' : ''}`} onClick={(e) => navOpen && e.target.classList.contains('shell') && setNavOpen(false)}>
        <aside className="sidebar">
          <div className="brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#fff" /><g fill="#1F3A5F"><rect x="8" y="7" width="6" height="5" rx="1" /><rect x="18" y="7" width="6" height="5" rx="1" /><rect x="8" y="15" width="6" height="5" rx="1" /><rect x="18" y="15" width="6" height="5" rx="1" fill="#2F7D5B" /><rect x="13" y="23" width="6" height="6" rx="1" /></g></svg>
            <div><div className="brand-name">{settings.hostel_name}</div><div className="brand-sub">Management portal</div></div>
          </div>
          {NAV.map((n) => (
            <button key={n.page} className={`nav-btn ${active === n.page ? 'active' : ''}`} onClick={() => go(n.page)}>
              <Icon name={n.page} />{n.label}
            </button>
          ))}
          {isAdmin && <div className="nav-group">Admin</div>}
          {isAdmin && ADMIN_NAV.map((n) => (
            <button key={n.page} className={`nav-btn ${active === n.page ? 'active' : ''}`} onClick={() => go(n.page)}>
              <Icon name={n.icon} />{n.label}
            </button>
          ))}
          <div className="sidebar-foot">
            <div className="who">{profile.full_name || profile.email}</div>
            <div className="role">{profile.role === 'admin' ? 'Admin' : 'Staff'}</div>
            <div className="links">
              <button onClick={() => setPwOpen(true)}>Change password</button>
              <button onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
            <Credit />
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <button className="menu-toggle" onClick={() => setNavOpen(true)} aria-label="Open menu"><Icon name="menu" className="" /></button>
            <GlobalSearch />
          </header>
          <main className="content">{content || <p>You don't have access to this page.</p>}</main>
        </div>
      </div>
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} notify={notify} />}
      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`} role="status">{toast.msg}</div>}
    </AppContext.Provider>
  )
}

function ChangePassword({ onClose, notify }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const save = async (e) => {
    e?.preventDefault()
    if (pw.length < 6) return setErr('Use at least 6 characters.')
    try {
      check(await supabase.auth.updateUser({ password: pw }))
      notify('Password changed')
      onClose()
    } catch (x) { setErr(x.message) }
  }
  return (
    <Modal title="Change password" onClose={onClose} narrow
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Change password</button></>}>
      <form onSubmit={save} className="form-grid">
        <Field label="New password" full><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
        {err && <div className="error-box full">{err}</div>}
      </form>
    </Modal>
  )
}

function Pending({ email }) {
  return (
    <div className="auth-form" style={{ minHeight: '100%' }}>
      <div className="auth-card">
        <h1>Waiting for approval</h1>
        <p className="muted">Your account <strong>{email}</strong> was created. An admin needs to approve it from <em>Portal users</em> before you can see any data.</p>
        <button className="btn" onClick={() => window.location.reload()}>Check again</button>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="auth-form" style={{ minHeight: '100%' }}>
      <div className="auth-card">
        <h1>Almost there</h1>
        <p>The portal is online but not yet connected to your database.</p>
        <p className="muted">In Cloudflare, open this project → <strong>Settings → Variables and Secrets</strong> and add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>. Then go to <strong>Deployments</strong> and choose <strong>Retry deployment</strong>.</p>
      </div>
    </div>
  )
}
