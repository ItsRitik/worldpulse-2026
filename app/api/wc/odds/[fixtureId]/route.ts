/**
 * GET /api/wc/odds/[fixtureId]
 * ═════════════════════════════
 * Implied win probabilities for a match, derived from real bookmaker odds
 * (API-Football /odds, Match Winner market). Averaged across bookmakers and
 * normalised so home + draw + away = 100.
 *
 * Cached 30 min: pre-match odds drift slowly.
 */

import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://v3.football.api-sports.io'

type OddsResponse = Array<{
  bookmakers: Array<{
    name: string
    bets: Array<{
      name: string
      values: Array<{ value: string; odd: string }>
    }>
  }>
}>

export async function GET(
  _req: NextRequest,
  { params }: { params: { fixtureId: string } },
) {
  const id = parseInt(params.fixtureId, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 })

  try {
    const res = await fetch(`${BASE}/odds?fixture=${id}`, {
      headers: { 'x-apisports-key': process.env.APIFOOTBALL_KEY!, Accept: 'application/json' },
      next: { revalidate: 1800 },
    })
    if (!res.ok) throw new Error(`odds HTTP ${res.status}`)
    const json = await res.json()
    const data = (json.response ?? []) as OddsResponse

    // Collect 1/odd for every bookmaker's Match Winner market
    const acc = { home: [] as number[], draw: [] as number[], away: [] as number[] }
    for (const entry of data) {
      for (const bm of entry.bookmakers ?? []) {
        const market = bm.bets?.find(b => b.name === 'Match Winner')
        if (!market) continue
        for (const v of market.values) {
          const p = 1 / parseFloat(v.odd)
          if (!isFinite(p)) continue
          if (v.value === 'Home') acc.home.push(p)
          if (v.value === 'Draw') acc.draw.push(p)
          if (v.value === 'Away') acc.away.push(p)
        }
      }
    }

    if (acc.home.length === 0) {
      return NextResponse.json(
        { available: false },
        { headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=600' } },
      )
    }

    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    const h = avg(acc.home), d = avg(acc.draw), a = avg(acc.away)
    const total = h + d + a   // normalise out the bookmaker margin

    return NextResponse.json(
      {
        available:  true,
        home:       Math.round((h / total) * 100),
        draw:       Math.round((d / total) * 100),
        away:       Math.round((a / total) * 100),
        bookmakers: acc.home.length,
      },
      { headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=600' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/wc/odds]', msg)
    return NextResponse.json({ available: false, error: msg }, { status: 502 })
  }
}
