/**
 * DELETE /api/room/[roomId]/members?userId=...
 * ═════════════════════════════════════════════
 * Host-only: remove a manager (their entry + team) from the contest before
 * kickoff. Useful for kicking accidental/abandoned entries.
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

export async function DELETE(req: NextRequest, { params }: { params: { roomId: string } }) {
  const uid = await currentUserId()
  if (!uid) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const target = req.nextUrl.searchParams.get('userId')
  if (!target) return NextResponse.json({ error: 'Missing manager.' }, { status: 400 })

  const db = admin()
  const { data: room } = await db
    .from('fantasy_rooms').select('host_id, status, kickoff_at').eq('id', params.roomId).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Contest not found.' }, { status: 404 })

  if (room.host_id !== uid) {
    return NextResponse.json({ error: 'Only the host can remove managers.' }, { status: 403 })
  }
  if (room.status !== 'waiting' || new Date(room.kickoff_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Managers can only be removed before kickoff.' }, { status: 409 })
  }
  if (target === room.host_id) {
    return NextResponse.json({ error: 'The host can’t be removed.' }, { status: 400 })
  }

  // Remove their team + entry
  await db.from('fantasy_picks').delete().eq('room_id', params.roomId).eq('user_id', target)
  const { error } = await db.from('fantasy_room_members').delete().eq('room_id', params.roomId).eq('user_id', target)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
