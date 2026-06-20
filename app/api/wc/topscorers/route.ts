/**
 * GET /api/wc/topscorers
 * ═══════════════════════
 * Live Golden Boot race for WC 2026 from API-Football /players/topscorers.
 * Cached 30 min: it only moves when goals go in.
 */

import { NextResponse } from 'next/server'

const BASE = 'https://v3.football.api-sports.io'

export type TopScorer = {
  id:        number
  name:      string
  photo:     string
  team:      string
  team_logo: string
  goals:     number
  assists:   number
  matches:   number
}

export async function GET() {
  try {
    const res = await fetch(`${BASE}/players/topscorers?league=1&season=2026`, {
      headers: { 'x-apisports-key': process.env.APIFOOTBALL_KEY!, Accept: 'application/json' },
      next: { revalidate: 1800 },
    })
    if (!res.ok) throw new Error(`topscorers HTTP ${res.status}`)
    const json = await res.json()

    const scorers: TopScorer[] = (json.response ?? []).slice(0, 10).map((p: any) => {
      const st = p.statistics?.[0] ?? {}
      return {
        id:        p.player.id,
        name:      p.player.name,
        photo:     p.player.photo ?? `https://media.api-sports.io/football/players/${p.player.id}.png`,
        team:      st.team?.name ?? '',
        team_logo: st.team?.logo ?? '',
        goals:     st.goals?.total ?? 0,
        assists:   st.goals?.assists ?? 0,
        matches:   st.games?.appearences ?? 0,
      }
    })

    return NextResponse.json(
      { scorers, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=600' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/wc/topscorers]', msg)
    return NextResponse.json({ error: msg, scorers: [] }, { status: 502 })
  }
}
