/**
 * POST /api/room/[roomId]/sync
 * ═════════════════════════════
 * Self-healing trigger so a room progresses even without the Vercel cron
 * (local dev, or Hobby plan where per-minute cron isn't available).
 *
 * When a participant has the room open and the match has kicked off, the page
 * calls this. It:
 *   1. flips this room  waiting → locked  once kickoff has passed
 *   2. throttles: skips the API hit if the match was scored < 45 s ago
 *   3. otherwise runs the normal match scorer (server-side, with the secret),
 *      which scores players, flips locked → live, and on FT writes the winner.
 *
 * No client secret needed - the action only triggers scoring of a real match
 * and is idempotent. The heavy lifting still lives in /api/scoring/match/[id].
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const FINISHED = new Set(['finished', 'cancelled'])
const THROTTLE_MS = 45_000

export async function POST(
  _req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const db = adminClient()

  // Load the room
  const { data: room, error } = await db
    .from('fantasy_rooms')
    .select('id, match_id, status, kickoff_at')
    .eq('id', params.roomId)
    .single()

  if (error || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  // Nothing to do for completed rooms
  if (FINISHED.has(room.status)) {
    return NextResponse.json({ ok: true, status: room.status, scored: false })
  }

  // Match hasn't kicked off yet - stay waiting
  if (new Date(room.kickoff_at).getTime() > Date.now()) {
    return NextResponse.json({ ok: true, status: room.status, scored: false, reason: 'not_kicked_off' })
  }

  // Only real (numeric) fixtures can be scored from API-Football
  if (!/^\d+$/.test(room.match_id)) {
    return NextResponse.json({ ok: true, status: room.status, scored: false, reason: 'no_fixture' })
  }

  // 1. Lock the room if it's still waiting and kickoff has passed
  if (room.status === 'waiting') {
    await db.from('fantasy_rooms').update({ status: 'locked' }).eq('id', room.id)
  }

  // 2. Throttle - if any room on this match was scored very recently, skip the API hit
  const { data: recent } = await db
    .from('fantasy_live_state')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .eq('room_id', room.id)
    .maybeSingle()

  if (recent?.updated_at && Date.now() - new Date(recent.updated_at).getTime() < THROTTLE_MS) {
    return NextResponse.json({ ok: true, status: 'live', scored: false, reason: 'throttled' })
  }

  // 3. Run the match scorer (it owns all the writes + status transitions)
  const base   = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const secret = process.env.SCORING_SECRET ?? ''
  try {
    const res = await fetch(`${base}/api/scoring/match/${room.match_id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    })
    const json = await res.json()
    return NextResponse.json({ ok: res.ok, scored: res.ok, result: json })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, scored: false, error: msg }, { status: 502 })
  }
}
