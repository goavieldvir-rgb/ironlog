import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Read before the client starts: it strips the code from the address bar once
// it has used it.
export const openedFromAuthLink =
  typeof window !== 'undefined' &&
  /[?&#](code|error_description)=/.test(window.location.search + window.location.hash)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce' },
})

// A reset-password email link opens the app with a one-time code. Supabase
// trades that code for a signed-in session on its own as the page loads and
// then fires PASSWORD_RECOVERY once. That session is a full login, so unless
// we remember it came from a reset link the app just opens the dashboard and
// the person never gets to choose a new password. The flag lives for this
// tab until the new password is saved or they sign out, so a reload on the
// reset screen keeps them there.
const RECOVERY_KEY = 'ironlog-password-recovery'

export function isPasswordRecovery() {
  try { return sessionStorage.getItem(RECOVERY_KEY) === '1' } catch { return false }
}

export function clearPasswordRecovery() {
  try { sessionStorage.removeItem(RECOVERY_KEY) } catch { /* private mode */ }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    try { sessionStorage.setItem(RECOVERY_KEY, '1') } catch { /* private mode */ }
  } else if (event === 'SIGNED_OUT') {
    clearPasswordRecovery()
  }
})
