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
