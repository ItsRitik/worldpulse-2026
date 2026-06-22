/**
 * POST /api/scoring/match/[matchId]
 * ═══════════════════════════════════
 * The core live-scoring worker. Called every ~10 min by the cron for each
 * match that has at least one active fantasy room.
 *
 * ONE call per match, regardless of how many rooms are playing it.
 *
 * Flow:
 *  1. Fetch live events + player stats from API-Football         (1-2 API calls)
 *  2. Run the pure scoring engine → Map<playerId, PlayerScore>
 *  3. Upsert match_player_points (one row per player)            (1 DB upsert)
 *  4. Find all rooms using this match with status 'live'         (1 DB query)
 *  5. For each room: join host + guest picks against the scores  (in memory)
 *  6. Upsert fantasy_live_state per room                         (N DB upserts)
 *  7. Supabase Realtime broadcasts the upserts → both tabs update instantly
 *
 * Auth: Bearer token checked against SCORING_SECRET env var.
 */

import { NextResponse }       from 'next/server'
import { createClient }       from '@supabase/supabase-js'
import { getFixture, getFixtureEvents, getPlayerStats } from '@/lib/api/apifootball'
import { scoreMatch, applyMultiplier }                  from '@/lib/scoring/engine'
import { teamTla }                                      from '@/lib/api/tla'
import type { FantasyPick }                             from '@/lib/supabase/types'

// Admin Supabase client - bypasses RLS so we can write to restricted tables
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

function authorized(req: Request): boolean {
  const secret = process.env.SCORING_SECRET
  const auth   = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function POST(
  req: Request,
  { params }: { params: { matchId: string } },
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { matchId } = params
  const fixtureId   = parseInt(matchId, 10)

  if (isNaN(fixtureId)) {
    return NextResponse.json({ error: 'Invalid matchId' }, { status: 400 })
  }

  const supabase = adminClient()

  try {
    // ── Step 1: Fetch from API-Football ─────────────────────────────────────
    const [fixture, events, stats] = await Promise.all([
      getFixture(fixtureId),
      getFixtureEvents(fixtureId),
      getPlayerStats(fixtureId),
    ])

    if (!fixture) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
    }

    const matchStatus = fixture.fixture.status.short   // '1H' | 'HT' | '2H' | 'FT' …
    const matchMinute = fixture.fixture.status.elapsed ?? null
    const homeScore   = fixture.goals.home ?? 0
    const awayScore   = fixture.goals.away ?? 0
    const isFinished  = matchStatus === 'FT' || matchStatus === 'AET' || matchStatus === 'PEN'

    // ── Step 2: Score every player ───────────────────────────────────────────
    const playerScores = scoreMatch(events, stats, matchStatus, matchMinute)

    const tlaByTeamId: Record<number, string> = {
      [fixture.teams.home.id]: teamTla(fixture.teams.home.name),
      [fixture.teams.away.id]: teamTla(fixture.teams.away.name),
    }

    // ── Step 2.5: Append-only points log ─────────────────────────────────────
    // The API only exposes running totals for stats, so we log DELTAS: diff the
    // engine's current per-player/per-type totals against what's already in
    // match_points_log and append only the new points, stamped with the minute
    // they were assigned (true event minute for goals/cards, current match
    // minute for stat-derived points). Entries are never rewritten.
    const TIMED_TYPES = new Set([
      'goal', 'assist', 'own_goal', 'missed_penalty',
      'yellow_card', 'red_card', 'sub_appearance', 'starting_xi',
    ])
    const LOG_LABEL: Record<string, string> = {
      goal: 'Goal', assist: 'Assist', own_goal: 'Own goal', missed_penalty: 'Missed penalty',
      yellow_card: 'Yellow card', red_card: 'Red card', sub_appearance: 'Came on',
      starting_xi: 'Starting XI', shot_on_target: 'Shot on target', passes_bonus: 'Pass bonus',
      chance_created: 'Chance created', tackle_won: 'Tackle won', interception: 'Interception',
      save: 'Save', penalty_save: 'Penalty saved', clean_sheet: 'Clean sheet', goals_conceded: 'Goal conceded',
    }

    type LogRow = {
      match_id: string; api_player_id: number; player_name: string; team_tla: string
      minute: number; event_type: string; points: number; label: string
    }
    let matchLog: LogRow[] = []
    let logAvailable = true

    const { data: prevLog, error: logReadErr } = await supabase
      .from('match_points_log')
      .select('api_player_id, player_name, team_tla, minute, event_type, points, label')
      .eq('match_id', String(fixtureId))

    if (logReadErr) {
      logAvailable = false
      console.error('[scoring/match] match_points_log read failed (run migration-2026-06-12-points-log.sql):', logReadErr.message)
    } else {
      const loggedSum = new Map<string, number>()
      for (const r of prevLog ?? []) {
        const k = `${r.api_player_id}:${r.event_type}`
        loggedSum.set(k, (loggedSum.get(k) ?? 0) + Number(r.points))
      }

      const newRows: LogRow[] = []
      for (const ps of Array.from(playerScores.values())) {
        const cur = new Map<string, { pts: number; min: number }>()
        for (const ev of ps.events) {
          const c = cur.get(ev.type) ?? { pts: 0, min: 0 }
          c.pts += ev.points
          c.min = Math.max(c.min, ev.minute)
          cur.set(ev.type, c)
        }
        for (const [type, c] of Array.from(cur.entries())) {
          const delta = +(c.pts - (loggedSum.get(`${ps.api_player_id}:${type}`) ?? 0)).toFixed(2)
          if (Math.abs(delta) < 0.01) continue
          newRows.push({
            match_id:      String(fixtureId),
            api_player_id: ps.api_player_id,
            player_name:   ps.player_name,
            team_tla:      tlaByTeamId[ps.team_id] ?? String(ps.team_id),
            minute:        TIMED_TYPES.has(type) ? c.min : (matchMinute ?? 90),
            event_type:    type,
            points:        delta,
            label:         LOG_LABEL[type] ?? type.replace(/_/g, ' '),
          })
        }
      }

      if (newRows.length > 0) {
        const { error: insErr } = await supabase.from('match_points_log').insert(newRows)
        if (insErr) console.error('[scoring/match] match_points_log insert error:', insErr.message)
      }
      matchLog = [
        ...(prevLog ?? []).map(r => ({ ...r, match_id: String(fixtureId), points: Number(r.points) })),
        ...newRows,
      ]
    }

    // ── Step 3: Upsert match_player_points ───────────────────────────────────
    // One row per player - overwrite on every tick
    if (playerScores.size > 0) {
      const mppRows = Array.from(playerScores.values()).map(ps => ({
        match_id:      String(fixtureId),
        api_player_id: ps.api_player_id,
        player_name:   ps.player_name,
        team_tla:      tlaByTeamId[ps.team_id] ?? String(ps.team_id),
        position:      ps.position,
        base_points:   ps.base_points,
        events:        ps.events,
        match_minute:  matchMinute,
        match_status:  matchStatus,
        updated_at:    new Date().toISOString(),
      }))

      const { error: mppErr } = await supabase
        .from('match_player_points')
        .upsert(mppRows, { onConflict: 'match_id,api_player_id' })

      if (mppErr) {
        console.error('[scoring/match] match_player_points upsert error:', mppErr.message)
      }
    }

    // ── Step 4: Active rooms on this match ───────────────────────────────────
    const { data: rooms, error: roomsErr } = await supabase
      .from('fantasy_rooms')
      .select('id, status')
      .eq('match_id', String(fixtureId))
      .in('status', ['locked', 'live'])

    if (roomsErr || !rooms || rooms.length === 0) {
      return NextResponse.json({ ok: true, playersScored: playerScores.size, roomsUpdated: 0, matchStatus })
    }

    const roomIds = rooms.map((r: { id: string }) => r.id)

    // Members (the leaderboard) + every pick across these rooms
    const [{ data: members }, { data: allPicks }] = await Promise.all([
      supabase.from('fantasy_room_members').select('room_id, user_id').in('room_id', roomIds),
      supabase.from('fantasy_picks').select('*').in('room_id', roomIds),
    ])
    const picks = (allPicks ?? []) as FantasyPick[]

    // Per-(room,user) total from the scored players (captain ×2 / VC ×1.5)
    const MULT: Record<string, number> = { captain: 2, vice_captain: 1.5, player: 1 }
    const totalFor = (roomId: string, userId: string): number => {
      let t = 0
      for (const p of picks) {
        if (p.room_id !== roomId || p.user_id !== userId) continue
        const sc = playerScores.get(p.api_player_id)
        if (sc) t += applyMultiplier(sc.base_points, p.role as 'captain' | 'vice_captain' | 'player')
      }
      return +t.toFixed(2)
    }

    const membersByRoom = new Map<string, string[]>()
    for (const m of (members ?? []) as { room_id: string; user_id: string }[]) {
      if (!membersByRoom.has(m.room_id)) membersByRoom.set(m.room_id, [])
      membersByRoom.get(m.room_id)!.push(m.user_id)
    }

    const memberUpserts: Array<{ room_id: string; user_id: string; total_points: number; rank: number }> = []
    const liveStateUpserts: Array<Record<string, unknown>> = []
    const roomStatusUpdates: Array<{ id: string; status: string; winner_id: string | null }> = []

    // ── Step 5: per-room leaderboard + status transitions ────────────────────
    for (const room of rooms as { id: string; status: string }[]) {
      const userIds = membersByRoom.get(room.id) ?? []
      const board = userIds
        .map(uid => ({ user_id: uid, total: totalFor(room.id, uid) }))
        .sort((a, b) => b.total - a.total)

      board.forEach((b, i) => memberUpserts.push({
        room_id: room.id, user_id: b.user_id, total_points: b.total, rank: i + 1,
      }))

      liveStateUpserts.push({
        room_id:      room.id,
        match_minute: matchMinute,
        match_status: matchStatus,
        home_score:   homeScore,
        away_score:   awayScore,
        updated_at:   new Date().toISOString(),
      })

      if (isFinished && room.status !== 'finished') {
        roomStatusUpdates.push({ id: room.id, status: 'finished', winner_id: board[0]?.user_id ?? null })
      } else if (room.status === 'locked') {
        roomStatusUpdates.push({ id: room.id, status: 'live', winner_id: null })
      }
    }

    // Per-pick points → team sheets show each player's live score
    const pickUpserts = picks.map(pick => {
      const score = playerScores.get(pick.api_player_id)
      const base  = score?.base_points ?? 0
      const mult  = MULT[pick.role] ?? 1
      return { ...pick, base_points: base, multiplier: mult, total_points: +(base * mult).toFixed(2) }
    })
    if (pickUpserts.length > 0) {
      const { error: pickErr } = await supabase
        .from('fantasy_picks').upsert(pickUpserts, { onConflict: 'room_id,user_id,api_player_id' })
      if (pickErr) console.error('[scoring/match] picks upsert:', pickErr.message)
    }

    // Leaderboard
    if (memberUpserts.length > 0) {
      const { error: memErr } = await supabase
        .from('fantasy_room_members').upsert(memberUpserts, { onConflict: 'room_id,user_id' })
      if (memErr) console.error('[scoring/match] members upsert:', memErr.message)
    }

    // Match score/status per room
    const { error: lsErr } = await supabase
      .from('fantasy_live_state').upsert(liveStateUpserts, { onConflict: 'room_id' })
    if (lsErr) console.error('[scoring/match] live_state upsert:', lsErr.message)

    // Room status transitions
    for (const u of roomStatusUpdates) {
      await supabase.from('fantasy_rooms').update({ status: u.status, winner_id: u.winner_id }).eq('id', u.id)
    }

    return NextResponse.json({
      ok:             true,
      matchId,
      matchStatus,
      matchMinute,
      score:          `${homeScore}-${awayScore}`,
      playersScored:  playerScores.size,
      roomsUpdated:   rooms.length,
      roomsFlippedLive:     roomStatusUpdates.filter(r => r.status === 'live').length,
      roomsFlippedFinished: roomStatusUpdates.filter(r => r.status === 'finished').length,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[scoring/match] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
