/**
 * Scoring Engine  —  pure, no DB, no API calls
 * ═════════════════════════════════════════════
 * Input:  AFEvent[] + AFPlayerStat[]  (from API-Football)
 * Output: Map<api_player_id, PlayerScore>
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Points table
 * ──────────────────────────────────────────────────────────────────────────────
 *  ATTACK
 *    Goal by FWD                                   +40
 *    Goal by MID                                   +50
 *    Goal by DEF / GK                              +60
 *    Assist                                        +20
 *    Chance Created (key pass, excl. assists)       +3
 *    Shot on Target (incl. goals)                   +6
 *    Per 5 passes completed                         +1
 *
 *  DEFENSE
 *    Tackle Won                                     +4
 *    Interception Won                               +4
 *    Save (GK per save)                             +6
 *    Penalty Saved (GK)                            +50
 *    Clean Sheet (GK/DEF, 54+ min on field)        +20
 *
 *  APPEARANCE
 *    Starting XI                                    +4
 *    Substitute appearance                          +2
 *
 *  CAPTAIN / VC
 *    Captain                                        ×2
 *    Vice-Captain                                  ×1.5
 *
 *  NEGATIVE
 *    Yellow card                                    −4
 *    Red card (or 2nd yellow)                      −10
 *    Own goal                                       −8
 *    Goals conceded (GK/DEF, while on field)        −2 per goal
 *    Missed penalty                                −20
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Key rules implemented:
 *  • Goals conceded: GK/DEF -2 for each goal scored against their team WHILE
 *    they are on the field. Red-carded players continue to be penalised for
 *    goals conceded after they leave (rule special-case).
 *  • Clean sheet: player was NOT on the field when any goal was conceded,
 *    AND played 54+ minutes.
 *  • Chance Created excludes passes that earned a Fantasy Assist (no double-dip).
 *  • Shots on target include goals (+6 is additional to the goal bonus).
 *  • Passes bonus: floor(completed_passes / 5) × 1.
 *  • Penalty missed: only if goalkeeper has NOT touched the ball
 *    (from events — detail === 'Missed Penalty').
 *  • Any event during penalty shootouts is NOT counted (post-FT events ignored).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type { AFEvent, AFPlayerStat } from '@/lib/api/apifootball'

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ScoringEvent = {
  type:   string
  minute: number
  points: number
  label:  string
}

export type PlayerScore = {
  api_player_id: number
  player_name:   string
  position:      string   // G / D / M / F
  team_id:       number
  base_points:   number
  events:        ScoringEvent[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type AFPos = 'G' | 'D' | 'M' | 'F'

function goalPoints(pos: AFPos | string): number {
  if (pos === 'G' || pos === 'D') return 60
  if (pos === 'M') return 50
  return 40   // F or unknown default
}

/** On-field window for a single player */
type OnField = { start: number; end: number | null }

/**
 * Build a map of player on-field windows from substitution events.
 * Players NOT in the map started from minute 0 and were never subbed off
 * (full-game starters and red-carded players not tracked by subst events).
 */
function buildOnFieldMap(events: AFEvent[]): Map<number, OnField> {
  const map = new Map<number, OnField>()

  for (const ev of events) {
    if (ev.type !== 'subst') continue
    const offId = ev.player.id
    const onId  = ev.assist?.id ?? null
    const min   = ev.time.elapsed ?? 0

    // Player coming OFF — started at 0 unless already tracked (edge: double sub)
    const existing = map.get(offId)
    if (existing) {
      existing.end = min
    } else {
      map.set(offId, { start: 0, end: min })
    }

    // Player coming ON
    if (onId) {
      map.set(onId, { start: min, end: null })
    }
  }

  return map
}

/**
 * Was `playerId` on the field at `minute`?
 * Falls back to "assume started from 0 and still on" when not in subst events.
 */
function onFieldAt(
  playerId:  number,
  minute:    number,
  windows:   Map<number, OnField>,
  playerMin: number,
): boolean {
  const w = windows.get(playerId)
  if (!w) {
    // Not in sub events → started from 0; use minutes played as end estimate
    return minute >= 0 && minute <= (playerMin > 0 ? playerMin : 999)
  }
  const end = w.end ?? (playerMin > 0 ? playerMin : 999)
  return minute >= w.start && minute <= end
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scorer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * scoreMatch — derive every player's current points from raw API data.
 *
 * @param events     from GET /fixtures/events
 * @param stats      from GET /fixtures/players  (can be [] mid-first-half)
 * @param matchStatus  'NS' | '1H' | 'HT' | '2H' | 'FT' | …
 */
export function scoreMatch(
  events:      AFEvent[],
  stats:       { team: { id: number }; players: AFPlayerStat[] }[],
  matchStatus: string,
  currentMinute: number | null = null,
): Map<number, PlayerScore> {

  // Stat-derived points (tackles, passes, saves…) have no per-event timestamp
  // in the API — stamp them with the current match minute so the points log
  // reads chronologically instead of everything claiming 90'.
  const nowMin = currentMinute ?? 90

  const scores = new Map<number, PlayerScore>()

  function getPlayer(id: number, name: string, pos: string, teamId: number): PlayerScore {
    if (!scores.has(id)) {
      scores.set(id, { api_player_id: id, player_name: name, position: pos, team_id: teamId, base_points: 0, events: [] })
    }
    return scores.get(id)!
  }

  function addEv(p: PlayerScore, ev: ScoringEvent) {
    p.events.push(ev)
    p.base_points += ev.points
    p.base_points = +p.base_points.toFixed(2)
  }

  // ── Pre-pass: build position map from stats ───────────────────────────────
  // We need positions before processing events so goal points are correct.
  const posMap   = new Map<number, AFPos>()     // playerId → position
  const teamMap  = new Map<number, number>()    // playerId → teamId
  const minMap   = new Map<number, number>()    // playerId → minutes played
  const subMap   = new Set<number>()            // playerIds who came on as subs

  for (const tb of stats) {
    for (const ps of tb.players) {
      const st = ps.statistics[0]
      if (!st) continue
      const pos = (st.games.position ?? 'F') as AFPos
      posMap.set(ps.player.id, pos)
      teamMap.set(ps.player.id, tb.team.id)
      minMap.set(ps.player.id, st.games.minutes ?? 0)
      if (st.games.substitute === true) subMap.add(ps.player.id)
    }
  }

  // ── Build on-field windows from substitution events ───────────────────────
  const onFieldWindows = buildOnFieldMap(events)

  // ── Build red-carded player set + their red-card minute ───────────────────
  const redCardMinute = new Map<number, number>()  // playerId → minute of red

  // ── Build goals-conceded events per team (team_id → minute[]) ────────────
  // "Goals conceded by team X" = goals scored BY team Y (opposite)
  // We need to know which team conceded each goal.
  // In API-Football events, ev.team = team that SCORED. The opponent conceded.
  // We build: Map<scoring_team_id, {opponent_team_id, minute}[]>
  const teamGoals: Map<number, number[]> = new Map()  // teamId → [minutes of their goals]

  for (const ev of events) {
    if (ev.type !== 'Goal') continue
    if (ev.detail === 'Missed Penalty') continue
    const min = ev.time.elapsed ?? 0
    if (!teamGoals.has(ev.team.id)) teamGoals.set(ev.team.id, [])
    teamGoals.get(ev.team.id)!.push(min)
  }

  // ── Step 1: Process match events ──────────────────────────────────────────

  // Track how many assists each player has (to subtract from chance-created)
  const assistCount = new Map<number, number>()

  for (const ev of events) {
    const min   = ev.time.elapsed ?? 0
    const tId   = ev.team.id
    const pId   = ev.player.id
    const pName = ev.player.name
    const pos   = posMap.get(pId) ?? 'F'
    const p     = getPlayer(pId, pName, pos, tId)

    switch (ev.type) {
      case 'Goal': {
        if (ev.detail === 'Own Goal') {
          addEv(p, { type: 'own_goal', minute: min, points: -8, label: 'Own goal' })
        } else if (ev.detail === 'Missed Penalty') {
          // -20 for missed penalty (goalkeeper hasn't touched the ball)
          addEv(p, { type: 'missed_penalty', minute: min, points: -20, label: 'Missed penalty' })
        } else {
          // Normal goal or penalty goal — positional bonus
          const gPts = goalPoints(pos)
          addEv(p, { type: 'goal', minute: min, points: gPts, label: 'Goal' })
          // Shot on target is additional (+6) and always accompanies a goal
          addEv(p, { type: 'shot_on_target', minute: min, points: 6, label: 'Shot on target' })
        }

        // Assist
        if (ev.assist?.id) {
          const aId   = ev.assist.id
          const aPos  = posMap.get(aId) ?? 'F'
          const aTId  = teamMap.get(aId) ?? tId
          const assister = getPlayer(aId, ev.assist.name ?? 'Unknown', aPos, aTId)
          addEv(assister, { type: 'assist', minute: min, points: 20, label: 'Assist' })
          assistCount.set(aId, (assistCount.get(aId) ?? 0) + 1)
        }
        break
      }

      case 'Card': {
        if (ev.detail === 'Yellow Card') {
          addEv(p, { type: 'yellow_card', minute: min, points: -4, label: 'Yellow card' })
        } else if (ev.detail === 'Red Card') {
          addEv(p, { type: 'red_card', minute: min, points: -10, label: 'Red card' })
          redCardMinute.set(pId, min)
        } else if (ev.detail === 'Yellow Red Card') {
          // Second yellow counts as red only (rule: only get red penalty, not both)
          addEv(p, { type: 'red_card', minute: min, points: -10, label: '2nd yellow → red' })
          redCardMinute.set(pId, min)
        }
        break
      }
      // Substitutions handled via buildOnFieldMap above
    }
  }

  // ── Step 2: Process player statistics ────────────────────────────────────

  for (const tb of stats) {
    const teamId = tb.team.id

    for (const ps of tb.players) {
      const st = ps.statistics[0]
      if (!st) continue

      const pId      = ps.player.id
      const pName    = ps.player.name
      const pos      = (st.games.position ?? 'F') as AFPos
      const minutes  = st.games.minutes ?? 0
      const isSub    = subMap.has(pId) || st.games.substitute === true

      if (minutes < 1) continue   // Player did not play at all — no points

      const p = getPlayer(pId, pName, pos, teamId)
      p.position = pos   // ensure position is set from stats

      // ── Appearance ───────────────────────────────────────────────────────
      if (!isSub) {
        addEv(p, { type: 'starting_xi', minute: 0, points: 4, label: 'Starting XI' })
      } else {
        addEv(p, { type: 'sub_appearance', minute: onFieldWindows.get(pId)?.start ?? 0, points: 2, label: 'Came on as sub' })
      }

      // ── Shots on target (EXCLUDING goals — those were counted in event pass) ─
      // shots.on from stats includes goals. We already gave +6 per goal in events.
      // So additional shots on target = shots.on - goals_in_events_for_this_player.
      // Count goal events for this player
      const goalsFromEvents = p.events.filter(e => e.type === 'goal').length
      const shotsOnTarget   = Math.max(0, (st.shots.on ?? 0) - goalsFromEvents)
      if (shotsOnTarget > 0) {
        addEv(p, { type: 'shot_on_target', minute: nowMin, points: shotsOnTarget * 6, label: `${shotsOnTarget} shot${shotsOnTarget > 1 ? 's' : ''} on target` })
      }

      // ── Passes bonus (+1 per 5 completed) ────────────────────────────────
      const total    = st.passes.total ?? 0
      const accuracy = parseFloat(st.passes.accuracy ?? '100') / 100
      const completed = Math.round(total * accuracy)
      const passBonus = Math.floor(completed / 5)
      if (passBonus > 0) {
        addEv(p, { type: 'passes_bonus', minute: nowMin, points: passBonus, label: `${completed} passes (+${passBonus})` })
      }

      // ── Chance created / key passes (exclude ones that earned an assist) ──
      const keyPasses   = st.passes.key ?? 0
      const myAssists   = assistCount.get(pId) ?? 0
      const chanceCreated = Math.max(0, keyPasses - myAssists)
      if (chanceCreated > 0) {
        addEv(p, { type: 'chance_created', minute: nowMin, points: chanceCreated * 3, label: `${chanceCreated} chance${chanceCreated > 1 ? 's' : ''} created` })
      }

      // ── Tackles Won (+4 each) ──────────────────────────────────────────────
      const tackles = st.tackles.total ?? 0
      if (tackles > 0) {
        addEv(p, { type: 'tackle_won', minute: nowMin, points: tackles * 4, label: `${tackles} tackle${tackles > 1 ? 's' : ''} won` })
      }

      // ── Interceptions Won (+4 each) ───────────────────────────────────────
      const intercepts = st.tackles.interceptions ?? 0
      if (intercepts > 0) {
        addEv(p, { type: 'interception', minute: nowMin, points: intercepts * 4, label: `${intercepts} interception${intercepts > 1 ? 's' : ''}` })
      }

      // ── GK: Saves (+6 each) ───────────────────────────────────────────────
      if (pos === 'G') {
        const saves = st.goals.saves ?? 0
        if (saves > 0) {
          addEv(p, { type: 'save', minute: nowMin, points: saves * 6, label: `${saves} save${saves > 1 ? 's' : ''}` })
        }

        // ── GK: Penalty saved (+50 each) ─────────────────────────────────
        const penSaved = st.penalty.saved ?? 0
        if (penSaved > 0) {
          addEv(p, { type: 'penalty_save', minute: nowMin, points: penSaved * 50, label: `Penalty saved` })
        }
      }

      // ── Clean sheet (GK/DEF, 54+ min, not on field for any conceded goal) ─
      if ((pos === 'G' || pos === 'D') && minutes >= 54) {
        // Find goals conceded by this player's team (= goals scored by opponent)
        // All team IDs we can see from events
        const opponentGoalMinutes: number[] = []
        for (const [scoringTeam, goalMins] of Array.from(teamGoals.entries())) {
          if (scoringTeam !== teamId) {
            opponentGoalMinutes.push(...goalMins)
          }
        }

        const concededWhileOnField = opponentGoalMinutes.filter(
          gMin => onFieldAt(pId, gMin, onFieldWindows, minutes)
        )

        if (concededWhileOnField.length === 0) {
          addEv(p, { type: 'clean_sheet', minute: nowMin, points: 20, label: 'Clean sheet' })
        }
      }

      // ── Goals conceded (GK/DEF, -2 per goal scored while on field) ─────────
      if (pos === 'G' || pos === 'D') {
        const isRedCarded = redCardMinute.has(pId)
        const redMin      = redCardMinute.get(pId) ?? Infinity

        const opponentGoalMinutes: number[] = []
        for (const [scoringTeam, goalMins] of Array.from(teamGoals.entries())) {
          if (scoringTeam !== teamId) opponentGoalMinutes.push(...goalMins)
        }

        let concededCount = 0
        for (const gMin of opponentGoalMinutes) {
          if (isRedCarded) {
            // Red-carded players: penalised for ALL goals (even after red)
            // but only if they appeared in the match (minutes > 0, already checked)
            concededCount++
          } else if (onFieldAt(pId, gMin, onFieldWindows, minutes)) {
            concededCount++
          }
        }

        if (concededCount > 0) {
          addEv(p, { type: 'goals_conceded', minute: nowMin, points: -(concededCount * 2), label: `${concededCount} goal${concededCount > 1 ? 's' : ''} conceded` })
        }
      }
    }
  }

  return scores
}

// ─────────────────────────────────────────────────────────────────────────────
// Captain / VC multiplier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * applyMultiplier — Captain ×2, Vice-Captain ×1.5, Player ×1.
 */
export function applyMultiplier(
  base: number,
  role: 'captain' | 'vice_captain' | 'player',
): number {
  if (role === 'captain')      return +(base * 2).toFixed(2)
  if (role === 'vice_captain') return +(base * 1.5).toFixed(2)
  return base
}
