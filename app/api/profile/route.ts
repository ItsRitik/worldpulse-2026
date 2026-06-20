/**
 * /api/profile
 * ═════════════
 * GET             → the signed-in user's profile (display_name …)
 * GET ?ids=a,b    → public display names for the given user ids
 *                   (used to show real names in 1v1 rooms)
 * POST { display_name } → set a UNIQUE display name for the signed-in user
 *
 * Writes go through the service role so we control validation + uniqueness
 * regardless of RLS policies on user_profiles.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { currentUserId } from '@/lib/auth'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _.-]{2,15}$/

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')

  // Public lookup: display names for specific user ids (room participants)
  if (ids) {
    const idList = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10)
    const { data } = await adminClient()
      .from('user_profiles')
      .select('id, display_name, avatar_url')
      .in('id', idList)
    const names: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    for (const row of data ?? []) {
      names[row.id] = { display_name: row.display_name, avatar_url: row.avatar_url }
    }
    return NextResponse.json({ names }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    })
  }

  // Own profile
  const uid = await currentUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await adminClient()
    .from('user_profiles')
    .select('id, display_name, fav_team_tla, avatar_url')
    .eq('id', uid)
    .maybeSingle()

  // complete only when BOTH onboarding fields are set
  const complete = !!(data?.display_name && data?.fav_team_tla)
  return NextResponse.json({ profile: data ?? null, complete })
}

export async function POST(req: NextRequest) {
  const uid = await currentUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body    = await req.json().catch(() => null)
  const name    = String(body?.display_name ?? '').trim()
  const favTeam = body?.fav_team_tla != null ? String(body.fav_team_tla).trim().toUpperCase() : undefined

  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      { error: '3–16 characters: letters, numbers, spaces, _ . -' },
      { status: 400 },
    )
  }
  if (favTeam !== undefined && !/^[A-Z]{2,4}$/.test(favTeam)) {
    return NextResponse.json({ error: 'Pick a valid team' }, { status: 400 })
  }

  const db = adminClient()

  // Uniqueness — case-insensitive, excluding the caller's own row
  const { data: clash } = await db
    .from('user_profiles')
    .select('id')
    .ilike('display_name', name)
    .neq('id', uid)
    .limit(1)

  if (clash && clash.length > 0) {
    return NextResponse.json({ error: 'That name is already taken' }, { status: 409 })
  }

  const row: Record<string, unknown> = { id: uid, display_name: name }
  if (favTeam !== undefined) row.fav_team_tla = favTeam

  const { error: upErr } = await db
    .from('user_profiles')
    .upsert(row, { onConflict: 'id' })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, display_name: name, fav_team_tla: favTeam })
}
