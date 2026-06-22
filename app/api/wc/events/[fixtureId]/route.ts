/**
 * GET /api/wc/events/[fixtureId]
 *
 * Lazy-loaded server route - called when user expands a live or finished fixture card.
 * For live matches the client polls every 15s. For finished matches, cache for 24h.
 * APIFOOTBALL_KEY stays server-side only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getFixtureEvents } from '@/lib/api/apifootball'

export async function GET(
  _req: NextRequest,
  { params }: { params: { fixtureId: string } }
) {
  const id = parseInt(params.fixtureId, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 })
  }

  try {
    const events = await getFixtureEvents(id)

    // Determine if this is a live match by checking query param hint from client
    // Default to short cache (assume live) so data stays fresh
    const isFinished = _req.nextUrl.searchParams.get('status') === 'FT'

    return NextResponse.json(
      { events, count: events.length, timestamp: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': isFinished
            ? 's-maxage=86400, stale-while-revalidate=3600'  // FT: cache 24h
            : 's-maxage=15, stale-while-revalidate=10',       // Live: cache 15s
        },
      }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[/api/wc/events/${id}]`, msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
