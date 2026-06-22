/**
 * GET /api/wc/match/[fixtureId]
 *
 * Returns everything needed for the match detail page in one call:
 *   fixture  - full WC fixture (venue, referee, score, status)
 *   lineups  - starting XI + bench for both teams (empty [] if not announced yet)
 *   prediction - win/draw/loss % + comparison + H2H (null if unavailable)
 *   events   - goals, cards, subs (empty [] pre-kickoff)
 *
 * All sub-calls run in parallel. Any single failure degrades gracefully.
 *
 * Cache: 15s for live matches, 24h for finished, 5min for upcoming.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getWCFixture,
  getLineups,
  getFixturePrediction,
  getFixtureEvents,
} from '@/lib/api/apifootball'

const LIVE_STATUSES     = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

export async function GET(
  _req: NextRequest,
  { params }: { params: { fixtureId: string } }
) {
  const id = parseInt(params.fixtureId, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 })

  // Parallel fetch - individual failures return null/[]
  const [fixture, lineups, prediction, events] = await Promise.allSettled([
    getWCFixture(id),
    getLineups(id),
    getFixturePrediction(id),
    getFixtureEvents(id),
  ])

  if (fixture.status === 'rejected' || !fixture.value) {
    return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
  }

  const status = fixture.value.fixture.status.short
  const isLive     = LIVE_STATUSES.has(status)
  const isFinished = FINISHED_STATUSES.has(status)

  const cacheControl = isLive
    ? 's-maxage=15, stale-while-revalidate=10'
    : isFinished
    ? 's-maxage=86400, stale-while-revalidate=3600'
    : 's-maxage=300, stale-while-revalidate=60'

  return NextResponse.json(
    {
      fixture:    fixture.value,
      lineups:    lineups.status    === 'fulfilled' ? lineups.value    : [],
      prediction: prediction.status === 'fulfilled' ? prediction.value : null,
      events:     events.status     === 'fulfilled' ? events.value     : [],
      timestamp:  new Date().toISOString(),
    },
    { headers: { 'Cache-Control': cacheControl } }
  )
}
