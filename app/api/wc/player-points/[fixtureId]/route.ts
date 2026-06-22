/**
 * GET /api/wc/player-points/[fixtureId]
 * ══════════════════════════════════════
 * Live fantasy points for EVERY player in a match, sorted high → low.
 * Powers the "Player points" tab on the match page and the top-scorer
 * strip on live match cards.
 *
 * Computed on demand from API-Football (events + player stats) using the
 * same pure scoring engine the 1v1 rooms use - so card points always match
 * room points. Cached 60 s while live, 1 h once finished.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFixture, getFixtureEvents, getPlayerStats } from '@/lib/api/apifootball'
import { scoreMatch } from '@/lib/scoring/engine'
import { teamTla } from '@/lib/api/tla'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export type PointsLogEntry = {
  id:            number
  api_player_id: number
  player_name:   string
  team_tla:      string
  minute:        number
  event_type:    string
  points:        number
  label:         string
}

const LIVE_STATUSES     = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

export type PlayerPointsRow = {
  api_player_id: number
  name:          string
  position:      string          // G / D / M / F
  points:        number
  team_id:       number
  team_tla:      string
  team_logo:     string
  photo:         string
  events:        { type: string; minute: number; points: number; label: string }[]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { fixtureId: string } },
) {
  const id = parseInt(params.fixtureId, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 })
  }

  try {
    const fixture = await getFixture(id)
    if (!fixture) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
    }

    const status   = fixture.fixture.status.short
    const isLive   = LIVE_STATUSES.has(status)
    const isDone   = FINISHED_STATUSES.has(status)

    // Before kickoff there are no points yet
    if (!isLive && !isDone) {
      return NextResponse.json(
        { matchStatus: status, elapsed: null, players: [] },
        { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' } },
      )
    }

    const [events, stats] = await Promise.all([
      getFixtureEvents(id),
      getPlayerStats(id),
    ])

    const scores = scoreMatch(events, stats, status, fixture.fixture.status.elapsed)

    const teamMeta: Record<number, { tla: string; logo: string }> = {
      [fixture.teams.home.id]: {
        tla:  teamTla(fixture.teams.home.name),
        logo: `https://media.api-sports.io/football/teams/${fixture.teams.home.id}.png`,
      },
      [fixture.teams.away.id]: {
        tla:  teamTla(fixture.teams.away.name),
        logo: `https://media.api-sports.io/football/teams/${fixture.teams.away.id}.png`,
      },
    }

    // Persisted append-only points log - written by the scoring cron with the
    // minute each delta was assigned. Null when the table/log isn't available.
    let log: PointsLogEntry[] | null = null
    try {
      const { data: logRows, error: logErr } = await adminClient()
        .from('match_points_log')
        .select('id, api_player_id, player_name, team_tla, minute, event_type, points, label')
        .eq('match_id', params.fixtureId)
        .order('minute', { ascending: false })
        .order('id', { ascending: false })
        .limit(400)
      if (!logErr && logRows) {
        log = logRows.map(r => ({ ...r, points: Number(r.points) })) as PointsLogEntry[]
      }
    } catch { /* table missing - page falls back to computed events */ }

    const players: PlayerPointsRow[] = Array.from(scores.values())
      .map(ps => ({
        api_player_id: ps.api_player_id,
        name:          ps.player_name,
        position:      ps.position,
        points:        ps.base_points,
        team_id:       ps.team_id,
        team_tla:      teamMeta[ps.team_id]?.tla ?? String(ps.team_id),
        team_logo:     teamMeta[ps.team_id]?.logo ?? '',
        photo:         `https://media.api-sports.io/football/players/${ps.api_player_id}.png`,
        events:        ps.events,
      }))
      .sort((a, b) => b.points - a.points)

    return NextResponse.json(
      {
        matchStatus: status,
        elapsed:     fixture.fixture.status.elapsed,
        score:       `${fixture.goals.home ?? 0}-${fixture.goals.away ?? 0}`,
        players,
        log,
        timestamp:   new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': isLive
            ? 's-maxage=60, stale-while-revalidate=30'
            : 's-maxage=3600, stale-while-revalidate=600',
        },
      },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/wc/player-points]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
