/**
 * GET /api/wc/predictions/[fixtureId]
 *
 * Lazy-loaded server route — only called when user expands an upcoming fixture card.
 * Predictions don't change often, so we cache aggressively (1 hour).
 * APIFOOTBALL_KEY stays server-side only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getFixturePrediction } from '@/lib/api/apifootball'

export async function GET(
  _req: NextRequest,
  { params }: { params: { fixtureId: string } }
) {
  const id = parseInt(params.fixtureId, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 })
  }

  try {
    const prediction = await getFixturePrediction(id)

    if (!prediction) {
      return NextResponse.json(
        { error: 'No prediction available for this fixture' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { prediction, timestamp: new Date().toISOString() },
      {
        headers: {
          // Predictions are stable — cache for 1 hour on CDN, serve stale for up to 30 min more
          'Cache-Control': 's-maxage=3600, stale-while-revalidate=1800',
        },
      }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[/api/wc/predictions/${id}]`, msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
