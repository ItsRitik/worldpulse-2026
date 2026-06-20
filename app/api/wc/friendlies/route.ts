/**
 * GET /api/wc/friendlies
 *
 * Returns International Friendly (league=10) fixtures for 2026 that involve
 * at least one FIFA World Cup 2026 qualified team.
 *
 * Strategy:
 *  - Fetch WC fixtures (league=1) to derive the exact set of 48 WC team IDs
 *  - Fetch all 2026 friendlies (league=10) in parallel
 *  - Filter: exclude youth matches, keep only fixtures with ≥1 WC team
 *  - Sort: live → upcoming (chronological) → finished (reverse-chrono, last 3 days)
 *
 * Both upstream calls are cached by Next.js (s-maxage headers on those routes
 * are respected by the CDN). Here we cache 60s if any live, 10min otherwise.
 */

import { NextResponse } from 'next/server'
import { getWCFixtures, getInternationalFriendlies } from '@/lib/api/apifootball'
import type { AFWCFixture } from '@/lib/api/apifootball'

const LIVE_STATUSES     = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

// Regex to detect youth / reserve team names
const YOUTH_RE = /\bU\d{2}\b|U-\d{2}|Under[-\s]?\d{2}|Youth|Junior|Reserve|B\s*Team|II\b/i

function isYouth(f: AFWCFixture) {
  return YOUTH_RE.test(f.teams.home.name) || YOUTH_RE.test(f.teams.away.name)
}

export async function GET() {
  // Parallel: WC team roster + friendly fixtures
  const [wcResult, friendlyResult] = await Promise.allSettled([
    getWCFixtures(),
    getInternationalFriendlies(2026),
  ])

  if (friendlyResult.status === 'rejected') {
    return NextResponse.json({ error: 'Failed to fetch friendly fixtures' }, { status: 502 })
  }

  // Build set of WC-qualified team IDs
  const wcTeamIds = new Set<number>()
  if (wcResult.status === 'fulfilled') {
    wcResult.value.forEach(f => {
      wcTeamIds.add(f.teams.home.id)
      wcTeamIds.add(f.teams.away.id)
    })
  }

  const allFriendlies = friendlyResult.value

  // Filter: no youth, at least one WC team
  // If WC fixtures unavailable (API error), fall back to name-based heuristic
  const hasWcIds = wcTeamIds.size > 0
  const filtered = allFriendlies.filter(f => {
    if (isYouth(f)) return false
    if (hasWcIds) {
      return wcTeamIds.has(f.teams.home.id) || wcTeamIds.has(f.teams.away.id)
    }
    // Fallback: rough name match if WC fixtures unavailable
    const combined = (f.teams.home.name + ' ' + f.teams.away.name).toLowerCase()
    return WC_TEAM_NAMES.some(n => combined.includes(n))
  })

  // Sort: live first, then upcoming (asc), then finished (desc, last 5 days only)
  const now = Date.now()
  const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000

  const live     = filtered.filter(f => LIVE_STATUSES.has(f.fixture.status.short))
    .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime())

  const upcoming = filtered.filter(f => f.fixture.status.short === 'NS')
    .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime())

  const finished = filtered
    .filter(f => FINISHED_STATUSES.has(f.fixture.status.short))
    .filter(f => now - new Date(f.fixture.date).getTime() < FIVE_DAYS)
    .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime())

  const sorted = [...live, ...upcoming, ...finished]

  const hasLive = live.length > 0
  const cacheControl = hasLive
    ? 's-maxage=30, stale-while-revalidate=15'
    : 's-maxage=600, stale-while-revalidate=120'

  return NextResponse.json(
    {
      fixtures:      sorted,
      liveCount:     live.length,
      upcomingCount: upcoming.length,
      finishedCount: finished.length,
      total:         sorted.length,
      timestamp:     new Date().toISOString(),
    },
    { headers: { 'Cache-Control': cacheControl } }
  )
}

// ── Fallback name list (used only if WC fixtures API call fails) ──────────────
const WC_TEAM_NAMES = [
  'argentina','brazil','france','england','germany','spain','portugal','netherlands',
  'usa','united states','mexico','morocco','japan','south korea','australia',
  'senegal','croatia','switzerland','poland','denmark','serbia','iran',
  'ghana','cameroon','ecuador','canada','saudi arabia','belgium','uruguay',
  'colombia','peru','chile','costa rica','jamaica','honduras','panama',
  'el salvador','trinidad','nigeria','ivory coast','mali','egypt','algeria',
  'tunisia','south africa','new zealand','wales','scotland','turkey','czech',
  'austria','hungary','ukraine','russia','greece','romania','slovakia','slovenia',
]
