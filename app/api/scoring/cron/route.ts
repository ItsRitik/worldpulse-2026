/**
 * WC26 Fantasy XI — Scoring Cron Dispatcher
 * ==========================================
 * Called by Vercel Cron every minute (see vercel.json).
 *
 * Finds all rooms with status = 'locked' or 'live', extracts the
 * distinct match IDs, and fires /api/scoring/match/[matchId] ONCE
 * per unique match — never once per room. The match scorer fetches
 * from API-Football once, scores all players, then fans out the
 * results to every room sharing that match. The scoring engine is the
 * ONLY writer to match_player_points, fantasy_live_state and fantasy_rooms.
 *
 * Auth: Vercel Cron passes Authorization: Bearer <CRON_SECRET>.
 * We re-use SCORING_SECRET for simplicity — set the same value in
 * Vercel Dashboard → Settings → Cron Job Secret.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

const SECRET  = process.env.SCORING_SECRET ?? 'dev-secret'
const BASE    = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: NextRequest) {
  // Vercel Cron auth — Bearer token OR matching x-scoring-secret header
  const authHeader = request.headers.get('authorization')
  const secretHeader = request.headers.get('x-scoring-secret')
  const token = authHeader?.replace('Bearer ', '') ?? secretHeader

  if (token !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = adminClient()

    // Step 0: lock rooms whose kickoff has passed — without this, real rooms
    // stay 'waiting' forever and the scorer never picks them up.
    const { error: lockErr } = await db
      .from('fantasy_rooms')
      .update({ status: 'locked' })
      .eq('status', 'waiting')
      .lte('kickoff_at', new Date().toISOString())

    if (lockErr) console.error('[cron] waiting→locked transition failed:', lockErr.message)

    // Find all rooms that are currently active
    const { data: rooms, error } = await db
      .from('fantasy_rooms')
      .select('id, match_id, status')
      .in('status', ['locked', 'live'])

    if (error) throw error
    if (!rooms || rooms.length === 0) {
      return NextResponse.json({ ok: true, triggered: 0, message: 'No active rooms' })
    }

    // De-duplicate: one API call per unique match, regardless of how many rooms share it
    const seen = new Set<string>()
    const uniqueMatchIds: string[] = []
    for (const r of rooms) {
      if (r.match_id && !seen.has(r.match_id)) {
        seen.add(r.match_id)
        uniqueMatchIds.push(r.match_id)
      }
    }

    // Fire scoring engine ONCE per match — it fans out to all rooms internally
    const results = await Promise.allSettled(
      uniqueMatchIds.map(matchId =>
        fetch(`${BASE}/api/scoring/match/${matchId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SECRET}`,
            'Content-Type': 'application/json',
          },
        }).then(r => r.json()),
      ),
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed    = results.filter(r => r.status === 'rejected').length

    return NextResponse.json({
      ok:           true,
      activeRooms:  rooms.length,
      matchesScored: uniqueMatchIds.length,
      succeeded,
      failed,
      matchIds:     uniqueMatchIds,
    })

  } catch (err: any) {
    console.error('[cron]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Health check
export async function POST() {
  return NextResponse.json({ ok: true, service: 'scoring-cron' })
}
