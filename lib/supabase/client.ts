import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export function createClient(): SupabaseClient<Database> {
  // createBrowserClient handles singleton de-dup in browser contexts
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as SupabaseClient<Database>
}
