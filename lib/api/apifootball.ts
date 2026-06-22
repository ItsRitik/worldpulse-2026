/**
 * API-Football client  (api-sports.io)
 * ═════════════════════════════════════
 * Docs: https://www.api-football.com/documentation-v3
 *
 * Set APIFOOTBALL_KEY in .env.local
 * Free plan: 100 calls/day - plenty for dev.
 * Paid plans from $15/mo for production (unlimited calls on Standard).
 *
 * Used for:
 *   - Lineups   (~1 hr before kickoff)   → gate room creation + picks
 *   - Events    (every 10 min live)      → feed the scoring engine
 *   - Statistics (at 45' and FT)         → final player points
 */

const BASE = 'https://v3.football.api-sports.io'

function headers(): HeadersInit {
  const key = process.env.APIFOOTBALL_KEY
  if (!key) throw new Error('APIFOOTBALL_KEY is not set in environment')
  return {
    'x-apisports-key': key,
    'Accept': 'application/json',
  }
}

async function get<T>(
  path: string,
  params: Record<string, string | number> = {},
  // Slow-changing endpoints (lineups, squads, fixtures list) pass a revalidate
  // window so repeated identical requests are served from Next's data cache
  // instead of hitting API-Football every time (protects the per-minute limit).
  // Live endpoints (events, player stats, single live fixture) omit it → no-store.
  revalidateSeconds?: number,
): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))

  const res = await fetch(url.toString(), {
    headers: headers(),
    ...(revalidateSeconds != null
      ? { next: { revalidate: revalidateSeconds } }
      : { cache: 'no-store' as const }),
  })

  if (!res.ok) {
    throw new Error(`API-Football ${path} → HTTP ${res.status}`)
  }

  const json = await res.json()

  // API-Football wraps everything in { response: [...], errors: {...} }
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`)
  }

  return json.response as T
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AFFixtureStatus = {
  long:    string   // "Match Finished" | "First Half" | "Halftime" | "Not Started" …
  short:   string   // "FT" | "1H" | "HT" | "NS" | "2H" | "SUSP" | "PST" …
  elapsed: number | null  // current minute
}

export type AFFixture = {
  fixture: {
    id:     number
    status: AFFixtureStatus
  }
  teams: {
    home: { id: number; name: string }
    away: { id: number; name: string }
  }
  goals: {
    home: number | null
    away: number | null
  }
}

/** Full fixture record returned by /fixtures (includes venue, referee, round) */
export type AFWCFixture = {
  fixture: {
    id:       number
    date:     string      // ISO 8601
    referee:  string | null
    timezone: string
    venue: {
      id:   number | null
      name: string | null
      city: string | null
    }
    status: AFFixtureStatus
  }
  league: {
    id:     number
    name:   string
    round:  string        // "Group Stage - 1" | "Round of 16" | "Quarter-finals" …
    season: number
    logo:   string
    flag:   string | null
  }
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: {
    home: number | null
    away: number | null
  }
  score: {
    halftime:  { home: number | null; away: number | null }
    fulltime:  { home: number | null; away: number | null }
    extratime: { home: number | null; away: number | null }
    penalty:   { home: number | null; away: number | null }
  }
  /**
   * Match statistics - included by API-Football in /fixtures?id=X response
   * for live and finished matches. Absent (undefined) for upcoming matches.
   */
  statistics?: Array<{
    team: { id: number; name: string; logo: string }
    statistics: Array<{
      type:  string              // "Shots on Goal" | "Ball Possession" | "Total passes" …
      value: number | string | null
    }>
  }>
}

/** A single team row in the standings */
export type AFStandingItem = {
  rank:        number
  team:        { id: number; name: string; logo: string }
  points:      number
  goalsDiff:   number
  group:       string   // "Group A" … "Group H"
  form:        string   // e.g. "WWDL"
  status:      string   // "same" | "up" | "down"
  description: string | null   // "Promotion - World Cup" etc.
  all: {
    played: number
    win:    number
    draw:   number
    lose:   number
    goals:  { for: number; against: number }
  }
  home: {
    played: number; win: number; draw: number; lose: number
    goals:  { for: number; against: number }
  }
  away: {
    played: number; win: number; draw: number; lose: number
    goals:  { for: number; against: number }
  }
  update: string
}

/** One group's standings block */
export type AFStandingGroup = {
  group: string             // "Group A" … "Group H"
  table: AFStandingItem[]
}

/**
 * Prediction response for a single fixture.
 * Endpoint: GET /predictions?fixture=FIXTURE_ID
 * Returns win/draw/loss %, advice, estimated goals, comparison stats, and last 5 H2H.
 */
export type AFPrediction = {
  predictions: {
    winner:      { id: number | null; name: string | null; comment: string } | null
    advice:      string | null
    percent:     { home: string; draw: string; away: string }  // "60%", "25%", "15%"
    goals:       { home: string | null; away: string | null }  // "1.5", "0.8"
    win_or_draw: boolean | null
    under_over:  string | null  // "-2.5" or "+2.5"
  }
  comparison: {
    form:                 { home: string; away: string }
    att:                  { home: string; away: string }
    def:                  { home: string; away: string }
    poisson_distribution: { home: string; away: string }
    h2h:                  { home: string; away: string }
    total:                { home: string; away: string }
  }
  /** Last 5 head-to-head fixtures between the two teams */
  h2h: Array<{
    fixture: {
      date:   string
      venue:  { name: string | null; city: string | null }
      status: { short: string; elapsed: number | null }
    }
    league:  { name: string; season: number }
    teams: {
      home: { id: number; name: string; logo: string; winner: boolean | null }
      away: { id: number; name: string; logo: string; winner: boolean | null }
    }
    goals: { home: number | null; away: number | null }
    score: { fulltime: { home: number | null; away: number | null } }
  }>
}

/** A single match event (goal, card, sub, VAR, etc.) */
export type AFEvent = {
  time:   { elapsed: number; extra: number | null }
  team:   { id: number; name: string }
  player: { id: number; name: string }
  assist: { id: number | null; name: string | null }
  type:   'Goal' | 'Card' | 'subst' | 'Var'
  detail: string
  // Goal details:  "Normal Goal" | "Own Goal" | "Penalty" | "Missed Penalty"
  // Card details:  "Yellow Card" | "Red Card" | "Yellow Red Card"
  // Subst:         player = coming off, assist = coming on
}

/** Per-player statistics block (from /fixtures/statistics endpoint) */
export type AFPlayerStat = {
  player: { id: number; name: string }
  statistics: Array<{
    games: {
      minutes:    number | null   // minutes played
      position:   string | null   // "G" | "D" | "M" | "F"
      rating:     string | null
      substitute: boolean | null  // true if came on as a substitute
    }
    goals: {
      total:   number | null
      assists: number | null
      saves:   number | null   // GK only
      conceded: number | null  // GK only
    }
    cards: {
      yellow: number
      red:    number
    }
    penalty: {
      saved:   number | null
      missed:  number | null
    }
    shots: { total: number | null; on: number | null }
    passes: { total: number | null; key: number | null; accuracy: string | null }
    duels: { total: number | null; won: number | null }
    tackles: { total: number | null; blocks: number | null; interceptions: number | null }
    fouls:   { drawn: number | null; committed: number | null }
  }>
}

export type AFLineupPlayer = {
  player: {
    id:     number
    name:   string
    number: number
    pos:    string
    grid:   string | null
    photo?: string   // https://media.api-sports.io/football/players/{id}.png
  }
}

export type AFLineup = {
  team:       { id: number; name: string; logo?: string }
  formation:  string
  startXI:    AFLineupPlayer[]
  substitutes: AFLineupPlayer[]
}

// ─────────────────────────────────────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get live fixture status + score.
 * Pass `fixtureId` for a specific match, or omit to get all live.
 */
export async function getFixture(fixtureId: number): Promise<AFFixture | null> {
  const data = await get<AFFixture[]>('/fixtures', { id: fixtureId })
  return data[0] ?? null
}

/**
 * Get all events for a fixture (goals, cards, subs).
 * Use this every ~10 min during a live match.
 */
export async function getFixtureEvents(fixtureId: number): Promise<AFEvent[]> {
  return get<AFEvent[]>('/fixtures/events', { fixture: fixtureId })
}

/**
 * Get confirmed lineups for a fixture.
 * Available ~60 min before kickoff once the manager announces the starting XI.
 * Returns empty array if not yet announced.
 */
export async function getLineups(fixtureId: number): Promise<AFLineup[]> {
  return get<AFLineup[]>('/fixtures/lineups', { fixture: fixtureId }, 60)  // cache 60s
}

/**
 * Get player statistics for a fixture.
 * Available at half-time and full-time - includes minutes played, saves, etc.
 * Used to supplement event-based scoring (e.g. clean sheet, GK saves).
 */
export async function getPlayerStats(fixtureId: number): Promise<{ team: { id: number }; players: AFPlayerStat[] }[]> {
  return get<{ team: { id: number }; players: AFPlayerStat[] }[]>('/fixtures/players', { fixture: fixtureId })
}

/**
 * Quick helper: are lineups out for this fixture?
 */
export async function lineupsAvailable(fixtureId: number): Promise<boolean> {
  const lineups = await getLineups(fixtureId)
  return lineups.length > 0 && lineups[0].startXI.length === 11
}

/** Squad player returned by /players/squads?team=TEAM_ID */
export type AFSquadPlayer = {
  id:       number
  name:     string
  age:      number
  number:   number | null
  position: string   // "Goalkeeper" | "Defender" | "Midfielder" | "Attacker"
  photo:    string
}

/** Coach info from /coachs?team=TEAM_ID */
export type AFCoach = {
  id:          number
  name:        string
  firstname:   string
  lastname:    string
  age:         number
  nationality: string
  photo:       string
  team:        { id: number; name: string; logo: string }
}

/**
 * Get prediction data for a single fixture.
 * Includes win/draw/loss %, advice, estimated goals, comparison stats, last 5 H2H.
 * Available for upcoming & live matches. Cache this for at least 1 hour.
 */
export async function getFixturePrediction(fixtureId: number): Promise<AFPrediction | null> {
  const data = await get<AFPrediction[]>('/predictions', { fixture: fixtureId })
  return data[0] ?? null
}

/**
 * Get the full AFWCFixture (with venue, referee, round) for a single fixture.
 */
export async function getWCFixture(fixtureId: number): Promise<AFWCFixture | null> {
  const data = await get<AFWCFixture[]>('/fixtures', { id: fixtureId }, 30)  // cache 30s
  return data[0] ?? null
}

/** A player's per-competition stats for a season (used for credit pricing) */
export type AFSeasonStat = {
  games: { appearences: number | null; minutes: number | null; position: string | null; rating: string | null }
  goals: { total: number | null; assists: number | null }
}

/**
 * Get a player's club-season stats across all competitions for `season`.
 * Endpoint: /players?id=PLAYER_ID&season=YYYY. Cached 24h (form changes slowly).
 */
export async function getPlayerSeason(playerId: number, season: number): Promise<AFSeasonStat[]> {
  const data = await get<Array<{ statistics: AFSeasonStat[] }>>(
    '/players', { id: playerId, season }, 86400,
  )
  return data[0]?.statistics ?? []
}

/** A player's World Cup 2026 form so far */
export type AFWCForm = { minutes: number; goals: number; assists: number; rating: number | null; apps: number }

/**
 * Get every player's WC-2026 tournament form for a team, keyed by player id.
 * Endpoint: /players?team=TEAM_ID&season=2026&league=1 (paginated, 20/page).
 * One call per team (a few pages at most) - cached 30 min. Cheap vs. per-player.
 */
export async function getTeamWCForm(teamId: number): Promise<Record<number, AFWCForm>> {
  const out: Record<number, AFWCForm> = {}
  let page = 1
  while (page <= 3) {
    const rows = await get<Array<{ player: { id: number }; statistics: AFSeasonStat[] }>>(
      '/players', { team: teamId, season: 2026, league: 1, page }, 1800,
    )
    for (const r of rows) {
      const s = r.statistics?.[0]
      if (!s) continue
      const rating = s.games.rating ? parseFloat(s.games.rating) : null
      out[r.player.id] = {
        minutes: s.games.minutes ?? 0,
        goals:   s.goals.total ?? 0,
        assists: s.goals.assists ?? 0,
        rating:  rating != null && !isNaN(rating) ? rating : null,
        apps:    s.games.appearences ?? 0,
      }
    }
    if (rows.length < 20) break   // last page
    page++
  }
  return out
}

/**
 * Get the squad for a team (returns players without per-season stats - faster).
 * Endpoint: /players/squads?team=TEAM_ID
 */
export async function getTeamSquad(teamId: number): Promise<AFSquadPlayer[]> {
  const data = await get<Array<{ team: { id: number }; players: AFSquadPlayer[] }>>(
    '/players/squads', { team: teamId }, 3600,   // squads barely change - cache 1h
  )
  return data[0]?.players ?? []
}

/**
 * Get the current head coach for a team.
 * Endpoint: /coachs?team=TEAM_ID
 */
export async function getTeamCoach(teamId: number): Promise<AFCoach | null> {
  const data = await get<AFCoach[]>('/coachs', { team: teamId })
  return data[0] ?? null
}

/**
 * Get all WC 2026 fixtures for a specific team.
 * Endpoint: /fixtures?team=TEAM_ID&league=1&season=2026
 */
export async function getTeamWCFixtures(teamId: number): Promise<AFWCFixture[]> {
  return get<AFWCFixture[]>('/fixtures', { team: teamId, league: 1, season: 2026 })
}

/**
 * Get ALL FIFA World Cup 2026 fixtures (league=1, season=2026).
 * Returns the full fixture list with venue, referee, round, score.
 * Use server-side only - protects APIFOOTBALL_KEY.
 *
 * API-Football free plan: 100 calls/day, so cache this liberally.
 */
export async function getWCFixtures(): Promise<AFWCFixture[]> {
  return get<AFWCFixture[]>('/fixtures', { league: 1, season: 2026 })
}

/**
 * Get all International Friendlies (league=10) for a given season.
 * Used to surface pre-WC warm-up matches.
 * Filter out youth fixtures (team names containing U17/U21/U23 etc.) server-side.
 */
export async function getInternationalFriendlies(season = 2026): Promise<AFWCFixture[]> {
  return get<AFWCFixture[]>('/fixtures', { league: 10, season })
}

/** Display name for the best-third-placed ranking table */
export const THIRD_PLACE_GROUP = 'Best 3rd placed teams'

/**
 * Get FIFA World Cup 2026 group standings.
 *
 * API-Football returns 13 tables for WC 2026:
 *   "Group Stage - Group A" … "Group Stage - Group L"  (4 teams each)
 *   "Group Stage"                                       (12 teams - the
 *    third-place ranking; the best 8 advance to the Round of 32)
 *
 * We normalise names to "Group A" … "Group L" + THIRD_PLACE_GROUP and order
 * the groups A → L with the third-place table LAST.
 */
export async function getWCStandings(): Promise<AFStandingGroup[]> {
  const raw = await get<Array<{
    league: {
      standings: AFStandingItem[][]
    }
  }>>('/standings', { league: 1, season: 2026 })

  if (!raw || raw.length === 0) return []

  const allGroups = raw[0].league.standings
  const result: AFStandingGroup[] = []

  for (const groupRows of allGroups) {
    if (!groupRows || groupRows.length === 0) continue
    const rawName = groupRows[0].group           // "Group Stage - Group A" | "Group Stage"
    const m = rawName.match(/Group ([A-Z])$/)
    const groupName = m ? `Group ${m[1]}` : THIRD_PLACE_GROUP
    result.push({ group: groupName, table: groupRows })
  }

  // Group A … Group L first, third-place ranking last
  result.sort((a, b) => {
    const a3 = a.group === THIRD_PLACE_GROUP ? 1 : 0
    const b3 = b.group === THIRD_PLACE_GROUP ? 1 : 0
    return a3 - b3 || a.group.localeCompare(b.group)
  })
  return result
}
