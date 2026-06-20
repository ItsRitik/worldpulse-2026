/**
 * GET /api/wc/lineups/[fixtureId]
 * ════════════════════════════════
 * Returns the pickable player pool for a real match, normalised to the
 * same shape the pick page uses for dummy matches (LineupPlayer).
 *
 * Source priority:
 *   1. Confirmed lineups (startXI + bench) — available ~1 h before kickoff.
 *      Starters get a small price premium so budget choices matter.
 *   2. Fallback: full squads of both teams (/players/squads) so users can
 *      pre-build a team before the XI is announced.
 *
 * Response: { players, source: 'lineup' | 'squad', home, away }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getWCFixture,
  getLineups,
  getTeamSquad,
  getTeamWCForm,
  type AFLineup,
  type AFSquadPlayer,
  type AFWCForm,
} from '@/lib/api/apifootball'
import { teamTla } from '@/lib/api/tla'
import { pricePlayers } from '@/lib/api/playerPrices'
import { basePrice } from '@/lib/pricing'
import type { LineupPlayer } from '@/lib/types'

type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

const POS_SHORT: Record<string, Position> = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' }
const POS_LONG: Record<string, Position> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD',
}

// Placeholder price; overwritten by form-based credits before responding.
function price(pos: Position): number {
  return basePrice(pos)
}

function playerPhoto(id: number) {
  return `https://media.api-sports.io/football/players/${id}.png`
}

function teamLogo(id: number) {
  return `https://media.api-sports.io/football/teams/${id}.png`
}

function fromLineups(lineups: AFLineup[], matchId: string): LineupPlayer[] {
  const players: LineupPlayer[] = []
  for (const team of lineups) {
    const tla  = teamTla(team.team.name)
    const logo = team.team.logo ?? teamLogo(team.team.id)
    for (const { starters, list } of [
      { starters: true,  list: team.startXI },
      { starters: false, list: team.substitutes },
    ]) {
      for (const { player } of list) {
        if (!player?.id) continue
        const pos = POS_SHORT[player.pos] ?? 'MID'
        players.push({
          id:            player.id,
          match_id:      matchId,
          api_player_id: player.id,
          name:          player.name,
          team_tla:      tla,
          position:      pos,
          jersey_number: player.number ?? null,
          price:         price(pos),
          is_starter:    starters,
          photo:         player.photo ?? playerPhoto(player.id),
          team_logo:     logo,
        })
      }
    }
  }
  return players
}

function fromSquad(squad: AFSquadPlayer[], tla: string, matchId: string, logo: string): LineupPlayer[] {
  return squad
    .filter(p => p.id && p.name)
    .map(p => {
      const pos = POS_LONG[p.position] ?? 'MID'
      return {
        id:            p.id,
        match_id:      matchId,
        api_player_id: p.id,
        name:          p.name,
        team_tla:      tla,
        position:      pos,
        jersey_number: p.number ?? null,
        price:         price(pos),
        is_starter:    false,
        photo:         p.photo ?? playerPhoto(p.id),
        team_logo:     logo,
      }
    })
}

/** Overwrite placeholder prices with real form-based credits (club + WC form). */
async function applyPrices(players: LineupPlayer[], homeId: number, awayId: number): Promise<void> {
  try {
    // WC tournament form for both teams (cheap, cached) → boosts in-form players
    const [homeWC, awayWC] = await Promise.all([
      getTeamWCForm(homeId).catch(() => ({} as Record<number, AFWCForm>)),
      getTeamWCForm(awayId).catch(() => ({} as Record<number, AFWCForm>)),
    ])
    const wc: Record<number, AFWCForm> = { ...homeWC, ...awayWC }
    const map = await pricePlayers(players.map(p => ({ id: p.api_player_id, position: p.position })), wc)
    for (const p of players) p.price = map.get(p.api_player_id) ?? basePrice(p.position)
  } catch {
    // pricing unavailable → keep position-base placeholders (team building still works)
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { fixtureId: string } },
) {
  const id = parseInt(params.fixtureId, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 })
  }

  try {
    const [fixture, lineups] = await Promise.all([
      getWCFixture(id),
      getLineups(id).catch(() => [] as AFLineup[]),
    ])

    if (!fixture) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
    }

    const home = { id: fixture.teams.home.id, name: fixture.teams.home.name, tla: teamTla(fixture.teams.home.name), logo: fixture.teams.home.logo ?? teamLogo(fixture.teams.home.id) }
    const away = { id: fixture.teams.away.id, name: fixture.teams.away.name, tla: teamTla(fixture.teams.away.name), logo: fixture.teams.away.logo ?? teamLogo(fixture.teams.away.id) }

    // Confirmed lineups out for both teams → use them
    if (lineups.length === 2 && lineups.every(l => l.startXI.length > 0)) {
      const players = fromLineups(lineups, params.fixtureId)
      await applyPrices(players, home.id, away.id)
      return NextResponse.json(
        { players, source: 'lineup', home, away },
        { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' } },
      )
    }

    // Fallback: full squads so teams can be built before the XI drops
    const [homeSquad, awaySquad] = await Promise.all([
      getTeamSquad(home.id).catch(() => [] as AFSquadPlayer[]),
      getTeamSquad(away.id).catch(() => [] as AFSquadPlayer[]),
    ])

    const players = [
      ...fromSquad(homeSquad, home.tla, params.fixtureId, home.logo),
      ...fromSquad(awaySquad, away.tla, params.fixtureId, away.logo),
    ]

    if (players.length === 0) {
      return NextResponse.json(
        { error: 'No player data available for this match yet — try again closer to kickoff' },
        { status: 404 },
      )
    }

    await applyPrices(players, home.id, away.id)
    return NextResponse.json(
      { players, source: 'squad', home, away },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=600' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/wc/lineups]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
