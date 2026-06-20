/**
 * GET /api/wc/standings
 *
 * Server-side route — APIFOOTBALL_KEY stays server-only.
 *
 * Returns all WC 2026 group standings (Groups A–H), each with:
 *   - group name
 *   - table: [ { rank, team, points, goalsDiff, all, home, away, form } ]
 *
 * Cached for 2 minutes (standings don't change mid-match, only at FT).
 */

import { NextResponse } from 'next/server'
import { getWCStandings } from '@/lib/api/apifootball'

export async function GET() {
  try {
    const standings = await getWCStandings()

    return NextResponse.json(
      {
        standings,
        total:     standings.length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 's-maxage=120, stale-while-revalidate=60',
        },
      }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/wc/standings]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
