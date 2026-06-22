/**
 * POST /api/room/[roomId]/picks  - submit/replace a team (this IS how you enter)
 * ════════════════════════════════════════════════════════════════════════════
 * Building a full 11-player team is what enters a manager into the contest.
 * On save we (atomically-ish): validate the squad, enforce capacity for new
 * entrants, write the picks, and upsert the fantasy_room_members entry. There
 * is no separate "join" - a member row only ever exists with a real team, so
 * the leaderboard can never show a teamless 0-point "winner".
 *
 * Clerk-authenticated; writes via the service role. Guards return clear errors.
 *
 * Body: { picks: Array<{ api_player_id, player_name, player_short, team_tla,
 *         position, jersey_number, price, role }> }
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

export async function POST(req: NextRequest, { params }: { params: { roomId: string } }) {
  const uid = await currentUserId()
  if (!uid) return NextResponse.json({ error: 'Please sign in to enter.' }, { status: 401 })

  const { roomId } = params
  const body  = await req.json().catch(() => null)
  const picks = Array.isArray(body?.picks) ? body.picks : null

  // ── Validate the squad ────────────────────────────────────────────────────
  if (!picks || picks.length !== 11) {
    return NextResponse.json({ error: 'Pick exactly 11 players before entering.' }, { status: 400 })
  }
  const captains = picks.filter((p: any) => p.role === 'captain').length
  const vcs      = picks.filter((p: any) => p.role === 'vice_captain').length
  if (captains !== 1 || vcs !== 1) {
    return NextResponse.json({ error: 'Pick exactly one captain and one vice-captain.' }, { status: 400 })
  }

  const db = admin()

  // ── Room must exist and still be open ─────────────────────────────────────
  const { data: room } = await db
    .from('fantasy_rooms').select('status, kickoff_at, host_id, max_players').eq('id', roomId).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Contest not found.' }, { status: 404 })
  if (room.status !== 'waiting' || new Date(room.kickoff_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Entries are closed - the match has started.' }, { status: 409 })
  }

  // ── Capacity (only for NEW entrants; host is always allowed in own room) ──
  const { data: existing } = await db
    .from('fantasy_room_members').select('user_id')
    .eq('room_id', roomId).eq('user_id', uid).maybeSingle()

  if (!existing && room.host_id !== uid) {
    const { count } = await db
      .from('fantasy_room_members').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    if ((count ?? 0) >= room.max_players) {
      return NextResponse.json({ error: `This contest is full (${room.max_players} managers).` }, { status: 409 })
    }
  }

  // ── Replace picks, then record the entry ──────────────────────────────────
  await db.from('fantasy_picks').delete().eq('room_id', roomId).eq('user_id', uid)

  const rows = picks.map((p: Record<string, unknown>) => ({
    room_id:       roomId,
    user_id:       uid,
    api_player_id: p.api_player_id,
    player_name:   p.player_name,
    player_short:  p.player_short,
    team_tla:      p.team_tla,
    position:      p.position,
    jersey_number: p.jersey_number ?? null,
    price:         p.price,
    role:          p.role,
  }))
  const { error: pickErr } = await db.from('fantasy_picks').insert(rows)
  if (pickErr) return NextResponse.json({ error: pickErr.message }, { status: 500 })

  const { error: memErr } = await db
    .from('fantasy_room_members')
    .upsert({ room_id: roomId, user_id: uid, is_host: room.host_id === uid }, { onConflict: 'room_id,user_id' })
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, entered: true })
}
