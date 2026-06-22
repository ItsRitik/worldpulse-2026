/**
 * POST /api/room/create
 * ═══════════════════════
 * Creates a contest room (the caller is the host) with a unique short code,
 * and adds the host as the first member. Server-side so room + membership are
 * created together with the service role.
 *
 * Body: { match_id, match_label, home_team_tla, away_team_tla, kickoff_at, max_players? }
 * Returns: { roomId, code }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { currentUserId } from '@/lib/auth'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}


// No ambiguous chars (0/O/1/I)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function makeCode(len = 6) {
  let c = ''
  for (let i = 0; i < len; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return c
}

export async function POST(req: NextRequest) {
  const uid = await currentUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json().catch(() => null)
  if (!b?.match_id || !b?.kickoff_at) {
    return NextResponse.json({ error: 'Missing match details' }, { status: 400 })
  }

  const db = admin()
  const maxPlayers = Math.min(Math.max(parseInt(b.max_players, 10) || 100, 2), 100)

  // Generate a code that isn't already taken (retry a few times)
  let code = makeCode()
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await db.from('fantasy_rooms').select('id').eq('room_code', code).maybeSingle()
    if (!clash) break
    code = makeCode()
  }

  const { data: room, error } = await db
    .from('fantasy_rooms')
    .insert({
      match_id:      String(b.match_id),
      match_label:   b.match_label ?? 'Match',
      home_team_tla: b.home_team_tla ?? 'HOM',
      away_team_tla: b.away_team_tla ?? 'AWA',
      kickoff_at:    b.kickoff_at,
      lock_at:       b.kickoff_at,
      host_id:       uid,
      room_code:     code,
      max_players:   maxPlayers,
      status:        'waiting',
    })
    .select('id, room_code')
    .single()

  if (error || !room) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create room' }, { status: 500 })
  }

  // No member row yet - the host enters the contest by building their team
  // (membership = a submitted 11-player team). host_id marks ownership.
  return NextResponse.json({ roomId: room.id, code: room.room_code })
}
