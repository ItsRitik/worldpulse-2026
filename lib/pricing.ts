/**
 * Player credit pricing — Dream11-style.
 * A player's value (≈7.5–12.5 credits, budget is 100 for 11) is driven by their
 * most recent club-season form: minutes-weighted match rating, goal involvement
 * per 90, season output volume, and how regularly they start. Stars land ~11–12.5,
 * regular starters ~9–10.5, squad/fringe ~7.5–8.5 — so you can't field all stars.
 */

export type Pos = 'GK' | 'DEF' | 'MID' | 'FWD'

export type SeasonStat = {
  games: { appearences: number | null; minutes: number | null; position: string | null; rating: string | null }
  goals: { total: number | null; assists: number | null }
}

/** A player's World Cup 2026 form so far (small sample, recency-weighted) */
export type WCForm = {
  minutes: number
  goals:   number
  assists: number
  rating:  number | null
  apps:    number
}

// Neutral base when a player has no usable season data (young/uncapped)
const BASE: Record<Pos, number> = { GK: 8.0, DEF: 8.0, MID: 8.5, FWD: 9.0 }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const roundHalf = (x: number) => Math.round(x * 2) / 2

export function basePrice(pos: Pos): number {
  return BASE[pos]
}

export function creditFromSeason(stats: SeasonStat[], pos: Pos, wc?: WCForm): number {
  let mins = 0, apps = 0, goals = 0, assists = 0, rNum = 0, rDen = 0
  for (const s of stats) {
    const m = s.games.minutes ?? 0
    apps    += s.games.appearences ?? 0
    mins    += m
    goals   += s.goals.total ?? 0
    assists += s.goals.assists ?? 0
    const r = s.games.rating ? parseFloat(s.games.rating) : NaN
    if (!isNaN(r) && m > 0) { rNum += r * m; rDen += m }
  }

  // Start from the club-season baseline (or neutral if no season data)
  let credit = mins === 0 ? BASE[pos] : 7.5
  if (mins > 0) {
    const rating = rDen > 0 ? rNum / rDen : 6.7
    const per90  = (goals + assists) / (mins / 90)
    credit += clamp((rating - 6.7) * 3.2, 0, 3)                  // rating
    const outW   = pos === 'FWD' ? 2.2 : pos === 'MID' ? 1.8 : pos === 'DEF' ? 1.0 : 0.4
    const outCap = pos === 'FWD' ? 2.8 : pos === 'MID' ? 2.2 : pos === 'DEF' ? 1.2 : 0.6
    credit += clamp(per90 * outW, 0, outCap)                      // goal involvement / 90
    if (pos !== 'GK') credit += clamp(goals * 0.06 + assists * 0.04, 0, 1.5)  // volume
    if (mins >= 2000) credit += 0.7
    else if (mins >= 1000) credit += 0.4                          // regular starter
    if (pos === 'GK') credit += clamp((apps - 15) * 0.03, 0, 0.8)
  }

  // ── World Cup form overlay (small sample → bounded, but moves the price) ──
  // A hot tournament makes a player pricier; a poor one nudges them cheaper.
  if (wc && wc.minutes >= 45) {
    if (wc.rating != null) credit += clamp((wc.rating - 7.0) * 0.6, -1.0, 1.2)
    const wcOut = pos === 'GK' ? 0 : (wc.goals * 0.4 + wc.assists * 0.2)
    credit += clamp(wcOut, 0, 1.8)
    if (pos === 'GK' && wc.rating != null && wc.rating >= 7.5) credit += 0.4  // standout keeper display
  }

  return roundHalf(clamp(credit, 7.5, 12.5))
}
