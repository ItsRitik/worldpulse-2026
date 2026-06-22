'use client'

/**
 * useAuth - thin adapter over Clerk that keeps the app's existing shape
 * ({ user: { id, email }, loading, signOut }). Auth is Clerk; the database
 * stays on Supabase and is written only via Clerk-authenticated API routes.
 */

import { useMemo } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'

export type AuthUser = {
  id:    string                    // Clerk user id, e.g. "user_2ab…"
  email: string | null
  // mirrors the old Supabase shape so existing components keep working
  user_metadata?: { full_name?: string; avatar_url?: string }
}

export function useAuth() {
  const { isLoaded, isSignedIn, user } = useUser()
  const { signOut: clerkSignOut } = useClerk()

  const id     = isSignedIn && user ? user.id : null
  const email  = user?.primaryEmailAddress?.emailAddress ?? null
  const name   = user?.fullName ?? undefined
  const avatar = user?.imageUrl ?? undefined

  // Memoise so `user` keeps a STABLE reference across renders. Without this,
  // a fresh object every render makes any `useEffect(..., [user])` re-fire on
  // every keystroke/click - which was hammering /api/wc/lineups past the rate
  // limit while building a team.
  const authUser: AuthUser | null = useMemo(
    () => (id ? { id, email, user_metadata: { full_name: name, avatar_url: avatar } } : null),
    [id, email, name, avatar],
  )

  return {
    user:    authUser,
    loading: !isLoaded,
    signOut: () => clerkSignOut(),
  }
}
