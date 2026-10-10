// Maps a Supabase auth error to a translated, user-friendly message. Matches on
// the stable error code first and falls back to the English message text.
export function friendlyAuthError(err, t, fallbackKey = 'login.errorGeneric') {
  const code = err?.code || ''
  const msg = err?.message || ''
  if (code === 'invalid_credentials' || msg.includes('Invalid login credentials')) return t('login.errorBadCredentials')
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('User already registered')) return t('login.errorAlreadyRegistered')
  if (code === 'weak_password' || msg.includes('Password should be')) return t('login.errorWeakPassword')
  if (code === 'email_address_invalid' || code === 'validation_failed' || msg.includes('Unable to validate email')) return t('login.errorBadEmail')
  if (code === 'email_not_confirmed' || msg.includes('Email not confirmed')) return t('login.errorEmailNotConfirmed')
  if (code === 'same_password' || /different from the old password/i.test(msg)) return t('login.errorSamePassword')
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit|too many|security purposes/i.test(msg)) return t('login.errorRateLimit')
  // Never show a raw (English) server message to the user.
  return t(fallbackKey)
}
