/**
 * GET /api/wc/team/[teamId]
 *
 * Returns everything for the team page:
 *   team     — { id, name, logo, country, code }
 *   coach    — head coach info (null if unavailable)
 *   squad    — players grouped ready for frontend (raw list sorted by position)
 *   fixtures — all WC 2026 fixtures for this team (sorted by date)
 *
 * Cached for 1 hour — squad and coach don't change during the tournament.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getTeamSquad,
  getTeamCoach,
  getTeamWCFixtures,
} from '@/lib/api/apifootball'

export async function GET(
  _req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  const id = parseInt(params.teamId, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 })

  const [squadRes, coachRes, fixturesRes] = await Promise.allSettled([
    getTeamSquad(id),
    getTeamCoach(id),
    getTeamWCFixtures(id),
  ])

  const squad    = squadRes.status    === 'fulfilled' ? squadRes.value    : []
  const coach    = coachRes.status    === 'fulfilled' ? coachRes.value    : null
  const fixtures = fixturesRes.status === 'fulfilled' ? fixturesRes.value : []

  if (squad.length === 0 && fixtures.length === 0) {
    return NextResponse.json({ error: 'Team not found or no data available' }, { status: 404 })
  }

  // Sort fixtures chronologically
  const sortedFixtures = [...fixtures].sort(
    (a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
  )

  // Sort squad: GK → DEF → MID → FWD, then by number
  const posOrder: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 }
  const sortedSquad = [...squad].sort((a, b) => {
    const po = (posOrder[a.position] ?? 4) - (posOrder[b.position] ?? 4)
    if (po !== 0) return po
    return (a.number ?? 99) - (b.number ?? 99)
  })

  return NextResponse.json(
    {
      squad:     sortedSquad,
      coach,
      fixtures:  sortedFixtures,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=1800' } }
  )
}
