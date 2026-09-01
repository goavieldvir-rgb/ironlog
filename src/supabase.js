import { createClient } from '@supabase/supabase-js'

// These come from your Supabase project: Settings -> API.
// Locally, put them in .env.local (see .env.example).
// For GitHub Pages deploys they're added as repo secrets (see README.md).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce' },
})
