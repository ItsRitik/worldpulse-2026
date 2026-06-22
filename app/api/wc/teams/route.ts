/**
 * GET /api/wc/teams
 * ══════════════════
 * All 48 World Cup 2026 teams (id, name, tla, logo) from API-Football.
 * Used by the onboarding favourite-team picker. Cached 24 h - the field is fixed.
 */

import { NextResponse } from 'next/server'
import { teamTla } from '@/lib/api/tla'

const BASE = 'https://v3.football.api-sports.io'

export type WCTeam = { id: number; name: string; tla: string; logo: string }

export async function GET() {
  try {
    const res = await fetch(`${BASE}/teams?league=1&season=2026`, {
      headers: { 'x-apisports-key': process.env.APIFOOTBALL_KEY!, Accept: 'application/json' },
      next: { revalidate: 86400 },
    })
    if (!res.ok) throw new Error(`teams HTTP ${res.status}`)
    const json = await res.json()

    const teams: WCTeam[] = (json.response ?? [])
      .map((t: any) => ({
        id:   t.team.id,
        name: t.team.name,
        tla:  t.team.code || teamTla(t.team.name),
        logo: t.team.logo,
      }))
      .sort((a: WCTeam, b: WCTeam) => a.name.localeCompare(b.name))

    return NextResponse.json(
      { teams },
      { headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/wc/teams]', msg)
    return NextResponse.json({ error: msg, teams: [] }, { status: 502 })
  }
}
