/**
 * GET /api/wc/fixtures
 *
 * Server-side route — APIFOOTBALL_KEY is never exposed to the client.
 *
 * Returns all WC 2026 fixtures sorted:
 *   1. Live matches first (1H, HT, 2H, ET, P)
 *   2. Finished matches (most recent first)
 *   3. Upcoming / not started (chronological)
 *
 * Also returns fixtures grouped by date (YYYY-MM-DD in local time) and
 * a summary of live/today/total counts.
 *
 * Cached for 60 seconds on the CDN edge — fine for production.
 * During live matches, the client polls every 30s via SWR.
 */

import { NextResponse } from 'next/server'
import { getWCFixtures, type AFWCFixture } from '@/lib/api/apifootball'

// Status codes that mean the match is live
const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

function statusWeight(short: string): number {
  if (LIVE_STATUSES.has(short))     return 0   // live → show first
  if (FINISHED_STATUSES.has(short)) return 2   // finished → show after live
  return 1                                      // upcoming → show after live, before finished ... actually: live, then upcoming, then finished? Let's do live → upcoming → finished
}

// Actually: show live first, then upcoming (chronological), then finished (most recent first)
// Weight: live=0, upcoming=1, finished=2
function sortFixtures(fixtures: AFWCFixture[]): AFWCFixture[] {
  return [...fixtures].sort((a, b) => {
    const wa = statusWeight(a.fixture.status.short)
    const wb = statusWeight(b.fixture.status.short)

    if (wa !== wb) return wa - wb

    const da = new Date(a.fixture.date).getTime()
    const db = new Date(b.fixture.date).getTime()

    // For live: sort by elapsed minute desc (most advanced game first)
    if (wa === 0) {
      const ea = a.fixture.status.elapsed ?? 0
      const eb = b.fixture.status.elapsed ?? 0
      return eb - ea
    }

    // For upcoming: chronological (earliest first)
    if (wa === 1) return da - db

    // For finished: most recent first
    return db - da
  })
}

// Date string in the fixture's local date (we use UTC date YYYY-MM-DD as key)
function dateKey(isoDate: string): string {
  return isoDate.slice(0, 10)  // "2026-06-11"
}

export async function GET() {
  try {
    const raw = await getWCFixtures()

    const sorted = sortFixtures(raw)

    // Group by date
    const byDate: Record<string, AFWCFixture[]> = {}
    for (const f of sorted) {
      const key = dateKey(f.fixture.date)
      if (!byDate[key]) byDate[key] = []
      byDate[key].push(f)
    }

    // Group by round (for filtering)
    const byRound: Record<string, AFWCFixture[]> = {}
    for (const f of sorted) {
      const round = f.league.round
      if (!byRound[round]) byRound[round] = []
      byRound[round].push(f)
    }

    // Unique rounds sorted
    const rounds = Object.keys(byRound).sort()

    const liveCount    = raw.filter(f => LIVE_STATUSES.has(f.fixture.status.short)).length
    const finishedCount = raw.filter(f => FINISHED_STATUSES.has(f.fixture.status.short)).length

    // Today's date key (UTC)
    const todayKey = new Date().toISOString().slice(0, 10)
    const todayCount = (byDate[todayKey] ?? []).length

    return NextResponse.json(
      {
        fixtures:  sorted,
        byDate,
        byRound,
        rounds,
        liveCount,
        finishedCount,
        todayCount,
        total:     raw.length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': liveCount > 0
            ? 's-maxage=30, stale-while-revalidate=10'   // live: refresh every 30s
            : 's-maxage=60, stale-while-revalidate=30',  // no live: 60s cache
        },
      }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/wc/fixtures]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
