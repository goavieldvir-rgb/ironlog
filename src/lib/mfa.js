// Two-step verification with an authenticator app (Supabase Auth MFA, TOTP).
// The database enforces it (supabase-security-round3.sql): coach powers need
// a session that passed the second step, and so does all data of anyone who
// turned it on. These helpers only drive the screens.
import { supabase } from '../supabase.js'

// { currentLevel, nextLevel }: 'aal1' after a password, 'aal2' after the
// code. nextLevel is 'aal2' as soon as the account has a confirmed app.
export async function assurance() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return data
}

export async function confirmedApps() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return (data?.totp || []).filter((f) => f.status === 'verified')
}

// A QR code (an SVG data URL) and the same secret as text, for an app that
// can't scan. A setup someone abandoned is cleared first, or Supabase would
// refuse a second app with the same name.
export async function startSetup() {
  const { data: list, error: listErr } = await supabase.auth.mfa.listFactors()
  if (listErr) throw listErr
  for (const f of list?.all || []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Ironlog ${new Date().toISOString().slice(0, 16)}`,
    issuer: 'Ironlog',
  })
  if (error) throw error
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

// Checks a 6-digit code. Also upgrades this session to 'aal2'.
export async function verifyCode(factorId, code) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
  if (error) throw error
}

export async function removeApp(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
  // Without this the session keeps saying 'aal2' until the next refresh.
  await supabase.auth.refreshSession()
}

// ---- Recovery codes (supabase-mfa-recovery.sql) ----
// Before that file is run the functions don't exist; every helper then says
// "not available" instead of throwing, and the screens hide themselves.
function missingFn(err) {
  return (
    err?.code === 'PGRST202' || err?.code === '42883' || err?.code === '42P01' ||
    /could not find the function|does not exist|schema cache/i.test(err?.message || '')
  )
}

// Unused codes left, or null when recovery codes aren't set up on the database.
export async function recoveryCodesLeft() {
  const { data, error } = await supabase.rpc('recovery_codes_left')
  if (error) {
    if (missingFn(error)) return null
    throw error
  }
  return typeof data === 'number' ? data : 0
}

// 10 new codes, shown once. Needs an aal2 session; replaces the old ones.
// Returns null when the feature isn't on the database.
export async function makeRecoveryCodes() {
  const { data, error } = await supabase.rpc('generate_recovery_codes')
  if (error) {
    if (missingFn(error)) return null
    throw error
  }
  return Array.isArray(data) ? data : []
}

// Spends a code at the sign-in step: true when it worked (the authenticator
// app is gone and the session is refreshed), false for a wrong code. Throws
// an error with .tooMany for the rate limit.
export async function spendRecoveryCode(code) {
  const { data, error } = await supabase.rpc('use_recovery_code', { code })
  if (error) {
    if (/too_many_attempts/.test(error.message || '') || error.code === '54000') {
      const e = new Error('too_many_attempts')
      e.tooMany = true
      throw e
    }
    throw error
  }
  if (data !== true) return false
  await supabase.auth.refreshSession()
  return true
}
