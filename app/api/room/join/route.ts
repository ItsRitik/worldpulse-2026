/**
 * POST /api/room/join
 * ════════════════════
 * Resolve a contest by short code (or roomId) and validate it can be entered.
 * Does NOT add a member — you enter by building a team (see the picks route).
 * This just gets the caller to the right room with a clear early error.
 *
 * Body: { code } | { roomId }
 * Returns: { roomId, entered }   // entered = already has a team here
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


export async function POST(req: NextRequest) {
  const uid = await currentUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json().catch(() => null)
  const code   = b?.code ? String(b.code).trim().toUpperCase() : null
  const roomId = b?.roomId ? String(b.roomId) : null
  if (!code && !roomId) return NextResponse.json({ error: 'Enter a room code' }, { status: 400 })

  const db = admin()

  const q = db.from('fantasy_rooms').select('id, status, max_players, kickoff_at, host_id')
  const { data: room } = roomId ? await q.eq('id', roomId).maybeSingle()
                                : await q.eq('room_code', code).maybeSingle()

  if (!room) return NextResponse.json({ error: 'No contest found for that code.' }, { status: 404 })

  // Already entered here? send them straight in (idempotent)
  const { data: existing } = await db
    .from('fantasy_room_members')
    .select('user_id')
    .eq('room_id', room.id).eq('user_id', uid).maybeSingle()
  if (existing) return NextResponse.json({ roomId: room.id, entered: true })

  // Early, friendly errors before navigating
  if (room.status !== 'waiting' || new Date(room.kickoff_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Entries are closed — that match has started.' }, { status: 409 })
  }
  if (room.host_id !== uid) {
    const { count } = await db
      .from('fantasy_room_members').select('*', { count: 'exact', head: true }).eq('room_id', room.id)
    if ((count ?? 0) >= room.max_players) {
      return NextResponse.json({ error: `This contest is full (${room.max_players} managers).` }, { status: 409 })
    }
  }

  // Resolved + enterable — the room page will prompt "build your team to enter"
  return NextResponse.json({ roomId: room.id, entered: false })
}
