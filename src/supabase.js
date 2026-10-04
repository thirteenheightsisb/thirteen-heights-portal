import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

// A second client that never saves a session — used by admins to create staff
// accounts without being logged out themselves.
export function makeTempClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'hostel-temp-signup' },
  })
}

// Throws a readable error if a Supabase call failed
export function check({ data, error }) {
  if (error) throw new Error(friendlyError(error))
  return data
}

export function friendlyError(error) {
  const msg = error?.message || String(error)
  if (msg.includes('one_active_resident_per_flat')) return 'This flat already has an active resident. Check them out first.'
  if (msg.includes('one_rent_per_month')) return 'Rent for this month is already added for this resident.'
  if (msg.includes('flats_flat_no_key')) return 'A flat with this number already exists.'
  if (msg.includes('row-level security')) return 'You do not have permission to do this.'
  if (msg.includes('Invalid login credentials')) return 'Wrong email or password.'
  if (msg.includes('Email not confirmed')) return 'Please confirm your email first (check your inbox), or ask the admin.'
  if (msg.includes('violates foreign key')) return 'This record is linked to other records and cannot be removed.'
  return msg
}

// Supabase returns at most 1000 rows per request; this fetches everything in pages.
// `build` must return a fresh query that has an .order(...) so pages are stable.
export async function fetchAll(build) {
  const size = 1000
  const out = []
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1)
    if (error) throw new Error(friendlyError(error))
    out.push(...data)
    if (data.length < size) break
  }
  return out
}
